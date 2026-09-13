import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const ESPN_URL = 'https://www.espn.com.ar/futbol/equipo/calendario/_/id/15/racing-club';

// Argentina usa UTC-3 todo el año (sin horario de verano)
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;

const DIAS = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];
const MESES = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'];

// ESPN bloquea el scraping directo (AWS WAF), así que vamos vía el lector r.jina.ai
async function obtenerHtml() {
  const res = await fetch(`https://r.jina.ai/${ESPN_URL}`, {
    headers: {
      'X-Return-Format': 'html',
    },
    next: { revalidate: 3600 }
  });

  if (!res.ok) {
    throw new Error(`Error HTTP: ${res.status}`);
  }
  return await res.text();
}

function formatearFecha(iso) {
  const fecha = new Date(new Date(iso).getTime() + AR_OFFSET_MS);
  return `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]}`;
}

function formatearHora(iso) {
  const fecha = new Date(new Date(iso).getTime() + AR_OFFSET_MS);
  const hh = String(fecha.getUTCHours()).padStart(2, '0');
  const mm = String(fecha.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Extrae del JSON embebido los partidos con su fecha ISO real (por id de juego)
function extraerFechasISO($) {
  const fechas = new Map();
  const html = $.html();
  const inicio = html.indexOf('"events":[');
  if (inicio === -1) return fechas;

  let depth = 1; // el "[" inicial
  let fin = -1;
  for (let i = inicio + '"events":['.length; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        fin = i + 1;
        break;
      }
    }
  }
  if (fin === -1) return fechas;

  try {
    const eventos = JSON.parse(html.slice(inicio + '"events":'.length, fin));
    eventos.forEach((ev) => {
      if (!ev || ev.completed) return;
      fechas.set(ev.id, { iso: ev.date, tbd: ev.tbd });
    });
  } catch (e) {
    console.error('No se pudo parsear el JSON de partidos de ESPN:', e);
  }
  return fechas;
}

export async function GET() {
  try {
    const html = await obtenerHtml();
    const $ = cheerio.load(html);
    const fechasISO = extraerFechasISO($);

    const partidos = [];

    $('tr').filter((i, el) => $(el).find('[data-testid="localTeam"]').length > 0)
      .each((i, el) => {
        const $el = $(el);
        const fecha = $el.find('[data-testid="date"]').text().trim();
        const local = $el.find('[data-testid="localTeam"] a').first().text().trim();
        const visitante = $el.find('[data-testid="awayTeam"] a').first().text().trim();

        if (!fecha || !local || !visitante) return;

        const esLocal = local === 'Racing Club';
        const celdas = $el.find('td').map((_, td) => $(td).text().trim()).get();

        // El id del juego aparece en los enlaces del partido
        const enlace = $el.find('a[href*="juegoId"]').first().attr('href') || '';
        const juegoId = (enlace.match(/juegoId\/(\d+)/) || [])[1];

        const info = juegoId && fechasISO.get(juegoId);

        partidos.push({
          fecha,
          rival: esLocal ? visitante : local,
          esLocal,
          hora: celdas.find((t) => /AM|PM|P\.A\.?|POST|EN VIVO|SUSP/i.test(t)) || '',
          competencia: celdas.filter((t) => /Liga Profesional|Copa Argentina|Supercopa/i.test(t)).pop() || '',
          // Fechas corregidas a la hora local argentina (ESPN viene en UTC, corrido un día)
          fechaLocal: info ? formatearFecha(info.iso) : undefined,
          // La hora solo se muestra si el horario está confirmado por ESPN
          horaLocal: info && !info.tbd ? formatearHora(info.iso) : undefined,
        });
      });

    return NextResponse.json({
      success: true,
      data: partidos,
      fuente: 'ESPN',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener el calendario de ESPN:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo obtener el calendario en este momento.' },
      { status: 500 }
    );
  }
}