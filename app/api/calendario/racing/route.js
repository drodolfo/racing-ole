import { NextResponse } from 'next/server';

const CALENDARIO_URL = 'https://espndeportes.espn.com/futbol/equipo/calendario/_/id/15/racing-club';

// Argentina usa UTC-3 todo el año (sin horario de verano)
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;

const DIAS = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];
const MESES = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'];

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

// ESPN bloquea el scraping directo (AWS WAF), así que vamos vía el lector r.jina.ai.
// Con X-Return-Format: html jina nos devuelve la página de desafío de AWS WAF, así que
// si eso pasa, reintentamos en formato markdown (que sí devuelve el contenido real).
async function fetchJina(headers) {
  const res = await fetch(`https://r.jina.ai/${CALENDARIO_URL}`, {
    cache: 'no-store',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Error HTTP: ${res.status}`);
  }
  return await res.text();
}

function esPaginaWaf(texto) {
  return (
    texto.includes('AwsWafIntegration') ||
    texto.includes('awsWafCookieDomainList') ||
    texto.includes('challenge.js')
  );
}

async function obtenerHtml() {
  const html = await fetchJina({ 'X-Return-Format': 'html' });
  if (esPaginaWaf(html)) {
    return await fetchJina({});
  }
  return html;
}

function textoCelda(cell) {
  return cell
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[|]/g, '')
    .trim();
}

function anioPara(fechaStr) {
  const m = fechaStr.match(/(\d{1,2})\s+de\s+([A-Z][a-zé]{2,3})\.?$/);
  if (!m) return null;

  const dia = parseInt(m[1], 10);
  const mes = MESES.findIndex((x) => x.replace('.', '') === m[2] || x.startsWith(m[2]));
  if (mes === -1) return null;

  const hoy = new Date();
  for (const anio of [hoy.getFullYear(), hoy.getFullYear() + 1]) {
    const fecha = new Date(`${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00-03:00`);
    if (fecha >= hoy) return fecha;
  }
  return null;
}

// El formato markdown de jina trae la tabla del calendario: cada fila es
// | Dom., 27 de Sep. | TeamA | [v] + iconos | TeamB | 12:15 AM | Liga |  |
// La columna 1 (TeamA) es siempre el equipo local y el slug del juego (juegoId) es visitante-local.
function extraerPartidosMarkdown(md) {
  const esFilaFecha = /^\|\s*(S?[aá]b\.|Dom\.|Lun\.|Mar\.|Mi[ée]\.|Jue\.|Vie\.),\s*\d{1,2}\s+de\s+[A-Z][a-zé]{2,3}\.?\s*\|/;

  return md
    .split('\n')
    .filter((linea) => esFilaFecha.test(linea))
    .map((linea) => {
      const cells = linea.split('|').map((c) => c.trim());
      if (cells.length < 7) return null;

      const idTeamA = (cells[2].match(/id\/(\d+)/) || [])[1];
      const idTeamB = (cells[4].match(/id\/(\d+)/) || [])[1];
      if (!idTeamA || !idTeamB) return null;

      const esLocal = idTeamA === '15';
      const rival = textoCelda(esLocal ? cells[4] : cells[2]);
      const horaRaw = textoCelda(cells[5]);
      const hora = horaRaw.match(/\d{1,2}:\d{2}/)?.[0];
      const fechaISO = anioPara(cells[1]);

      if (!rival || !fechaISO) return null;

      return {
        fecha: fechaISO.toISOString(),
        rival,
        esLocal,
        competencia: textoCelda(cells[6]),
        fechaLocal: cells[1],
        horaLocal: hora,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

// Extrae del JSON embebido en la página HTML los próximos partidos con su fecha ISO real (por id de juego)
function extraerPartidosJsonHtml(html) {
  const inicio = html.indexOf('"events":[');
  if (inicio === -1) return [];

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
  if (fin === -1) return [];

  let eventos;
  try {
    eventos = JSON.parse(html.slice(inicio + '"events":'.length, fin));
  } catch (e) {
    console.error('No se pudo parsear el JSON de partidos de ESPN:', e);
    return [];
  }

  return (eventos || [])
    .filter((ev) => ev && ev.completed !== true)
    .map((ev) => {
      const home = (ev.competitors || []).find((c) => c.isHome);
      const away = (ev.competitors || []).find((c) => !c.isHome);
      if (!home || !away) return null;

      const esLocal = home.displayName === 'Racing Club';

      return {
        fecha: ev.date,
        rival: esLocal ? away.displayName : home.displayName,
        esLocal,
        competencia: ev.league || '',
        // Fechas corregidas a la hora local argentina (ESPN viene en UTC, corrido un día)
        fechaLocal: formatearFecha(ev.date),
        // La hora solo se muestra si el horario está confirmado por ESPN
        horaLocal: !ev.tbd ? formatearHora(ev.date) : undefined,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

function extraerPartidos(texto) {
  // La tabla markdown refleja la página real (sin lag). El JSON embebido
  // del HTML a veces queda desactualizado y omite partidos, por eso va primero.
  const markdown = extraerPartidosMarkdown(texto);
  if (markdown.length > 0) return markdown;
  return extraerPartidosJsonHtml(texto);
}

export async function GET() {
  try {
    const html = await obtenerHtml();
    const partidos = extraerPartidos(html);

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