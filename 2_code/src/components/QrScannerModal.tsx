import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Grid, MapPin, QrCode, X, AlertCircle, Check } from 'lucide-react';
import {
  ALL_LEVELS,
  createStorageLocationSpot,
  formatSpotNumber,
  getShelfDefinition,
  MAX_SPOTS_PER_LEVEL,
  parseStorageLocationInput,
  SHELF_DEFINITIONS,
  ShelfId,
  StorageLocationSpot,
} from '../utils/storageLocations';
import { InventoryItem } from '../types';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (spot: StorageLocationSpot) => void;
  items?: InventoryItem[];
  title?: string;
  subtitle?: string;
  initialMode?: 'camera' | 'picker';
  currentLocationText?: string;
  onClearLocation?: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  items = [],
  title = 'Stellplatz per QR-Code oder Auswahl wählen',
  subtitle = 'Scanne den QR-Code am Regal oder wähle Regal, Ebene (0–3) und Platz (1–20).',
  initialMode = 'camera',
  currentLocationText,
  onClearLocation,
}) => {
  const existingSpot = parseStorageLocationInput(currentLocationText);

  const [mode, setMode] = useState<'camera' | 'picker'>(initialMode);
  const [selectedShelf, setSelectedShelf] = useState<ShelfId>(existingSpot?.shelfId || 'GER');
  const [selectedLevel, setSelectedLevel] = useState<number>(existingSpot?.level ?? 0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      const parsed = parseStorageLocationInput(currentLocationText);
      if (parsed) {
        setSelectedShelf(parsed.shelfId);
        setSelectedLevel(parsed.level);
      }
      setMode(initialMode);
      setCameraError(null);
      setManualCodeInput('');
      setManualError(null);
    }
  }, [isOpen, initialMode, currentLocationText]);

  useEffect(() => {
    if (!isOpen || mode !== 'camera') {
      stopCamera();
      return;
    }

    let active = true;

    async function startCamera() {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Kamera-Zugriff wird in diesem Browser nicht unterstützt. Bitte wechsle oben auf „Regal-Auswahl“.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch(() => {});
        }

        const scanFrame = () => {
          if (!active) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (width > 0 && height > 0) {
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const codeResult = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });

                if (codeResult?.data) {
                  const spot = parseStorageLocationInput(codeResult.data);
                  if (spot) {
                    stopCamera();
                    onSelectLocation(spot);
                    return;
                  }
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(scanFrame);
        };

        rafRef.current = requestAnimationFrame(scanFrame);
      } catch {
        if (!active) return;
        setCameraError(
          'Kamera konnte nicht gestartet werden (Berechtigung verweigert oder keine Kamera gefunden). Du kannst den Stellplatz direkt über „Regal-Auswahl“ antippen.'
        );
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, mode]);

  function stopCamera() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  if (!isOpen) return null;

  const currentShelfDef = getShelfDefinition(selectedShelf) || SHELF_DEFINITIONS[0];

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseStorageLocationInput(manualCodeInput);
    if (!parsed) {
      setManualError(
        'Ungültiger Stellplatz-Code. Beispiel: GER-E0-P01, TMR-E2-P05 oder MR-1-3'
      );
      return;
    }
    stopCamera();
    onSelectLocation(parsed);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={() => {
        stopCamera();
        onClose();
      }}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">{title}</h3>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Umschalter: Kamera-Scan vs. Direkte Regal-Auswahl */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('camera')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
              mode === 'camera'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>QR-Code scannen</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('picker')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
              mode === 'picker'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Regal & Platz wählen</span>
          </button>
        </div>

        {/* MODUS 1: KAMERA-SCANNER */}
        {mode === 'camera' && (
          <div className="space-y-3">
            {cameraError ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('picker')}
                  className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Zur Regal- & Stellplatz-Auswahl wechseln
                </button>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-700 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} className="hidden" />
                {/* Zielrahmen */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-44 h-44 border-2 border-sky-400/90 rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.45)] flex items-end justify-center pb-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-950/85 text-sky-300 border border-sky-500/40">
                      Stellplatz-QR in den Rahmen halten
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Schnelleingabe falls Handscanner oder Code bekannt */}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualCodeInput}
                onChange={(e) => {
                  setManualCodeInput(e.target.value);
                  setManualError(null);
                }}
                placeholder="Oder Kurzcode eingeben (z. B. GER-E0-P01)..."
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!manualCodeInput.trim()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold border border-slate-700 cursor-pointer disabled:opacity-40"
              >
                Übernehmen
              </button>
            </form>
            {manualError && <p className="text-xs text-rose-400">{manualError}</p>}
          </div>
        )}

        {/* MODUS 2: VISUELLE REGAL- & STELLPLATZ-AUSWAHL (OHNE ABTIPPEN) */}
        {mode === 'picker' && (
          <div className="space-y-3.5">
            {/* Schritt 1: Regal wählen */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                1. Regal auswählen
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SHELF_DEFINITIONS.map((shelf) => {
                  const isSelected = selectedShelf === shelf.id;
                  return (
                    <button
                      key={shelf.id}
                      type="button"
                      onClick={() => setSelectedShelf(shelf.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/20 border-sky-500 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs sm:text-sm text-sky-400">
                          {shelf.id}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                      <div className="text-[11px] font-medium text-slate-200 truncate mt-0.5">
                        {shelf.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schritt 2: Ebene 0, 1, 2, 3 wählen */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                2. Ebene wählen (0 bis 3)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {ALL_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`py-2 px-2 rounded-xl border font-bold text-xs sm:text-sm transition cursor-pointer ${
                      selectedLevel === lvl
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    Ebene {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Schritt 3: Stellplatz 1 bis 20 antippen */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                3. Stellplatz auf <span className="text-sky-400">{currentShelfDef.name} ({currentShelfDef.id}) • Ebene {selectedLevel}</span> antippen
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {Array.from({ length: MAX_SPOTS_PER_LEVEL }, (_, i) => i + 1).map((spotNum) => {
                  const spotObj = createStorageLocationSpot(currentShelfDef, selectedLevel, spotNum);
                  const assignedCount = items.filter((it) => {
                    const parsed = parseStorageLocationInput(it.location);
                    return parsed?.code === spotObj.code;
                  }).length;
                  const isCurrent = existingSpot?.code === spotObj.code;

                  return (
                    <button
                      key={spotObj.code}
                      type="button"
                      onClick={() => {
                        stopCamera();
                        onSelectLocation(spotObj);
                      }}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                        isCurrent
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                          : assignedCount > 0
                          ? 'bg-slate-950 border-sky-500/50 hover:border-sky-400 text-white'
                          : 'bg-slate-950 border-slate-800 hover:border-sky-500/60 text-slate-300'
                      }`}
                    >
                      <span className="font-mono font-bold text-xs text-sky-300">
                        Platz {formatSpotNumber(spotNum)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {spotObj.code}
                      </span>
                      {assignedCount > 0 && (
                        <span className="mt-0.5 text-[9px] px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300">
                          {assignedCount} Art.
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Aktueller Stellplatz & Fußzeile */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          {currentLocationText ? (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate max-w-[240px]">Aktuell: {currentLocationText}</span>
              {onClearLocation && (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClearLocation();
                  }}
                  className="text-rose-400 hover:underline text-[11px] ml-1 cursor-pointer"
                >
                  Entfernen
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-500">Kein Stellplatz zugewiesen</span>
          )}

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium cursor-pointer ml-auto"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
