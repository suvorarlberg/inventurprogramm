import React, { useMemo, useState } from 'react';
import {
  Box,
  Check,
  Filter,
  MapPin,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { InventoryItem } from '../types';
import {
  itemMatchesLocationSpot,
  parseStorageLocationInput,
  StorageLocationSpot,
} from '../utils/storageLocations';
import { formatStockDisplay } from '../utils/units';

interface LocationAssignmentModalProps {
  spot: StorageLocationSpot | null;
  items: InventoryItem[];
  onClose: () => void;
  onAssignItemToSpot: (itemId: string, spot: StorageLocationSpot | null) => void;
  onFilterBySpot?: (spot: StorageLocationSpot) => void;
  onSwitchSpotRequest?: () => void;
  onManageSubItems?: (parentItem: InventoryItem) => void;
}

export const LocationAssignmentModal: React.FC<LocationAssignmentModalProps> = ({
  spot,
  items,
  onClose,
  onAssignItemToSpot,
  onFilterBySpot,
  onSwitchSpotRequest,
  onManageSubItems,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Gruppiere Hauptartikel / Kisten auf diesem Stellplatz (Unterartikel hängen an ihrer Kiste)
  const assignedItems = useMemo(() => {
    if (!spot) return [];
    return items.filter(
      (item) =>
        itemMatchesLocationSpot(item.location, spot) &&
        (!item.parentItemId ||
          !items.some(
            (p) => p.id === item.parentItemId && itemMatchesLocationSpot(p.location, spot)
          ))
    );
  }, [items, spot]);

  const otherItems = useMemo(() => {
    if (!spot) return [];
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (itemMatchesLocationSpot(item.location, spot)) return false;
      // Unterartikel ohne Suche nicht doppelt auflisten, da sie über ihre Kiste verschoben werden
      if (!q && item.parentItemId) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        item.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [items, spot, searchQuery]);

  if (!spot) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-slate-900 border border-sky-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopfbereich mit Stellplatz-Name in Schriftform & Code */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-sm sm:text-base px-2.5 py-0.5 rounded-lg bg-sky-500 text-slate-950">
                  {spot.code}
                </span>
                <span className="text-xs font-semibold text-sky-300">
                  {spot.levelAndSpotText}
                </span>
              </div>
              <h3 className="font-bold text-white text-sm sm:text-base mt-1">
                {spot.shelfName} ({spot.shelfId})
              </h3>
              <p className="text-xs text-slate-400">
                Verknüpfe Artikel mit diesem Stellplatz oder filtere die Buchungsliste.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Schnell-Aktionen oben */}
        <div className="flex flex-wrap gap-2">
          {onFilterBySpot && (
            <button
              type="button"
              onClick={() => {
                onFilterBySpot(spot);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer shadow"
            >
              <Filter className="w-4 h-4" />
              <span>Artikel dieses Stellplatzes buchen ({assignedItems.length})</span>
            </button>
          )}
          {onSwitchSpotRequest && (
            <button
              type="button"
              onClick={onSwitchSpotRequest}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold border border-slate-700 cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Anderen Platz scannen / wählen</span>
            </button>
          )}
        </div>

        {/* 1. Bereits diesem Stellplatz zugewiesene Artikel */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Aktuell auf {spot.code} hinterlegt ({assignedItems.length})
            </h4>
          </div>

          {assignedItems.length === 0 ? (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
              Diesem Stellplatz ist noch kein Artikel zugewiesen. Tippe unten einfach auf die Artikel, die hier im Regal stehen!
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {assignedItems.map((item) => {
                const subItems = items.filter((s) => s.parentItemId === item.id);
                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs sm:text-sm text-white truncate">
                            {item.name}
                          </span>
                          {subItems.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <Box className="w-3 h-3" />
                              <span>Kiste ({subItems.length} Unterartikel)</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-emerald-300">
                          Bestand: {formatStockDisplay(item).primaryText}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onManageSubItems && (
                          <button
                            type="button"
                            onClick={() => onManageSubItems(item)}
                            className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-xs flex items-center gap-1 cursor-pointer"
                            title="Unterartikel in dieser Kiste ansehen oder anlegen"
                          >
                            <Box className="w-3.5 h-3.5" />
                            <span>Inhalt ({subItems.length})</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onAssignItemToSpot(item.id, null)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                          title="Stellplatz-Zuweisung entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Lösen</span>
                        </button>
                      </div>
                    </div>
                    {subItems.length > 0 && (
                      <div className="pl-2.5 border-l-2 border-amber-500/40 text-[11px] text-slate-300 flex flex-wrap gap-1">
                        {subItems.map((sub) => (
                          <span
                            key={sub.id}
                            className="px-2 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-[10px] text-slate-200"
                          >
                            {sub.name} ({formatStockDisplay(sub).primaryText})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Nachträglich Artikel mit diesem Stellplatz verbinden */}
        <div className="space-y-2.5 pt-2 border-t border-slate-800">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Artikel mit {spot.code} verbinden (1 Klick ohne Tippen)
            </h4>
            <p className="text-[11px] text-slate-400">
              Tippe auf „+ Zuweisen“, um bestehende Artikel auf diesen Stellplatz zu legen:
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Artikel suchen..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {otherItems.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">
                Keine weiteren passenden Artikel gefunden.
              </p>
            ) : (
              otherItems.map((item) => {
                const currentParsed = parseStorageLocationInput(item.location);
                const subCount = items.filter((s) => s.parentItemId === item.id).length;
                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-white truncate">
                          {item.name}
                        </span>
                        {subCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <Box className="w-3 h-3" />
                            <span>inkl. {subCount} Unterart.</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        Bestand: {formatStockDisplay(item).primaryText}
                        {item.location
                          ? ` • Aktuell: ${currentParsed ? currentParsed.code : item.location}`
                          : ' • Noch kein Stellplatz'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAssignItemToSpot(item.id, spot)}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 font-bold text-xs border border-sky-500/40 transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Hierher legen</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Fertig</span>
          </button>
        </div>
      </div>
    </div>
  );
};
