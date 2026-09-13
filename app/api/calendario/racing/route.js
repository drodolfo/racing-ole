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

// ESPN bloquea el scraping directo (AWS WAF), así que vamos vía el lector r.jina.ai
async function obtenerHtml() {
  const res = await fetch(`https://r.jina.ai/${CALENDARIO_URL}`, {
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

// Extrae del JSON embebido en la página los próximos partidos con su fecha ISO real (por id de juego)
function extraerPartidos(html) {
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