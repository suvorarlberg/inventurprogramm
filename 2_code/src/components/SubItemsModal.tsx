import React, { useMemo, useState } from 'react';
import {
  Box,
  Check,
  ListPlus,
  MapPin,
  PackagePlus,
  Plus,
  QrCode,
  Search,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { InventoryItem } from '../types';
import { formatStockDisplay, roundStock } from '../utils/units';

interface SubItemsModalProps {
  parentItem: InventoryItem | null;
  items: InventoryItem[];
  onClose: () => void;
  onAddSubItems: (parentItem: InventoryItem, newSubItems: InventoryItem[]) => void;
  onAssignExistingItemToParent: (itemId: string, parentItem: InventoryItem | null) => void;
  onDeleteSubItem?: (itemId: string) => void;
  onChangeParentLocationRequest?: (parentItem: InventoryItem) => void;
}

/**
 * Parst eine Zeile im Schnell-Listen-Modus für Unterartikel in einer Kiste, z. B.:
 * - "10 Stück Edding schwarz"
 * - "3 Packung Moderationskarten"
 * - "Scheren" (-> 1 Stück Scheren)
 * - "Klebeband; 4; Rolle"
 */
export function parseBulkSubItemLine(
  rawLine: string,
  parentItem: InventoryItem,
  indexOffset: number
): InventoryItem | null {
  const trimmed = rawLine.trim().replace(/^[-*•]\s*/, '');
  if (!trimmed) return null;

  let name = trimmed;
  let quantity = 1;
  let unit = 'Stück';

  // Format 1: Semikolon-getrennt "Name; Menge; Einheit"
  if (trimmed.includes(';')) {
    const parts = trimmed.split(';').map((p) => p.trim());
    if (parts[0]) {
      name = parts[0];
      if (parts[1]) {
        const parsedQty = parseFloat(parts[1].replace(',', '.'));
        if (!isNaN(parsedQty) && parsedQty >= 0) quantity = roundStock(parsedQty);
      }
      if (parts[2]) {
        unit = parts[2];
      }
    }
  } else {
    // Format 2: "10 Stück Edding schwarz" oder "5x Flipchart-Marker"
    const matchQtyUnitName = trimmed.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:x\s+|\s+)(Stück|Stk|Rolle|Rollen|Packung|Packungen|Pkg|Set|Sets|Paar|Dose|Dosen|Flasche|Flaschen|Meter|m|Kiste|Kisten|Box)?\s*(.+)$/i
    );
    if (matchQtyUnitName) {
      const parsedQty = parseFloat(matchQtyUnitName[1].replace(',', '.'));
      if (!isNaN(parsedQty) && parsedQty >= 0) {
        quantity = roundStock(parsedQty);
      }
      const rawUnit = matchQtyUnitName[2]?.trim();
      if (rawUnit) {
        const uLower = rawUnit.toLowerCase();
        if (uLower === 'stk' || uLower === 'stück') unit = 'Stück';
        else if (uLower.startsWith('roll')) unit = 'Rolle';
        else if (uLower.startsWith('pack') || uLower === 'pkg') unit = 'Packung';
        else if (uLower.startsWith('flasch')) unit = 'Flasche';
        else if (uLower.startsWith('dos')) unit = 'Dose';
        else unit = rawUnit;
      }
      name = matchQtyUnitName[3].trim();
    }
  }

  if (!name) return null;

  const now = new Date().toISOString();
  return {
    id: `item-sub-${Date.now()}-${indexOffset}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    category: parentItem.category,
    categoryLabel: parentItem.categoryLabel,
    unit,
    allowFractions: true,
    isReturnable: parentItem.isReturnable,
    quantity,
    minStock: 1,
    targetStock: Math.max(1, quantity),
    location: parentItem.location,
    parentItemId: parentItem.id,
    aliases: [
      name.toLowerCase().split(/\s+/)[0],
      parentItem.name.toLowerCase(),
    ].filter(Boolean),
    updatedAt: now,
  };
}

export const SubItemsModal: React.FC<SubItemsModalProps> = ({
  parentItem,
  items,
  onClose,
  onAddSubItems,
  onAssignExistingItemToParent,
  onDeleteSubItem,
  onChangeParentLocationRequest,
}) => {
  const [addTab, setAddTab] = useState<'single' | 'bulk' | 'existing'>('single');
  const [subName, setSubName] = useState('');
  const [subQty, setSubQty] = useState('1');
  const [subUnit, setSubUnit] = useState('Stück');
  const [bulkText, setBulkText] = useState('');
  const [existingSearch, setExistingSearch] = useState('');

  const currentSubItems = useMemo(() => {
    if (!parentItem) return [];
    return items.filter((i) => i.parentItemId === parentItem.id);
  }, [items, parentItem]);

  const availableExistingItems = useMemo(() => {
    if (!parentItem) return [];
    const q = existingSearch.trim().toLowerCase();
    return items.filter((i) => {
      if (i.id === parentItem.id) return false;
      if (i.parentItemId === parentItem.id) return false;
      // Verhindere Zirkelbezug (falls i selbst bereits Überartikel von parentItem wäre)
      if (parentItem.parentItemId === i.id) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.location || '').toLowerCase().includes(q) ||
        i.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [items, parentItem, existingSearch]);

  if (!parentItem) return null;

  function handleAddSingleSubItem(e: React.FormEvent) {
    e.preventDefault();
    if (!parentItem || !subName.trim()) return;
    const qty = roundStock(Math.max(0, parseFloat(subQty.replace(',', '.')) || 0));
    const unit = subUnit.trim() || 'Stück';
    const cleanName = subName.trim();
    const now = new Date().toISOString();

    const newSub: InventoryItem = {
      id: `item-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      category: parentItem.category,
      categoryLabel: parentItem.categoryLabel,
      unit,
      allowFractions: true,
      isReturnable: parentItem.isReturnable,
      quantity: qty,
      minStock: 1,
      targetStock: Math.max(1, qty),
      location: parentItem.location,
      parentItemId: parentItem.id,
      aliases: [
        cleanName.toLowerCase().split(/\s+/)[0],
        parentItem.name.toLowerCase(),
      ].filter(Boolean),
      updatedAt: now,
    };

    onAddSubItems(parentItem, [newSub]);
    setSubName('');
    setSubQty('1');
  }

  function handleAddBulkSubItems(e: React.FormEvent) {
    e.preventDefault();
    if (!parentItem || !bulkText.trim()) return;
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const created: InventoryItem[] = [];
    lines.forEach((line, idx) => {
      const parsed = parseBulkSubItemLine(line, parentItem, idx);
      if (parsed) {
        created.push(parsed);
      }
    });

    if (created.length > 0) {
      onAddSubItems(parentItem, created);
      setBulkText('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-sky-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Überartikel / Kiste + gemeinsamer Stellplatz */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Box className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Überartikel / Kiste
                </span>
                <span className="text-xs font-semibold text-sky-300">
                  {currentSubItems.length} Unterartikel enthalten
                </span>
              </div>
              <h3 className="font-bold text-white text-base sm:text-lg mt-0.5">
                {parentItem.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>
                    Gemeinsamer Stellplatz:{' '}
                    <strong className="text-sky-300">
                      {parentItem.location || 'Noch kein Stellplatz zugewiesen'}
                    </strong>
                  </span>
                </span>
                {onChangeParentLocationRequest && (
                  <button
                    type="button"
                    onClick={() => onChangeParentLocationRequest(parentItem)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 cursor-pointer"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>Stellplatz für Kiste + Inhalt wählen</span>
                  </button>
                )}
              </div>
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

        {/* 1. Liste der aktuellen Unterartikel in dieser Kiste */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Inhalt von „{parentItem.name}“ ({currentSubItems.length} Unterartikel)
            </h4>
            <span className="text-[11px] text-slate-400">
              Alle Unterartikel teilen automatisch den Stellplatz der Kiste
            </span>
          </div>

          {currentSubItems.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
              In dieser Kiste sind noch keine Unterartikel hinterlegt. Lege unten einzelne oder gleich 15 Unterartikel auf einmal an!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {currentSubItems.map((sub) => (
                <div
                  key={sub.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-xs sm:text-sm text-white truncate">
                      {sub.name}
                    </div>
                    <div className="text-[11px] text-emerald-300 font-medium">
                      In Kiste: {formatStockDisplay(sub).primaryText}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAssignExistingItemToParent(sub.id, null)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 cursor-pointer"
                      title="Aus Kiste herausnehmen (bleibt als eigener Artikel erhalten)"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteSubItem && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Unterartikel „${sub.name}“ komplett aus dem Bestand löschen?`
                            )
                          ) {
                            onDeleteSubItem(sub.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 cursor-pointer"
                        title="Unterartikel löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Unterartikel hinzufügen (Einzeln, 15er-Schnellliste oder Bestehende zuordnen) */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setAddTab('single')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                addTab === 'single'
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Einzeln anlegen</span>
            </button>
            <button
              type="button"
              onClick={() => setAddTab('bulk')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                addTab === 'bulk'
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>Schnell-Liste (z.B. 15 Stk.)</span>
            </button>
            <button
              type="button"
              onClick={() => setAddTab('existing')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                addTab === 'existing'
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Vorhandene reinlegen</span>
            </button>
          </div>

          {/* TAB A: Einzelnen Unterartikel in der Kiste anlegen */}
          {addTab === 'single' && (
            <form onSubmit={handleAddSingleSubItem} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Name des Unterartikels in „{parentItem.name}“
                  </label>
                  <input
                    type="text"
                    required
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    placeholder="z. B. Edding schwarz, HDMI-Kabel, Schere..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-400 mb-1">Anzahl</label>
                  <input
                    type="text"
                    value={subQty}
                    onChange={(e) => setSubQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-400 mb-1">Einheit</label>
                  <input
                    type="text"
                    value={subUnit}
                    onChange={(e) => setSubUnit(e.target.value)}
                    placeholder="Stück, Rolle, Packung..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!subName.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Unterartikel in „{parentItem.name}“ anlegen</span>
              </button>
            </form>
          )}

          {/* TAB B: 15 Unterartikel auf einmal per Zeilenliste in die Kiste legen */}
          {addTab === 'bulk' && (
            <form onSubmit={handleAddBulkSubItems} className="space-y-2.5">
              <p className="text-xs text-slate-400">
                Schreibe einfach <strong>einen Unterartikel pro Zeile</strong> (z. B. 15 Artikel, die in dieser Kiste liegen). Mengen & Einheiten am Zeilenanfang werden automatisch erkannt:
              </p>
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  '10 Stück Edding schwarz\n5 Stück Edding rot\n3 Packung Moderationskarten\n2 Rolle Kreppband\n4 Stück Schere\n1 Dose Pinnnadeln'
                }
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!bulkText.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer disabled:opacity-40"
              >
                <ListPlus className="w-4 h-4" />
                <span>
                  Alle Zeilen als Unterartikel in „{parentItem.name}“ anlegen
                </span>
              </button>
            </form>
          )}

          {/* TAB C: Bestehende Artikel nachträglich in diese Kiste legen */}
          {addTab === 'existing' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Vorhandenen Artikel suchen, um ihn in diese Kiste zu legen..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {availableExistingItems.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">
                    Keine passenden weiteren Artikel gefunden.
                  </p>
                ) : (
                  availableExistingItems.map((candidate) => {
                    const otherParent = candidate.parentItemId
                      ? items.find((p) => p.id === candidate.parentItemId)
                      : undefined;
                    return (
                      <div
                        key={candidate.id}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-white truncate">
                            {candidate.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            Bestand: {formatStockDisplay(candidate).primaryText}
                            {otherParent ? ` • Aktuell in: ${otherParent.name}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onAssignExistingItemToParent(candidate.id, parentItem)
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 font-bold text-xs border border-sky-500/40 transition flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>In Kiste legen</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
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
