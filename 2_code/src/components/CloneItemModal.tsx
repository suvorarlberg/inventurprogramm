import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Calendar,
  Check,
  CheckSquare,
  Copy,
  FolderPlus,
  MapPin,
  Plus,
  QrCode,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  CategoryId,
  CategoryInfo,
  InventoryItem,
  SpiceFillLevel,
  UnitProfile,
} from '../types';
import {
  formatGermanNumber,
  formatStockDisplay,
  normalizeExpiryDate,
  roundStock,
  SPICE_FILL_CONFIG,
} from '../utils/units';

export interface CloneItemModalProps {
  sourceItem: InventoryItem | null;
  items: InventoryItem[];
  categories: CategoryInfo[];
  onClose: () => void;
  onConfirmClone: (clonedItems: InventoryItem[]) => void;
  onOpenLocationScanner?: (currentLocation: string, applyLocation: (loc: string) => void) => void;
}

export interface ClonedSubItemDraft {
  id: string;
  sourceId?: string;
  name: string;
  quantity: string;
  unit: string;
  category: CategoryId;
  minStock: string;
  expiryDate?: string;
  /** Standardmäßig true: alle Unterartikel sind initial aktiviert */
  included: boolean;
}

export const CloneItemModal: React.FC<CloneItemModalProps> = ({
  sourceItem,
  items,
  categories,
  onClose,
  onConfirmClone,
  onOpenLocationScanner,
}) => {
  // Hauptartikel-Eingabefelder (alle frei bearbeitbar)
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [unit, setUnit] = useState('Stück');
  const [unitProfile, setUnitProfile] = useState<UnitProfile>('piece');
  const [openPackLevel, setOpenPackLevel] = useState<SpiceFillLevel>('full');
  const [category, setCategory] = useState<CategoryId>('drinks_food');
  const [location, setLocation] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [minStock, setMinStock] = useState('1');
  const [targetStock, setTargetStock] = useState('');
  const [subUnit, setSubUnit] = useState('');
  const [subUnitsPerUnit, setSubUnitsPerUnit] = useState('');
  const [allowFractions, setAllowFractions] = useState(false);
  const [isReturnable, setIsReturnable] = useState(false);
  const [parentItemId, setParentItemId] = useState('');

  // Unterartikel-Drafts: Standardmäßig sind ALLE Unterartikel aus dem Quellartikel enthalten (included: true)
  const [subDrafts, setSubDrafts] = useState<ClonedSubItemDraft[]>([]);

  // Original-Unterartikel des Quellartikels ermitteln
  const originalSubItems = useMemo(() => {
    if (!sourceItem) return [];
    return items.filter((i) => i.parentItemId === sourceItem.id);
  }, [sourceItem, items]);

  useEffect(() => {
    if (!sourceItem) return;

    setName(`${sourceItem.name} (Kopie)`);
    setQuantity(formatGermanNumber(sourceItem.quantity));
    setUnit(sourceItem.unit || 'Stück');
    setUnitProfile(sourceItem.unitProfile || 'piece');
    setOpenPackLevel(sourceItem.openPackLevel || 'full');
    setCategory(sourceItem.category);
    setLocation(sourceItem.location || '');
    setExpiryDate(sourceItem.expiryDate || '');
    setMinStock(formatGermanNumber(sourceItem.minStock));
    setTargetStock(
      sourceItem.targetStock !== undefined ? formatGermanNumber(sourceItem.targetStock) : ''
    );
    setSubUnit(sourceItem.subUnit || '');
    setSubUnitsPerUnit(sourceItem.subUnitsPerUnit ? String(sourceItem.subUnitsPerUnit) : '');
    setAllowFractions(Boolean(sourceItem.allowFractions));
    setIsReturnable(Boolean(sourceItem.isReturnable));
    setParentItemId(sourceItem.parentItemId || '');

    // Alle Unterartikel des Originalartikels initialisieren: standardmäßig alle aktiv (included: true)
    const existingSubs = items.filter((i) => i.parentItemId === sourceItem.id);
    setSubDrafts(
      existingSubs.map((sub, idx) => ({
        id: `draft-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        sourceId: sub.id,
        name: sub.name,
        quantity: formatGermanNumber(sub.quantity),
        unit: sub.unit || 'Stück',
        category: sub.category,
        minStock: formatGermanNumber(sub.minStock),
        expiryDate: sub.expiryDate || '',
        included: true, // Standardmäßig aktiviert!
      }))
    );
  }, [sourceItem, items]);

  if (!sourceItem) return null;

  // Prüfen, ob der eingegebene Name bereits im Bestand existiert
  const nameAlreadyExists = items.some(
    (i) => i.name.trim().toLowerCase() === name.trim().toLowerCase()
  );

  const activeSubCount = subDrafts.filter((s) => s.included).length;

  function toggleSubItem(id: string) {
    setSubDrafts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, included: !s.included } : s))
    );
  }

  function handleSelectAllSubs(selectAll: boolean) {
    setSubDrafts((prev) => prev.map((s) => ({ ...s, included: selectAll })));
  }

  function handleUpdateSubField(
    id: string,
    field: keyof ClonedSubItemDraft,
    val: string | boolean
  ) {
    setSubDrafts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  }

  function handleAddExtraSub() {
    const newDraft: ClonedSubItemDraft = {
      id: `draft-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      quantity: '1',
      unit: 'Stück',
      category: category,
      minStock: '1',
      included: true,
    };
    setSubDrafts((prev) => [...prev, newDraft]);
  }

  function handleRemoveSubDraft(id: string) {
    setSubDrafts((prev) => prev.filter((s) => s.id !== id));
  }

  function handleSubmitClone(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !sourceItem) return;

    const baseQty = roundStock(Math.max(0, parseFloat(quantity.replace(',', '.')) || 0));
    const parsedMin = roundStock(Math.max(0, parseFloat(minStock.replace(',', '.')) || 0));
    const parsedTarget = targetStock.trim()
      ? roundStock(Math.max(0, parseFloat(targetStock.replace(',', '.')) || 0))
      : undefined;
    const factor = parseInt(subUnitsPerUnit, 10);
    const hasSub = Boolean(subUnit.trim() && !isNaN(factor) && factor > 1);
    const catObj = categories.find((c) => c.id === category);
    const parentObj = parentItemId ? items.find((i) => i.id === parentItemId) : undefined;
    const resolvedLocation = parentObj
      ? parentObj.location || location.trim() || undefined
      : location.trim() || undefined;
    const normalizedExp = expiryDate.trim() ? normalizeExpiryDate(expiryDate.trim()) : undefined;
    const now = new Date().toISOString();

    const newParentId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const firstWord = trimmedName.toLowerCase().split(/\s+/)[0] || trimmedName.toLowerCase();

    // 1. Neuer Hauptartikel mit allen vom Nutzer angepassten Werten
    const clonedParent: InventoryItem = {
      id: newParentId,
      name: trimmedName,
      category,
      categoryLabel: catObj?.label || sourceItem.categoryLabel || category,
      unitProfile,
      openPackLevel: unitProfile === 'spice_bulk' ? openPackLevel : undefined,
      unit: unit.trim() || 'Stück',
      subUnit: hasSub ? subUnit.trim() : undefined,
      subUnitsPerUnit: hasSub ? factor : undefined,
      allowFractions,
      isReturnable,
      quantity: baseQty,
      minStock: parsedMin,
      targetStock: parsedTarget,
      location: resolvedLocation,
      parentItemId: parentItemId || undefined,
      expiryDate: normalizedExp,
      aliases: [firstWord],
      updatedAt: now,
    };

    // 2. Alle aktivierten Unterartikel übernehmen (deaktivierte fallen weg!)
    const clonedSubItems: InventoryItem[] = subDrafts
      .filter((s) => s.included && s.name.trim().length > 0)
      .map((s, idx) => {
        const subQty = roundStock(Math.max(0, parseFloat(s.quantity.replace(',', '.')) || 0));
        const subMin = roundStock(Math.max(0, parseFloat(s.minStock.replace(',', '.')) || 0));
        const subCat = categories.find((c) => c.id === s.category);
        const subFirstWord = s.name.trim().toLowerCase().split(/\s+/)[0] || s.name.trim().toLowerCase();

        return {
          id: `item-${Date.now()}-sub-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          name: s.name.trim(),
          category: s.category || category,
          categoryLabel: subCat?.label || catObj?.label,
          unit: s.unit.trim() || 'Stück',
          allowFractions: false,
          isReturnable: false,
          quantity: subQty,
          minStock: subMin,
          location: resolvedLocation,
          parentItemId: newParentId, // Verknüpft mit dem neuen geklonten Hauptartikel!
          expiryDate: s.expiryDate?.trim() ? normalizeExpiryDate(s.expiryDate.trim()) : undefined,
          aliases: [subFirstWord],
          updatedAt: now,
        };
      });

    onConfirmClone([clonedParent, ...clonedSubItems]);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-sky-500/40 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Copy className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2 flex-wrap">
                <span>Artikel klonen & anpassen</span>
                {originalSubItems.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                    <Box className="w-3.5 h-3.5" />
                    Kiste mit {originalSubItems.length} Unterartikeln
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Vorlage: <strong className="text-sky-300">„{sourceItem.name}“</strong>{' '}
                • Alle Eigenschaften können vor dem Anlegen beliebig bearbeitet werden.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            title="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmitClone} className="space-y-4">
          {/* SEKTION 1: HAUPTARTIKEL BEARBEITEN */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 sm:p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-sky-400" />
                <span>Hauptartikel / Kiste konfigurieren</span>
              </h4>
              <span className="text-[11px] text-slate-400">Pflichtfelder mit *</span>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">
                Name des neuen Artikels *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Kiste Moderation #2"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-sky-500 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400 font-medium"
              />
              {nameAlreadyExists && (
                <div className="mt-1.5 p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Hinweis: Ein Artikel mit diesem Namen existiert bereits im Keller.</span>
                </div>
              )}
            </div>

            {/* Kategorie & Einheitsprofil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Kategorie</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const nextCatId = e.target.value as CategoryId;
                    setCategory(nextCatId);
                    const catObj = categories.find((c) => c.id === nextCatId);
                    if (catObj?.defaultUnitProfile) {
                      setUnitProfile(catObj.defaultUnitProfile);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Einheitsprofil</label>
                <select
                  value={unitProfile}
                  onChange={(e) => setUnitProfile(e.target.value as UnitProfile)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white font-medium"
                >
                  <option value="piece">📦 Stückgut (Ganze Einheiten)</option>
                  <option value="beverage">🍺 Getränk (Kisten & Einzelflaschen)</option>
                  <option value="spice_bulk">🧂 Gewürze / Küchenbedarf (Ampel-Füllstand)</option>
                  <option value="consumable">🧻 Verbrauchsmaterial (Rollen, Packungen)</option>
                </select>
              </div>
            </div>

            {/* Bestand, Einheit & Füllstand bei Gewürzen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {unitProfile === 'spice_bulk' ? 'Geschlossener Vorrat' : 'Bestand'}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity('0')}
                    className="px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer shrink-0"
                    title="Bestand auf 0 setzen"
                  >
                    0
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Haupteinheit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="z. B. Kiste, Stück, Dose"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Mindestbestand</label>
                <input
                  type="text"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                />
              </div>
            </div>

            {/* Spezieller Gewürz-Füllstand (Lösung 3) falls spice_bulk aktiv */}
            {unitProfile === 'spice_bulk' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="text-xs font-semibold text-amber-200">
                  Füllstand der aktuell offenen Packung / Dose:
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['full', 'half', 'low', 'empty'] as SpiceFillLevel[]).map((lvl) => {
                    const cfg = SPICE_FILL_CONFIG[lvl];
                    const active = openPackLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setOpenPackLevel(lvl)}
                        className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          active
                            ? 'bg-amber-500/25 border-amber-400 text-white shadow'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full mb-1 ${cfg.dotClass}`} />
                        <span className="text-[11px] truncate">{cfg.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stellplatz & Ablaufdatum */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
                    <span>Stellplatz / Lagerort</span>
                  </label>
                  {onOpenLocationScanner && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenLocationScanner(location, (pickedLoc) => setLocation(pickedLoc))
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:underline cursor-pointer"
                    >
                      <QrCode className="w-3 h-3" />
                      <span>Platz wählen</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="z. B. GER-001 oder Regal A"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span>MHD / Ablaufdatum (optional)</span>
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                />
              </div>
            </div>

            {/* Optionaler Überartikel */}
            <div>
              <label className="block text-xs text-slate-300 mb-1 flex items-center gap-1">
                <Box className="w-3.5 h-3.5 text-amber-400" />
                <span>Liegt in anderer Über-Kiste (optional)</span>
              </label>
              <select
                value={parentItemId}
                onChange={(e) => {
                  const pid = e.target.value;
                  const parentObj = items.find((i) => i.id === pid);
                  setParentItemId(pid);
                  if (parentObj?.location) {
                    setLocation(parentObj.location);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
              >
                <option value="">— Eigenständiger Artikel / Eigene Box —</option>
                {items
                  .filter((i) => !i.parentItemId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      In Kiste: {p.name} {p.location ? `(${p.location})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Checkboxen */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowFractions}
                  onChange={(e) => setAllowFractions(e.target.checked)}
                  className="rounded accent-sky-500"
                />
                <span>Angebrochene Einheiten erlauben</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isReturnable}
                  onChange={(e) => setIsReturnable(e.target.checked)}
                  className="rounded accent-sky-500"
                />
                <span>Leihgerät mit Rückgabepflicht</span>
              </label>
            </div>
          </div>

          {/* SEKTION 2: ENTHALTENE UNTERARTIKEL (STANDARDMÄSSIG ALLE AKTIVIERT) */}
          {subDrafts.length > 0 ? (
            <div className="rounded-xl bg-slate-950/70 border border-amber-500/40 p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Enthaltene Unterartikel ({activeSubCount} von {subDrafts.length} aktiv)
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectAllSubs(true)}
                    className="inline-flex items-center gap-1 font-semibold text-amber-300 hover:underline cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Alle aktivieren</span>
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAllSubs(false)}
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-white hover:underline cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Alle deaktivieren</span>
                  </button>
                </div>
              </div>

              {/* Information zur Standard-Auswahl & Deaktivierung */}
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
                <strong>Standardmäßig sind alle Unterartikel im Klon enthalten.</strong> Klicke auf
                die Checkbox eines Unterartikels, um ihn zu deaktivieren — nur deaktivierte Artikel
                werden im geklonten Objekt <strong>nicht</strong> angelegt.
              </div>

              {/* Liste der Unterartikel mit direkt editierbaren Feldern */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {subDrafts.map((sub, index) => (
                  <div
                    key={sub.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      sub.included
                        ? 'bg-slate-900 border-amber-500/50 text-white'
                        : 'bg-slate-950/50 border-slate-800/80 text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Checkbox zur Aktivierung / Deaktivierung */}
                      <button
                        type="button"
                        onClick={() => toggleSubItem(sub.id)}
                        className={`p-1 rounded-lg border transition cursor-pointer shrink-0 ${
                          sub.included
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-500'
                        }`}
                        title={
                          sub.included
                            ? 'Artikel ist im Klon enthalten (klicken zum Deaktivieren)'
                            : 'Artikel ist deaktiviert (klicken zum Aktivieren)'
                        }
                      >
                        {sub.included ? (
                          <Check className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      {/* Wenn aktiv: Direkte Bearbeitung von Name, Menge & Einheit */}
                      {sub.included ? (
                        <div className="grid grid-cols-12 gap-2 flex-1 min-w-0 items-center">
                          <div className="col-span-12 sm:col-span-7">
                            <input
                              type="text"
                              value={sub.name}
                              onChange={(e) =>
                                handleUpdateSubField(sub.id, 'name', e.target.value)
                              }
                              placeholder="Unterartikel Name"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div className="col-span-6 sm:col-span-2">
                            <input
                              type="text"
                              value={sub.quantity}
                              onChange={(e) =>
                                handleUpdateSubField(sub.id, 'quantity', e.target.value)
                              }
                              placeholder="Menge"
                              className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white text-center font-semibold"
                            />
                          </div>

                          <div className="col-span-6 sm:col-span-3">
                            <input
                              type="text"
                              value={sub.unit}
                              onChange={(e) =>
                                handleUpdateSubField(sub.id, 'unit', e.target.value)
                              }
                              placeholder="Einheit"
                              className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <span className="text-xs line-through text-slate-500 truncate">
                            {sub.name || `Unterartikel #${index + 1}`} ({sub.quantity} {sub.unit})
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-rose-300/80 border border-slate-700 shrink-0">
                            Wird nicht geklont
                          </span>
                        </div>
                      )}

                      {/* Entfernen-Button für benutzerdefiniert hinzugefügte Unterartikel */}
                      {!sub.sourceId && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSubDraft(sub.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                          title="Diesen Entwurf ganz entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional: Weiteren Unterartikel hinzufügen */}
              <button
                type="button"
                onClick={handleAddExtraSub}
                className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 font-semibold cursor-pointer pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Weiteren Unterartikel zum Klon hinzufügen</span>
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <Box className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Dieser Quellartikel besitzt keine Unterartikel. Es wird ein eigenständiger geklonter
                Artikel angelegt.
              </span>
            </div>
          )}

          {/* Footer & Bestätigungs-Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold cursor-pointer"
            >
              Abbrechen
            </button>

            <button
              type="submit"
              disabled={!name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 cursor-pointer transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>
                Klonen bestätigen (1 Hauptartikel
                {activeSubCount > 0 ? ` + ${activeSubCount} Unterartikel` : ''})
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
