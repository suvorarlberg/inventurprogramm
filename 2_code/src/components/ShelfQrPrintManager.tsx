import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera,
  Check,
  MapPin,
  Minus,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { AppSettings, InventoryItem } from '../types';
import {
  ALL_LEVELS,
  buildDefaultPrintCountsMap,
  buildLocationQrPayload,
  createStorageLocationSpot,
  itemMatchesLocationSpot,
  MAX_SPOTS_PER_LEVEL,
  SHELF_DEFINITIONS,
  StorageLocationSpot,
} from '../utils/storageLocations';

interface ShelfQrPrintManagerProps {
  items: InventoryItem[];
  settings: AppSettings;
  onOpenSpotModal: (spot: StorageLocationSpot) => void;
  onOpenScannerModal: () => void;
  onPrintLabels: (spotsToPrint: StorageLocationSpot[], labelSize: LabelSizeOption, qrMode: 'url' | 'short_code') => void;
}

export type LabelSizeOption = 'compact_4col' | 'standard_3col' | 'medium_3col';

const STORAGE_KEY_PRINT_COUNTS = 'vk_shelf_print_counts_v1';

export const ShelfQrPrintManager: React.FC<ShelfQrPrintManagerProps> = ({
  items,
  settings,
  onOpenSpotModal,
  onOpenScannerModal,
  onPrintLabels,
}) => {
  const [countsByShelfLevel, setCountsByShelfLevel] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRINT_COUNTS);
      if (saved) {
        return { ...buildDefaultPrintCountsMap(), ...JSON.parse(saved) };
      }
    } catch {
      // Fallback
    }
    return buildDefaultPrintCountsMap();
  });

  const [labelSize, setLabelSize] = useState<LabelSizeOption>('standard_3col');
  const [qrMode, setQrMode] = useState<'url' | 'short_code'>('url');
  const [selectedShelfFilter, setSelectedShelfFilter] = useState<string>('ALL');

  function updateCount(key: string, nextVal: number) {
    const clamped = Math.max(0, Math.min(MAX_SPOTS_PER_LEVEL, nextVal));
    setCountsByShelfLevel((prev) => {
      const updated = { ...prev, [key]: clamped };
      try {
        localStorage.setItem(STORAGE_KEY_PRINT_COUNTS, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  function applyPreset(preset: 'default_50' | 'all_20_per_level' | 'clear') {
    let next: Record<string, number> = {};
    if (preset === 'default_50') {
      next = buildDefaultPrintCountsMap();
    } else if (preset === 'all_20_per_level') {
      for (const shelf of SHELF_DEFINITIONS) {
        for (const lvl of shelf.levels) {
          next[`${shelf.id}-E${lvl}`] = MAX_SPOTS_PER_LEVEL;
        }
      }
    } else {
      for (const shelf of SHELF_DEFINITIONS) {
        for (const lvl of shelf.levels) {
          next[`${shelf.id}-E${lvl}`] = 0;
        }
      }
    }
    setCountsByShelfLevel(next);
    try {
      localStorage.setItem(STORAGE_KEY_PRINT_COUNTS, JSON.stringify(next));
    } catch {}
  }

  const activeSpotsToPrint = useMemo(() => {
    const list: StorageLocationSpot[] = [];
    for (const shelf of SHELF_DEFINITIONS) {
      if (selectedShelfFilter !== 'ALL' && shelf.id !== selectedShelfFilter) {
        continue;
      }
      for (const level of shelf.levels) {
        const count = countsByShelfLevel[`${shelf.id}-E${level}`] ?? 0;
        for (let spot = 1; spot <= count; spot++) {
          list.push(createStorageLocationSpot(shelf, level, spot));
        }
      }
    }
    return list;
  }, [countsByShelfLevel, selectedShelfFilter]);

  return (
    <div className="space-y-5 no-print">
      {/* Top Info & Schnellzugriff */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-sky-400" />
              <span>Stellplatz-QR-Codes zum Ausschneiden & Zuweisen</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Alle 4 Regale (<strong>GER</strong>, <strong>TMR</strong>, <strong>TSR</strong>, <strong>MR</strong>) haben die Ebenen <strong>0, 1, 2, 3</strong> und bis zu <strong>20 Stellplätze pro Ebene</strong> auf Vorrat. Drucke dir die kompakten Etiketten daheim aus, bringe sie am Regal an und verknüpfe sie per Scan oder Klick mit deinen Artikeln!
            </p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenScannerModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs sm:text-sm border border-sky-500/40 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>QR scannen & Artikel zuweisen</span>
            </button>

            <button
              type="button"
              disabled={activeSpotsToPrint.length === 0}
              onClick={() => onPrintLabels(activeSpotsToPrint, labelSize, qrMode)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/20 cursor-pointer disabled:opacity-40"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>{activeSpotsToPrint.length} Etiketten drucken (A4)</span>
            </button>
          </div>
        </div>

        {/* Konfigurator: Wie viele Stellplätze pro Regal & Ebene sollen gedruckt werden? */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs sm:text-sm font-semibold text-white">
              Anzahl Stellplätze pro Ebene festlegen (je 0 bis 20 Plätze auf Vorrat):
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('default_50')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-semibold cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Standard (~52 QR-Codes)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('all_20_per_level')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer"
              >
                <span>Maximal-Vorrat (alle 20 pro Ebene = 320)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('clear')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 text-xs cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Alle auf 0</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SHELF_DEFINITIONS.map((shelf) => {
              const shelfTotal = shelf.levels.reduce(
                (acc, lvl) => acc + (countsByShelfLevel[`${shelf.id}-E${lvl}`] ?? 0),
                0
              );
              return (
                <div
                  key={shelf.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 mr-2">
                        {shelf.id}
                      </span>
                      <span className="font-bold text-sm text-white">{shelf.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {shelfTotal} Etiketten
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ALL_LEVELS.map((lvl) => {
                      const key = `${shelf.id}-E${lvl}`;
                      const val = countsByShelfLevel[key] ?? 0;
                      return (
                        <div
                          key={key}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center gap-1"
                        >
                          <span className="text-[11px] font-semibold text-slate-300">
                            Ebene {lvl}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateCount(key, val - 1)}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={MAX_SPOTS_PER_LEVEL}
                              value={val}
                              onChange={(e) => updateCount(key, parseInt(e.target.value, 10) || 0)}
                              className="w-10 text-center bg-slate-950 border border-slate-700 rounded py-0.5 text-xs font-bold text-sky-300"
                            />
                            <button
                              type="button"
                              onClick={() => updateCount(key, val + 1)}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {val > 0 ? `P01–P${String(val).padStart(2, '0')}` : 'Keine'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Druck-Format & Etikettengröße einstellen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Etiketten-Größe auf A4 (zum Ausschneiden)
            </label>
            <select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value as LabelSizeOption)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white"
            >
              <option value="compact_4col">
                Extra Kompakt: 4 pro Reihe (~44 × 22 mm, ca. 44 Stück/Seite)
              </option>
              <option value="standard_3col">
                Standard Regal: 3 pro Reihe (~60 × 25 mm, ca. 33 Stück/Seite)
              </option>
              <option value="medium_3col">
                Mittel: 3 pro Reihe (~62 × 32 mm, ca. 24 Stück/Seite)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nur bestimmtes Regal drucken / anzeigen
            </label>
            <select
              value={selectedShelfFilter}
              onChange={(e) => setSelectedShelfFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white"
            >
              <option value="ALL">Alle 4 Regale gemeinsam ({activeSpotsToPrint.length} Codes)</option>
              {SHELF_DEFINITIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  Nur {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              QR-Code Inhalt
            </label>
            <select
              value={qrMode}
              onChange={(e) => setQrMode(e.target.value as 'url' | 'short_code')}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white"
            >
              <option value="url">
                Direkt-Link (Handykamera öffnet sofort App + Stellplatz)
              </option>
              <option value="short_code">
                Kompakt-Code (grobes Muster für winzige Etiketten, In-App-Scan)
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Vorschau & Direkt-Verknüpfung */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
              <Scissors className="w-4 h-4 text-sky-400" />
              <span>
                Vorschau der Ausschneide-Etiketten ({activeSpotsToPrint.length} Stück)
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Tipp: Klicke ein Etikett unten direkt an, um diesem Stellplatz sofort Artikel zuzuweisen!
            </p>
          </div>
          <button
            type="button"
            disabled={activeSpotsToPrint.length === 0}
            onClick={() => onPrintLabels(activeSpotsToPrint, labelSize, qrMode)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer shrink-0 disabled:opacity-40"
          >
            <Printer className="w-4 h-4" />
            <span>Jetzt A4-Bogen drucken</span>
          </button>
        </div>

        {activeSpotsToPrint.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
            Keine Stellplätze ausgewählt. Erhöhe oben die Anzahl bei Ebene 0–3 oder klicke auf „Standard (~52 QR-Codes)“.
          </div>
        ) : (
          <div
            className={`grid gap-2.5 ${
              labelSize === 'compact_4col'
                ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
            }`}
          >
            {activeSpotsToPrint.map((spot) => {
              const assignedItems = items.filter((it) =>
                itemMatchesLocationSpot(it.location, spot)
              );
              const qrPayload = buildLocationQrPayload(settings, spot.code, qrMode);

              return (
                <button
                  key={spot.code}
                  type="button"
                  onClick={() => onOpenSpotModal(spot)}
                  className="p-2.5 rounded-xl bg-white text-slate-950 border-2 border-dashed border-slate-400 hover:border-sky-500 transition flex items-center gap-3 text-left cursor-pointer shadow-sm group"
                  title="Klicken, um Artikel mit diesem Stellplatz zu verbinden"
                >
                  <div className="shrink-0 bg-white p-0.5">
                    <QRCodeSVG
                      value={qrPayload}
                      size={labelSize === 'compact_4col' ? 46 : labelSize === 'standard_3col' ? 54 : 64}
                      level="M"
                    />
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-extrabold text-xs sm:text-sm text-slate-950 tracking-tight">
                        {spot.code}
                      </span>
                      {assignedItems.length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {assignedItems.length} Art.
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold text-slate-800 truncate mt-0.5">
                      {spot.shelfName}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-600 mt-0.5">
                      {spot.levelAndSpotText}
                    </div>
                    {assignedItems.length > 0 ? (
                      <div className="text-[9px] text-emerald-700 font-medium truncate mt-0.5">
                        ✓ {assignedItems.map((i) => i.name).join(', ')}
                      </div>
                    ) : (
                      <div className="text-[9px] text-sky-700 font-medium mt-0.5 opacity-0 group-hover:opacity-100 transition">
                        + Klicken zum Artikel zuweisen
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
