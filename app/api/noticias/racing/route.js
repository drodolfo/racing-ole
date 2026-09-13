import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

// Extrae el cuerpo de la nota desde su propia página
async function extraerContenido(url) {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 3600 }
    });
    if (!res.ok) return '';
    const html = await res.text();
    const $ = cheerio.load(html);
    const texto = $('#storyBody').text().replace(/\s+/g, ' ').trim();

    // Cortamos a partir del bloque de notas relacionadas
    const indice = texto.indexOf('Mirá también');
    const cuerpo = indice === -1 ? texto : texto.slice(0, indice).trim();

    return cuerpo.length > 4200 ? `${cuerpo.slice(0, 6200)}...` : cuerpo;
  } catch (error) {
    console.error(`Error al extraer contenido de ${url}:`, error);
    return '';
  }
}

export async function GET() {
  try {
    const targetUrl = 'https://www.ole.com.ar/racing';

    // Simulamos un navegador real para evitar bloqueos básicos de scraping
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      // Cacheamos la respuesta por 60 segundos para no saturar a Olé con peticiones
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const articles = [];
    const seenUrls = new Set();

    // Buscamos todos los enlaces que contengan la ruta de racing
    $('a').each((i, element) => {
      const href = $(element).attr('href');
      const $el = $(element);

      // El título puede venir en aria-label, en el texto del enlace o en el h2 de la tarjeta
      let title =
        $el.attr('aria-label') ||
        $el.text().trim() ||
        $el.next('article').find('h2').first().text().trim() ||
        $el.closest('article').find('h2').first().text().trim();
      title = title.replace(/\s+/g, ' ').trim();

      // Filtramos para asegurar que es una nota y no una etiqueta, autor o sección genérica
      if (
        href &&
        (href.includes('/racing/') || href.includes('/futbol/racing/') || href.includes('/racin/')) &&
        title.length > 30
      ) {
        if (!href.includes('/tags/') && !href.includes('/autor/') && !href.includes('#') && !href.includes('/enviar-nota/')) {

          const fullUrl = href.startsWith('http') ? href : `https://www.ole.com.ar${href}`;

          // Evitar duplicados
          if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            articles.push({ title, url: fullUrl });
          }
        }
      }
    });

    // Extraemos el texto de cada nota en paralelo (máx. 20)
    const noticiasConContenido = await Promise.all(
      articles.slice(0, 20).map(async (noticia) => ({
        ...noticia,
        text: await extraerContenido(noticia.url),
      }))
    );

    // Devolvemos un JSON limpio con las primeras 20 noticias
    return NextResponse.json({
      success: true,
      data: noticiasConContenido,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error en el scraping:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudieron extraer las noticias en este momento.' },
      { status: 500 }
    );
  }
}
