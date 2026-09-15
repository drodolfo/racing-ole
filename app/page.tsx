'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

type Noticia = {
  title: string;
  url: string;
  text?: string;
};

type Partido = {
  fecha: string;
  rival: string;
  esLocal: boolean;
  hora: string;
  competencia: string;
  fechaLocal?: string;
  horaLocal?: string;
};

type ApiResponse = {
  success: boolean;
  data?: Noticia[];
  error?: string;
};

type CalendarioResponse = {
  success: boolean;
  data?: Partido[];
  error?: string;
};

export default function Home() {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [cargandoCalendario, setCargandoCalendario] = useState(false);
  const [calendarioError, setCalendarioError] = useState<string | null>(null);
  const [noticiaAbierta, setNoticiaAbierta] = useState<number | null>(null);

  const cargarCalendario = useCallback(async (actualizar = false) => {
    setCargandoCalendario(true);
    setCalendarioError(null);
    try {
      const res = await fetch(`/api/calendario/racing${actualizar ? '?actualizar=1' : ''}`);
      const result: CalendarioResponse = await res.json();
      if (result.success && result.data) {
        setPartidos(result.data);
      } else {
        setCalendarioError(result.error ?? 'No se pudo cargar el calendario.');
      }
    } catch {
      setCalendarioError('Error inesperado al cargar el calendario.');
    } finally {
      setCargandoCalendario(false);
    }
  }, []);

  useEffect(() => {
    const cargarCalendarioInicial = async () => {
      try {
        const res = await fetch('/api/calendario/racing');
        const result: CalendarioResponse = await res.json();
        if (result.success && result.data) {
          setPartidos(result.data);
        } else {
          setCalendarioError(result.error ?? 'No se pudo cargar el calendario.');
        }
      } catch {
        setCalendarioError('Error inesperado al cargar el calendario.');
      }
    };
    cargarCalendarioInicial();
  }, []);

  const extraerNoticias = async () => {
    setLoading(true);
    setError(null);
    setNoticias([]);

    try {
      // Llamamos a NUESTRA propia API, sin proxies externos
      const res = await fetch('/api/noticias/racing');
      const result: ApiResponse = await res.json();

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'No se pudieron extraer las noticias.');
      }

      setNoticias(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-900 mb-2 flex items-center justify-center gap-3">
            <Image
              src="/logo-racing.png"
              alt="Logo de Racing"
              width={40}
              height={40}
              className="h-10 w-10 md:h-12 md:w-12"
            />
            Noticias de Racing
          </h1>
          <p className="text-gray-600">
            Extractor profesional desde Olé.com.ar
          </p>
        </header>

        <button
          onClick={extraerNoticias}
          disabled={loading}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-white text-lg shadow-md transition-all duration-200
            ${loading
              ? 'bg-blue-400 cursor-not-allowed'
              : 'bg-blue-700 hover:bg-blue-800 hover:shadow-lg active:scale-[0.98]'
            }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Extrayendo datos...
            </span>
          ) : (
            'Extraer Noticias del Día'
          )}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-center">
            ⚠️ {error}
          </div>
        )}

        {noticias.length > 0 && (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-gray-500 text-right">
              Mostrando {noticias.length} noticias recientes
            </p>
            {noticias.map((nota, index) => {
              const abierta = noticiaAbierta === index;
              return (
                <div
                  key={index}
                  className="block p-5 bg-white border border-gray-200 rounded-lg shadow-sm transition-all duration-200"
                >
                  <h2
                    className="text-2xl font-semibold text-gray-800 cursor-pointer hover:text-blue-700 select-none"
                    onClick={() => setNoticiaAbierta(abierta ? null : index)}
                  >
                    {nota.title}
                  </h2>
                  {abierta && nota.text && (
                    <p className="mt-2 text-lg text-gray-600 leading-relaxed">
                      {nota.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <section className="mt-12">
          <div className="flex items-center justify-between mb-4 gap-4">
            <h2 className="text-3xl font-bold text-blue-900">
              📅 Calendario de Racing Club
            </h2>
            <button
              onClick={() => cargarCalendario(true)}
              disabled={cargandoCalendario}
              className={`px-4 py-2 rounded-lg font-semibold text-white text-sm shadow-sm transition-all duration-200 shrink-0
                ${cargandoCalendario
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-700 hover:bg-blue-800 hover:shadow-lg active:scale-[0.98]'
                }`}
            >
              {cargandoCalendario ? 'Actualizando...' : '↻ Actualizar Calendario'}
            </button>
          </div>

          {calendarioError && (
            <p className="text-base text-red-600">⚠️ {calendarioError}</p>
          )}

          {partidos.length > 0 && (
            <ul className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-lg shadow-sm">
              {partidos.map((partido, index) => (
                <li key={index} className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-lg font-semibold text-gray-800">
                      <span
                        className={`inline-block text-sm font-bold uppercase px-2 py-0.5 rounded mr-2 ${
                          partido.esLocal
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {partido.esLocal ? 'Local' : 'Visitante'}
                      </span>
                      {partido.rival}
                    </p>
                    <p className="text-base text-gray-500">{partido.fechaLocal ?? partido.fecha} · {partido.competencia}</p>
                  </div>
                  <span className="text-lg font-medium text-gray-700 ml-4 shrink-0">
                    {partido.horaLocal ?? (partido.hora || 'A confirmar')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
