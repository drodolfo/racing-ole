import { HEADERS, fetchJina } from '../lib/scrapers';

export { HEADERS, fetchJina };

export interface Noticia {
  title: string;
  url: string;
  text: string;
}

export async function extraerContenido(url: string): Promise<string> {
  // placeholder for service extraction
  return '';
}
