import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  PackagePlus,
  Search,
  Sparkles,
  ListChecks,
  FileText,
  Plus,
  Minus,
  Check,
  MapPin,
  RotateCcw,
  AlertCircle,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  QrCode,
  Box,
} from 'lucide-react';
import {
  AppSettings,
  BookingMode,
  CartEntry,
  CategoryId,
  InventoryItem,
  InventoryTransaction,
  MemberPermissions,
  ParsedTextItem,
  SpiceFillLevel,
} from '../types';
import { CATEGORIES, DEFAULT_ALLOWED_MEMBERS } from '../data/defaultData';
import {
  formatEnteredAmount,
  formatExpiryDate,
  formatGermanNumber,
  formatStockDisplay,
  getDaysUntilExpiry,
  getExpiryStatus,
  pluralizeUnit,
  roundStock,
  toPrimaryUnitQuantity,
  SPICE_FILL_CONFIG,
} from '../utils/units';
import { parseFreeTextBlock, parseTextWithAI } from '../utils/textParser';
import {
  parseStorageLocationInput,
  StorageLocationSpot,
} from '../utils/storageLocations';
import { QrScannerModal } from './QrScannerModal';
import { LocationAssignmentModal } from './LocationAssignmentModal';
import { SubItemsModal } from './SubItemsModal';

interface OpenBookingViewProps {
  items: InventoryItem[];
  transactions: InventoryTransaction[];
  settings: AppSettings;
  currentUserName: string;
  userPermissions?: MemberPermissions;
  selectedReturnTxId: string | null;
  onClearSelectedReturnTx: () => void;
  onExecuteBooking: (params: {
    mode: BookingMode;
    entries: CartEntry[];
    personName?: string;
    eventName?: string;
    note?: string;
    relatedTransactionId?: string;
  }) => void;
  onUpdateItemExpiry?: (itemId: string, expiryDate?: string) => void;
  onUpdateItemLocation?: (itemId: string, location?: string) => void;
  onBulkUpdateItemLocations?: (itemIds: string[], location?: string) => void;
  onAddSubItems?: (parentItem: InventoryItem, newSubItems: InventoryItem[]) => void;
  onAssignItemToParent?: (itemId: string, parentItem: InventoryItem | null) => void;
  onDeleteItem?: (itemId: string) => void;
  onUpdateItemSpiceLevel?: (itemId: string, level: SpiceFillLevel) => void;
  scannedLocationCode?: string | null;
  onClearScannedLocationCode?: () => void;
}

export const OpenBookingView: React.FC<OpenBookingViewProps> = ({
  items,
  transactions,
  settings,
  currentUserName,
  userPermissions,
  selectedReturnTxId,
  onClearSelectedReturnTx,
  onExecuteBooking,
  onUpdateItemExpiry,
  onUpdateItemLocation,
  onBulkUpdateItemLocations,
  onAddSubItems,
  onAssignItemToParent,
  onDeleteItem,
  onUpdateItemSpiceLevel,
  scannedLocationCode,
  onClearScannedLocationCode,
}) => {
  const canBook = !userPermissions || userPermissions.canBook;
  const canRestock = !userPermissions || userPermissions.canRestock;
  const [mode, setMode] = useState<BookingMode>(() =>
    !canBook && canRestock ? 'restock' : 'withdraw'
  );

  useEffect(() => {
    if (!canBook && canRestock && mode !== 'restock') {
      setMode('restock');
    } else if (canBook && !canRestock && mode === 'restock') {
      setMode('withdraw');
    }
  }, [canBook, canRestock, mode]);
  const [inputMethod, setInputMethod] = useState<'list' | 'text'>('list');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mhdEditingItem, setMhdEditingItem] = useState<InventoryItem | null>(null);
  const [mhdDateDraft, setMhdDateDraft] = useState<string>('');
  const [locationEditingItem, setLocationEditingItem] = useState<InventoryItem | null>(null);
  const [subItemsManagingParent, setSubItemsManagingParent] = useState<InventoryItem | null>(null);
  const [expandedBoxIds, setExpandedBoxIds] = useState<Record<string, boolean>>({});
  const [globalScannerOpen, setGlobalScannerOpen] = useState(false);
  const [activeLocationSpot, setActiveLocationSpot] = useState<StorageLocationSpot | null>(null);

  useEffect(() => {
    if (scannedLocationCode) {
      const parsed = parseStorageLocationInput(scannedLocationCode);
      if (parsed) {
        setActiveLocationSpot(parsed);
        setSearchQuery(parsed.code);
      }
      onClearScannedLocationCode?.();
    }
  }, [scannedLocationCode]);

  // Warenkorb: itemId -> { itemId, amount, unit }
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  // Bevorzugte Einheit pro Artikel in der Listenansicht (z. B. "Kiste" vs "Flasche")
  const [unitPreference, setUnitPreference] = useState<Record<string, string>>({});

  // Erlaubte Namensliste aus den Einstellungen
  const allowedMembers = useMemo(
    () =>
      Array.isArray(settings.allowedMembers) && settings.allowedMembers.length > 0
        ? settings.allowedMembers
        : DEFAULT_ALLOWED_MEMBERS,
    [settings.allowedMembers]
  );

  function findAllowedMember(raw: string): string | null {
    const clean = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!clean) return null;
    const found = allowedMembers.find(
      (m) => m.trim().toLowerCase().replace(/\s+/g, ' ') === clean
    );
    return found || null;
  }

  // Personen- & Event-Felder (Person wird automatisch aus dem eingeloggten Account übernommen)
  const [personName, setPersonName] = useState<string>(() => currentUserName || '');
  useEffect(() => {
    if (currentUserName) {
      setPersonName(currentUserName);
    }
  }, [currentUserName]);
  const [showMemberDropdown, setShowMemberDropdown] = useState<boolean>(false);
  const [eventName, setEventName] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Freitext-Parser State
  const [freeText, setFreeText] = useState<string>('');
  const [parsedPreview, setParsedPreview] = useState<ParsedTextItem[]>([]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Event-/Rückgabe-Assistent State
  const [activeReturnTxId, setActiveReturnTxId] = useState<string | null>(null);
  const [returnAmounts, setReturnAmounts] = useState<
    Record<string, { amount: number; unit: string }>
  >({});

  // Erfolgsmeldung & Warnhinweise
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [nameError, setNameError] = useState<boolean>(false);
  const [nameErrorMessage, setNameErrorMessage] = useState<string>('');
  const personInputRef = React.useRef<HTMLInputElement>(null);

  const filteredMemberSuggestions = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return allowedMembers;
    const exactMatch = allowedMembers.some((m) => m.toLowerCase() === q);
    if (exactMatch) return allowedMembers;
    return allowedMembers.filter((m) => m.toLowerCase().includes(q));
  }, [personName, allowedMembers]);

  // Aktuell offen ausgeliehene / entnommene Menge pro Artikel (in Haupteinheit)
  const openWithdrawnByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.type !== 'withdraw' || tx.status === 'completed') continue;
      for (const line of tx.items) {
        const taken = Math.abs(line.quantityChange);
        const alreadyRet = line.returnedQuantity || 0;
        const rem = Math.max(0, roundStock(taken - alreadyRet));
        if (rem > 0) {
          map[line.itemId] = roundStock((map[line.itemId] || 0) + rem);
        }
      }
    }
    return map;
  }, [transactions]);

  function getMaxReturnInUnit(item: InventoryItem, maxPrimary: number, unit: string): number {
    if (
      item.subUnit &&
      item.subUnitsPerUnit &&
      item.subUnitsPerUnit > 1 &&
      unit.trim().toLowerCase() === item.subUnit.trim().toLowerCase()
    ) {
      return roundStock(maxPrimary * item.subUnitsPerUnit);
    }
    return roundStock(maxPrimary);
  }

  function getMaxAllowedForModeInUnit(
    item: InventoryItem,
    targetMode: BookingMode,
    unit: string
  ): number {
    if (targetMode === 'withdraw') {
      return getMaxReturnInUnit(item, Math.max(0, item.quantity), unit);
    }
    if (targetMode === 'return') {
      const openPrimary = openWithdrawnByItem[item.id] || 0;
      return getMaxReturnInUnit(item, openPrimary, unit);
    }
    return Infinity;
  }

  function showWarningBanner(msg: string) {
    setWarningBanner(msg);
    setTimeout(() => {
      setWarningBanner((prev) => (prev === msg ? null : prev));
    }, 5500);
  }

  // Wenn in den Modus "withdraw" oder "return" gewechselt wird, Warenkorb automatisch auf Lagerbestand bzw. ausgeliehene Menge begrenzen
  useEffect(() => {
    if (mode === 'restock') return;
    setCart((prev) => {
      const next: Record<string, CartEntry> = {};
      for (const [id, entry] of Object.entries(prev)) {
        const item = items.find((i) => i.id === id);
        if (!item) continue;
        const maxInUnit = getMaxAllowedForModeInUnit(item, mode, entry.unit);
        const clamped = roundStock(Math.min(entry.amount, maxInUnit));
        if (clamped > 0) {
          next[id] = { ...entry, amount: clamped };
        }
      }
      return next;
    });
  }, [mode, openWithdrawnByItem, items]);

  // Wenn aus dem Logbuch eine Entnahme zur Rückgabe ausgewählt wurde
  useEffect(() => {
    if (selectedReturnTxId) {
      setMode('return');
      initEventReturn(selectedReturnTxId);
      onClearSelectedReturnTx();
    }
  }, [selectedReturnTxId]);

  // Offene / frühere Entnahmen für den Event-Rückgabe-Modus finden
  const recentWithdrawals = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === 'withdraw' && tx.status !== 'completed')
      .slice(0, 12);
  }, [transactions]);

  const activeReturnTx = useMemo(
    () => transactions.find((t) => t.id === activeReturnTxId) || null,
    [transactions, activeReturnTxId]
  );

  function initEventReturn(txId: string) {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;
    setActiveReturnTxId(txId);
    if (tx.personName) setPersonName(tx.personName);
    if (tx.eventName) setEventName(tx.eventName);

    const initial: Record<string, { amount: number; unit: string }> = {};
    for (const line of tx.items) {
      const catItem = items.find((i) => i.id === line.itemId);
      const alreadyReturnedPrimary = line.returnedQuantity || 0;
      const takenPrimary = Math.abs(line.quantityChange);
      const remainingPrimary = Math.max(0, roundStock(takenPrimary - alreadyReturnedPrimary));

      // Bei Leihgeräten (Werkzeug/Technik) standardmäßig die volle offene Menge vorauswählen,
      // bei Verbrauchsmaterial/Getränken 0 (sodass man nur einträgt, was übrig geblieben ist)
      if (catItem?.isReturnable) {
        initial[line.itemId] = {
          amount: remainingPrimary,
          unit: catItem.unit,
        };
      } else {
        initial[line.itemId] = {
          amount: 0,
          unit: line.enteredUnit || catItem?.unit || 'Stück',
        };
      }
    }
    setReturnAmounts(initial);
  }

  // Lokale Freitext-Erkennung automatisch aktualisieren, sobald Text geändert wird
  useEffect(() => {
    if (!freeText.trim()) {
      setParsedPreview([]);
      return;
    }
    const res = parseFreeTextBlock(freeText, items);
    setParsedPreview(res.items);
    if (res.suggestedEvent && !eventName) {
      setEventName(res.suggestedEvent);
    }
    if (res.suggestedPerson && !personName) {
      setPersonName(res.suggestedPerson);
    }
  }, [freeText, items]);

  async function handleRunAiParser() {
    if (!freeText.trim()) return;
    setIsAiLoading(true);
    try {
      const res = await parseTextWithAI(freeText, items, settings);
      setParsedPreview(res.items);
      if (res.suggestedEvent) setEventName(res.suggestedEvent);
      if (res.suggestedPerson) setPersonName(res.suggestedPerson);
    } finally {
      setIsAiLoading(false);
    }
  }

  function applyParsedItemsToCart() {
    const nextCart = { ...cart };
    let count = 0;
    let cappedWarning = false;

    for (const p of parsedPreview) {
      if (!p.matchedItem || p.amount <= 0) continue;
      const itemId = p.matchedItem.id;
      const existing = nextCart[itemId];

      let desiredAmount =
        existing && existing.unit === p.unit
          ? roundStock(existing.amount + p.amount)
          : roundStock(p.amount);

      if (mode === 'withdraw' || mode === 'return') {
        const maxInUnit = getMaxAllowedForModeInUnit(p.matchedItem, mode, p.unit);
        if (desiredAmount > maxInUnit) {
          desiredAmount = maxInUnit;
          cappedWarning = true;
        }
      }

      if (desiredAmount > 0) {
        nextCart[itemId] = {
          itemId,
          amount: desiredAmount,
          unit: p.unit,
        };
        setUnitPreference((prev) => ({ ...prev, [itemId]: p.unit }));
        count++;
      }
    }

    setCart(nextCart);
    setFreeText('');
    setParsedPreview([]);
    setInputMethod('list');
    if (cappedWarning) {
      showWarningBanner(
        mode === 'withdraw'
          ? 'Hinweis: Entnahmemengen wurden auf den aktuell verfügbaren Lagerbestand begrenzt.'
          : 'Hinweis: Rückgabemengen wurden auf die maximal ausgeliehene Menge begrenzt. Extra Inventar kann über „Befüllen / Einkauf“ hinzugefügt werden.'
      );
    }
    if (count > 0) {
      showTemporaryBanner(`${count} erkannte Position(en) in deine Auswahl übernommen!`);
    }
  }

  function showTemporaryBanner(msg: string) {
    setSuccessBanner(msg);
    setTimeout(() => {
      setSuccessBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  function getSelectedUnit(item: InventoryItem): string {
    return unitPreference[item.id] || cart[item.id]?.unit || item.unit;
  }

  function handleUnitSwitch(item: InventoryItem, newUnit: string) {
    setUnitPreference((prev) => ({ ...prev, [item.id]: newUnit }));
    if (cart[item.id]) {
      setCart((prev) => {
        const currentEntry = prev[item.id];
        if (!currentEntry) return prev;
        let nextAmt = currentEntry.amount;
        if (mode === 'withdraw' || mode === 'return') {
          const maxInUnit = getMaxAllowedForModeInUnit(item, mode, newUnit);
          nextAmt = roundStock(Math.min(nextAmt, maxInUnit));
        }
        if (nextAmt <= 0) {
          const copy = { ...prev };
          delete copy[item.id];
          return copy;
        }
        return {
          ...prev,
          [item.id]: {
            ...currentEntry,
            amount: nextAmt,
            unit: newUnit,
          },
        };
      });
    }
  }

  function adjustCartAmount(item: InventoryItem, delta: number) {
    const unit = getSelectedUnit(item);
    const current = cart[item.id]?.amount || 0;
    let nextAmount = roundStock(Math.max(0, current + delta));

    if (delta > 0 && (mode === 'withdraw' || mode === 'return')) {
      const maxInUnit = getMaxAllowedForModeInUnit(item, mode, unit);
      if (maxInUnit <= 0) {
        showWarningBanner(
          mode === 'withdraw'
            ? `Von „${item.name}“ ist aktuell nichts auf Lager (Bestand: 0).`
            : `Von „${item.name}“ ist aktuell nichts ausgeliehen. Extra Inventar kann über das „Befüllen / Einkauf“-Menü hinzugefügt werden.`
        );
        return;
      }
      if (nextAmount > maxInUnit) {
        nextAmount = maxInUnit;
        showWarningBanner(
          mode === 'withdraw'
            ? `Maximal ${formatEnteredAmount(maxInUnit, unit)} von „${item.name}“ im Lagerbestand verfügbar.`
            : `Maximal ${formatEnteredAmount(maxInUnit, unit)} von „${item.name}“ zurückgebbar (aktuell ausgeliehen). Extra Inventar bitte über „Befüllen / Einkauf“ hinzufügen.`
        );
      }
    }

    setCart((prev) => {
      const copy = { ...prev };
      if (nextAmount <= 0) {
        delete copy[item.id];
      } else {
        copy[item.id] = {
          itemId: item.id,
          amount: nextAmount,
          unit,
        };
      }
      return copy;
    });
  }

  function setExactCartAmount(item: InventoryItem, rawVal: string) {
    const unit = getSelectedUnit(item);
    const parsed = parseFloat(rawVal.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      setCart((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }

    let finalAmount = roundStock(parsed);
    if (mode === 'withdraw' || mode === 'return') {
      const maxInUnit = getMaxAllowedForModeInUnit(item, mode, unit);
      if (maxInUnit <= 0) {
        showWarningBanner(
          mode === 'withdraw'
            ? `Von „${item.name}“ ist aktuell nichts auf Lager (Bestand: 0).`
            : `Von „${item.name}“ ist aktuell nichts ausgeliehen. Extra Inventar kann über das „Befüllen / Einkauf“-Menü hinzugefügt werden.`
        );
        setCart((prev) => {
          const copy = { ...prev };
          delete copy[item.id];
          return copy;
        });
        return;
      }
      if (finalAmount > maxInUnit) {
        finalAmount = maxInUnit;
        showWarningBanner(
          mode === 'withdraw'
            ? `Maximal ${formatEnteredAmount(maxInUnit, unit)} von „${item.name}“ im Lagerbestand verfügbar.`
            : `Maximal ${formatEnteredAmount(maxInUnit, unit)} von „${item.name}“ zurückgebbar (aktuell ausgeliehen). Extra Inventar bitte über „Befüllen / Einkauf“ hinzufügen.`
        );
      }
    }

    setCart((prev) => ({
      ...prev,
      [item.id]: {
        itemId: item.id,
        amount: finalAmount,
        unit,
      },
    }));
  }

  const subItemsByParentId = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {};
    for (const it of items) {
      if (it.parentItemId) {
        if (!map[it.parentItemId]) map[it.parentItemId] = [];
        map[it.parentItemId].push(it);
      }
    }
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    function itemMatchesQuery(item: InventoryItem, q: string): boolean {
      const matchName = item.name.toLowerCase().includes(q);
      const matchLoc = (item.location || '').toLowerCase().includes(q);
      const matchAlias = item.aliases.some((a) => a.toLowerCase().includes(q));
      const matchExpiry = item.expiryDate
        ? item.expiryDate.includes(q) ||
          formatExpiryDate(item.expiryDate).includes(q) ||
          (q === 'mhd' || q === 'abgelaufen'
            ? getExpiryStatus(item.expiryDate) === 'expired' ||
              getExpiryStatus(item.expiryDate) === 'warning'
            : false)
        : false;
      return matchName || matchLoc || matchAlias || matchExpiry;
    }

    const q = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      // Unterartikel standardmäßig in ihrer Kiste gruppieren (sofern die Kiste existiert)
      if (item.parentItemId && items.some((p) => p.id === item.parentItemId)) {
        return false;
      }

      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        const subs = subItemsByParentId[item.id] || [];
        if (!subs.some((s) => s.category === selectedCategory)) {
          return false;
        }
      }

      if (q) {
        if (itemMatchesQuery(item, q)) return true;
        const subs = subItemsByParentId[item.id] || [];
        return subs.some((s) => itemMatchesQuery(s, q));
      }
      return true;
    });
  }, [items, selectedCategory, searchQuery, subItemsByParentId]);

  const cartEntries = useMemo(() => Object.values(cart).filter((c) => c.amount > 0), [cart]);

  function handleConfirmCartBooking() {
    if (cartEntries.length === 0) return;

    const trimmedName = personName.trim();

    // Bei Entnahme aus dem Keller ist der Name zwingend erforderlich
    if (mode === 'withdraw' && !trimmedName) {
      const msg =
        'Bitte gib deinen Namen ein – bei der Entnahme aus dem Keller ist der Name ein Pflichtfeld.';
      setNameError(true);
      setNameErrorMessage(msg);
      personInputRef.current?.focus();
      showWarningBanner(msg);
      return;
    }

    // Sofern ein Name angegeben ist (bei Entnahme immer), muss er in der Liste der erlaubten Namen stehen
    let canonicalName: string | undefined = undefined;
    if (trimmedName) {
      const matched = findAllowedMember(trimmedName);
      if (!matched) {
        const msg = `Der Name „${trimmedName}“ ist nicht freigeschaltet. Bitte wähle deinen vollständigen Namen aus der hinterlegten Namensliste.`;
        setNameError(true);
        setNameErrorMessage(msg);
        setShowMemberDropdown(true);
        personInputRef.current?.focus();
        showWarningBanner(msg);
        return;
      }
      canonicalName = matched;
    }

    setNameError(false);
    setNameErrorMessage('');
    setShowMemberDropdown(false);
    if (canonicalName) {
      setPersonName(canonicalName);
      localStorage.setItem('vk_last_person_name', canonicalName);
    }

    onExecuteBooking({
      mode,
      entries: cartEntries,
      personName: canonicalName,
      eventName: eventName.trim() || undefined,
      note: note.trim() || undefined,
    });

    const actionLabel =
      mode === 'withdraw'
        ? 'Entnahme'
        : mode === 'return'
        ? 'Rückgabe'
        : 'Befüllung / Einkauf';

    showTemporaryBanner(
      `${actionLabel} mit ${cartEntries.length} Position(en) erfolgreich gebucht!`
    );
    setCart({});
    setNote('');
  }

  function handleConfirmEventReturn() {
    if (!activeReturnTx) return;

    let canonicalName: string | undefined = activeReturnTx.personName;
    if (personName.trim()) {
      const matched = findAllowedMember(personName.trim());
      if (!matched && personName.trim() !== activeReturnTx.personName) {
        const msg = `Der Name „${personName.trim()}“ steht nicht auf der erlaubten Namensliste.`;
        showWarningBanner(msg);
        return;
      }
      canonicalName = matched || activeReturnTx.personName;
    }

    const entries: CartEntry[] = Object.entries(returnAmounts)
      .filter(([, val]) => val.amount > 0)
      .map(([itemId, val]) => ({
        itemId,
        amount: roundStock(val.amount),
        unit: val.unit,
      }));

    if (entries.length === 0) {
      // Wenn 0 zurückgegeben wird (alles verbraucht), markieren wir das Event trotzdem als abgeschlossen
      onExecuteBooking({
        mode: 'return',
        entries: [],
        personName: canonicalName,
        eventName: eventName.trim() || activeReturnTx.eventName,
        note: 'Alles restlos aufgebraucht (keine Rest-Rückgabe)',
        relatedTransactionId: activeReturnTx.id,
      });
      showTemporaryBanner('Event-Entnahme als vollständig verbraucht / erledigt markiert!');
      setActiveReturnTxId(null);
      return;
    }

    if (canonicalName) {
      localStorage.setItem('vk_last_person_name', canonicalName);
    }

    onExecuteBooking({
      mode: 'return',
      entries,
      personName: canonicalName,
      eventName: eventName.trim() || activeReturnTx.eventName,
      note: note.trim() || `Rückgabe zu ${activeReturnTx.eventName || 'Entnahme'}`,
      relatedTransactionId: activeReturnTx.id,
    });

    showTemporaryBanner(`Rückgabe (${entries.length} Positionen) erfolgreich in den Keller gebucht!`);
    setActiveReturnTxId(null);
    setReturnAmounts({});
    setNote('');
  }

  const modeConfig = {
    withdraw: {
      title: 'Entnehmen (Aus dem Keller holen)',
      subtitle: 'Wähle Artikel aus der Liste oder füge einen Textblock ein.',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      buttonClass: 'bg-rose-500 hover:bg-rose-400 text-slate-950 shadow-rose-500/25',
      actionText: 'Entnahme jetzt buchen',
    },
    return: {
      title: 'Zurückgeben (Reste & Leihgeräte einräumen)',
      subtitle: 'Gib nicht verbrauchte Reste oder ausgeliehenes Equipment zurück (max. ausgeliehene Menge).',
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      buttonClass: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/25',
      actionText: 'Rückgabe jetzt buchen',
    },
    restock: {
      title: 'Befüllen / Einkauf einbuchen',
      subtitle: 'Trage neu gekaufte Getränke, Materialien oder Anschaffungen ein.',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      buttonClass: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25',
      actionText: 'Einkauf / Befüllung buchen',
    },
  }[mode];

  return (
    <div className="space-y-5 pb-36">
      {/* Erfolgs-Banner */}
      {successBanner && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 shadow-lg animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{successBanner}</span>
        </div>
      )}

      {/* Warn-Banner (z. B. fehlender Pflichtname oder Rückgabe-Limit erreicht) */}
      {warningBanner && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 shadow-lg animate-fade-in">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-sm font-medium">{warningBanner}</span>
        </div>
      )}

      {!canBook && !canRestock && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Nur-Lese-Ansicht:</strong> Dein Account ist für das Einsehen des Kellerbestands freigeschaltet. Ein-/Ausbuchungen und Nachbestellungen sind für deinen Account deaktiviert.
          </span>
        </div>
      )}

      {/* 1. Haupt-Modus-Umschalter: Entnehmen | Zurückgeben | Befüllen */}
      {(canBook || canRestock) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-lg">
          <div className="flex flex-wrap sm:grid sm:grid-flow-col sm:auto-cols-fr gap-1.5">
            {canBook && (
              <button
                onClick={() => {
                  setMode('withdraw');
                  setActiveReturnTxId(null);
                }}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-3 rounded-xl font-semibold text-xs sm:text-sm transition cursor-pointer ${
                  mode === 'withdraw'
                    ? 'bg-rose-500 text-slate-950 shadow-lg shadow-rose-500/25'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Entnehmen</span>
              </button>
            )}

            {canBook && (
              <button
                onClick={() => setMode('return')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-3 rounded-xl font-semibold text-xs sm:text-sm transition cursor-pointer ${
                  mode === 'return'
                    ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/25'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Zurückgeben</span>
                {recentWithdrawals.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      mode === 'return'
                        ? 'bg-slate-950 text-sky-300'
                        : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {recentWithdrawals.length}
                  </span>
                )}
              </button>
            )}

            {canRestock && (
              <button
                onClick={() => {
                  setMode('restock');
                  setActiveReturnTxId(null);
                }}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 px-3 rounded-xl font-semibold text-xs sm:text-sm transition cursor-pointer ${
                  mode === 'restock'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <PackagePlus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Befüllen / Einkauf (Nachbestellen)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Spezial-Bereich bei "Zurückgeben": Frühere Entnahme / Event auswählen */}
      {mode === 'return' && (
        <div className="bg-slate-900/90 border border-sky-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-sky-400" />
              <h2 className="font-semibold text-white text-sm sm:text-base">
                Event- & Ausleih-Rückgabe (Reste nach Veranstaltung einbuchen)
              </h2>
            </div>
            {activeReturnTx && (
              <button
                onClick={() => setActiveReturnTxId(null)}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                Zurück zur Übersicht
              </button>
            )}
          </div>

          {!activeReturnTx ? (
            recentWithdrawals.length === 0 ? (
              <p className="text-xs text-slate-400">
                Aktuell gibt es keine offenen Entnahmen. Du kannst nur Artikel zurückgeben, die zuvor entnommen wurden. Neues / zusätzliches Inventar kannst du jederzeit über „Befüllen / Einkauf“ hinzufügen.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  Tippe auf eine frühere Entnahme, um direkt einzutragen, was davon übrig geblieben oder zurückgebracht wurde:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recentWithdrawals.map((tx) => (
                    <button
                      key={tx.id}
                      onClick={() => initEventReturn(tx.id)}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-sky-500/50 text-left transition cursor-pointer group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-sky-300 truncate">
                            {tx.eventName || 'Entnahme'}
                          </span>
                          {tx.personName && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-200">
                              {tx.personName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {new Date(tx.timestamp).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          • {tx.items.length} Position(en)
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-sky-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            /* Aktiver Event-Rückgabe-Assistent */
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-500/10 border border-sky-500/20 rounded-xl p-3">
                <div>
                  <span className="text-xs text-sky-300 font-medium">Ausgewählte Entnahme:</span>
                  <h3 className="font-bold text-white text-sm sm:text-base">
                    {activeReturnTx.eventName || 'Entnahme'}{' '}
                    {activeReturnTx.personName ? `(${activeReturnTx.personName})` : ''}
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Vom {new Date(activeReturnTx.timestamp).toLocaleString('de-DE')}
                </span>
              </div>

              <div className="space-y-2.5">
                {activeReturnTx.items.map((line) => {
                  const catalogItem = items.find((i) => i.id === line.itemId);
                  const currentReturn = returnAmounts[line.itemId] || {
                    amount: 0,
                    unit: line.enteredUnit,
                  };
                  const takenPrimary = Math.abs(line.quantityChange);
                  const alreadyRet = line.returnedQuantity || 0;
                  const openPrimary = Math.max(0, roundStock(takenPrimary - alreadyRet));
                  const maxInCurrentUnit = catalogItem
                    ? getMaxReturnInUnit(catalogItem, openPrimary, currentReturn.unit)
                    : openPrimary;

                  return (
                    <div
                      key={line.itemId}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{line.itemName}</span>
                          {catalogItem?.isReturnable && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              Leihgerät
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Damals entnommen:{' '}
                          <strong className="text-slate-200">
                            {formatEnteredAmount(line.enteredAmount, line.enteredUnit)}
                          </strong>
                          {alreadyRet > 0 && catalogItem && (
                            <span className="text-emerald-400 ml-2">
                              (Bereits zurück: {formatGermanNumber(alreadyRet)} {catalogItem.unit})
                            </span>
                          )}
                          <span className="text-sky-300 ml-2">
                            • Max. rückgebbar: {formatEnteredAmount(maxInCurrentUnit, currentReturn.unit)}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Schnell-Buttons */}
                        <button
                          type="button"
                          onClick={() =>
                            setReturnAmounts((prev) => ({
                              ...prev,
                              [line.itemId]: { amount: 0, unit: currentReturn.unit },
                            }))
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                            currentReturn.amount === 0
                              ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          Verbraucht (0)
                        </button>

                        {catalogItem && (
                          <button
                            type="button"
                            onClick={() =>
                              setReturnAmounts((prev) => ({
                                ...prev,
                                [line.itemId]: {
                                  amount: openPrimary,
                                  unit: catalogItem.unit,
                                },
                              }))
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                              currentReturn.amount === openPrimary &&
                              currentReturn.unit === catalogItem.unit
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                            }`}
                          >
                            Alles zurück ({formatGermanNumber(openPrimary)} {catalogItem.unit})
                          </button>
                        )}

                        {/* Manuelle Rückgabemenge + Einheit */}
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                          <span className="text-xs text-slate-400">Zurück:</span>
                          <input
                            type="number"
                            min="0"
                            max={maxInCurrentUnit}
                            step="0.5"
                            value={currentReturn.amount}
                            onChange={(e) => {
                              const rawVal = Math.max(0, parseFloat(e.target.value) || 0);
                              const clampedVal = roundStock(Math.min(rawVal, maxInCurrentUnit));
                              if (rawVal > maxInCurrentUnit) {
                                showWarningBanner(
                                  `Du kannst maximal die ausgeliehene Menge (${formatEnteredAmount(
                                    maxInCurrentUnit,
                                    currentReturn.unit
                                  )}) zurückgeben. Extra Inventar bitte über „Befüllen / Einkauf“ hinzufügen.`
                                );
                              }
                              setReturnAmounts((prev) => ({
                                ...prev,
                                [line.itemId]: {
                                  amount: clampedVal,
                                  unit: currentReturn.unit,
                                },
                              }));
                            }}
                            className="w-16 bg-transparent text-right font-semibold text-sm text-white focus:outline-none"
                          />
                          {catalogItem?.subUnit ? (
                            <select
                              value={currentReturn.unit}
                              onChange={(e) => {
                                const newUnit = e.target.value;
                                const newMax = getMaxReturnInUnit(
                                  catalogItem,
                                  openPrimary,
                                  newUnit
                                );
                                setReturnAmounts((prev) => ({
                                  ...prev,
                                  [line.itemId]: {
                                    amount: roundStock(Math.min(currentReturn.amount, newMax)),
                                    unit: newUnit,
                                  },
                                }));
                              }}
                              className="bg-slate-800 text-xs text-sky-300 rounded px-1.5 py-0.5 border border-slate-700"
                            >
                              <option value={catalogItem.unit}>{catalogItem.unit}</option>
                              <option value={catalogItem.subUnit}>{catalogItem.subUnit}</option>
                            </select>
                          ) : (
                            <span className="text-xs text-slate-300">
                              {currentReturn.unit}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveReturnTxId(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEventReturn}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/25 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Rückgabe für dieses Event abschließen</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Umschalter zwischen "Kategorisierte Klick-Liste" und "Textblock einfügen" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/70 border border-slate-800/90 rounded-2xl p-3.5">
        <div>
          <span
            className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border mb-1 ${modeConfig.badgeClass}`}
          >
            {modeConfig.title}
          </span>
          <p className="text-xs text-slate-400">{modeConfig.subtitle}</p>
        </div>

        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto w-full sm:w-auto">
          <button
            onClick={() => setInputMethod('list')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              inputMethod === 'list'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListChecks className="w-4 h-4 text-sky-400" />
            <span>Klick-Liste (+/-)</span>
          </button>
          <button
            onClick={() => setInputMethod('text')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              inputMethod === 'text'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Textblock einfügen</span>
          </button>
        </div>
      </div>

      {/* EINGABEMETHODE B: Intelligenter Textblock-Parser */}
      {inputMethod === 'text' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Textblock einfügen & automatisch erkennen</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Füge einfach eine WhatsApp-Nachricht oder Liste ein. Mengen, Einheiten (z. B. Kisten, Flaschen, halbe Rollen) und Artikel werden automatisch erkannt.
              </p>
            </div>

            {/* Schnell-Beispiele zum Testen */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setFreeText(
                    'Fürs Sommerfest:\n3 Kisten Bier, 2 Kisten Cola, 6 Flaschen Wasser, 1,5 Rollen Gaffa-Tape, halbe Packung Servietten, 2x Bierzeltgarnitur'
                  )
                }
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 cursor-pointer"
              >
                Beispiel-Text einfügen
              </button>
            </div>
          </div>

          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={4}
            placeholder="Beispiel: Fürs Sommerfest: 2 Kisten Bier, 5 Flaschen Cola, 1,5 Rollen Gaffa, 1x Kabeltrommel ..."
            className="w-full rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-500 focus:outline-none p-3.5 text-sm text-white placeholder:text-slate-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              Lokale Offline-Erkennung aktiv (funktioniert auch ohne Internet im Keller).
            </span>
            {settings.aiApiKey && (
              <button
                type="button"
                onClick={handleRunAiParser}
                disabled={isAiLoading || !freeText.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAiLoading ? 'KI analysiert...' : 'Zusätzlich mit KI prüfen'}</span>
              </button>
            )}
          </div>

          {/* Vorschau der erkannten Artikel */}
          {parsedPreview.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Erkannte Positionen ({parsedPreview.filter((p) => p.matchedItem).length} von{' '}
                {parsedPreview.length} zugeordnet)
              </h4>

              <div className="space-y-2">
                {parsedPreview.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      entry.matchedItem
                        ? 'bg-slate-950/90 border-slate-800'
                        : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 italic">„{entry.rawSegment}“</span>
                      </div>
                      {/* Manuelle Artikel-Zuordnung per Dropdown möglich */}
                      <div className="flex items-center gap-2">
                        <select
                          value={entry.matchedItem?.id || ''}
                          onChange={(e) => {
                            const newItem = items.find((i) => i.id === e.target.value);
                            setParsedPreview((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? {
                                      ...p,
                                      matchedItem: newItem,
                                      unit: newItem?.unit || p.unit,
                                      normalizedQuantity: newItem
                                        ? toPrimaryUnitQuantity(newItem, p.amount, newItem.unit)
                                        : p.amount,
                                    }
                                  : p
                              )
                            );
                          }}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium text-white"
                        >
                          <option value="">-- Artikel manuell wählen --</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} ({formatStockDisplay(it).primaryText})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {entry.matchedItem && (
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <input
                          type="number"
                          min="0"
                          max={
                            mode === 'withdraw' || mode === 'return'
                              ? getMaxAllowedForModeInUnit(entry.matchedItem, mode, entry.unit)
                              : undefined
                          }
                          step="0.5"
                          value={entry.amount}
                          onChange={(e) => {
                            const rawVal = Math.max(0, parseFloat(e.target.value) || 0);
                            const maxAllowed =
                              mode === 'withdraw' || mode === 'return'
                                ? getMaxAllowedForModeInUnit(entry.matchedItem!, mode, entry.unit)
                                : Infinity;
                            const val = roundStock(Math.min(rawVal, maxAllowed));
                            setParsedPreview((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? {
                                      ...p,
                                      amount: val,
                                      normalizedQuantity: p.matchedItem
                                        ? toPrimaryUnitQuantity(p.matchedItem, val, p.unit)
                                        : val,
                                    }
                                  : p
                              )
                            );
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-sm font-bold text-white"
                        />

                        {entry.matchedItem.subUnit ? (
                          <select
                            value={entry.unit}
                            onChange={(e) => {
                              const newU = e.target.value;
                              setParsedPreview((prev) =>
                                prev.map((p, i) =>
                                  i === idx
                                    ? {
                                        ...p,
                                        unit: newU,
                                        normalizedQuantity: p.matchedItem
                                          ? toPrimaryUnitQuantity(p.matchedItem, p.amount, newU)
                                          : p.amount,
                                      }
                                    : p
                                )
                              );
                            }}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-sky-300 font-medium"
                          >
                            <option value={entry.matchedItem.unit}>{entry.matchedItem.unit}</option>
                            <option value={entry.matchedItem.subUnit}>
                              {entry.matchedItem.subUnit}
                            </option>
                          </select>
                        ) : (
                          <span className="text-xs text-slate-300 font-medium px-1">
                            {pluralizeUnit(entry.unit, entry.amount)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={applyParsedItemsToCart}
                  disabled={!parsedPreview.some((p) => p.matchedItem && p.amount > 0)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 cursor-pointer disabled:opacity-40"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Erkannte Artikel in Auswahl übernehmen</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EINGABEMETHODE A: Kategorisierte Klick-Liste */}
      {inputMethod === 'list' && (
        <div className="space-y-3">
          {/* Kategorie-Filter & Suchleiste */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-white text-slate-950 shadow'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                Alle ({items.length})
              </button>
              {(settings.categories || CATEGORIES).map((cat) => {
                const count = items.filter((i) => i.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-sky-500 text-slate-950 shadow'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {cat.shortLabel || cat.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Artikel oder Stellplatz suchen (z. B. Bier, GER-E0-P01)..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-sky-500 focus:outline-none text-sm text-white placeholder:text-slate-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setGlobalScannerOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-bold whitespace-nowrap cursor-pointer shrink-0 transition"
                title="Stellplatz-QR-Code scannen oder Regal auswählen, um Artikel zu filtern oder nachträglich zuzuweisen"
              >
                <QrCode className="w-4 h-4 text-sky-400" />
                <span>Stellplatz-QR</span>
              </button>
            </div>
          </div>

          {/* Artikel-Karten */}
          {filteredItems.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
              <p className="font-semibold text-white text-sm sm:text-base">
                {items.length === 0
                  ? 'Noch keine Artikel im Vereinskeller angelegt.'
                  : 'Keine Artikel für diesen Filter gefunden.'}
              </p>
              <p className="text-xs text-slate-400">
                {items.length === 0
                  ? 'Wechsle oben auf „Admin / Inventur“, um deine eigenen Artikel anzulegen oder per CSV/Excel zu importieren.'
                  : 'Probiere eine andere Kategorie oder ändere deinen Suchbegriff.'}
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredItems.map((item) => {
              const selectedUnit = getSelectedUnit(item);
              const inCartAmount = cart[item.id]?.amount || 0;
              const stockDisplay = formatStockDisplay(item);
              const isLowStock = item.quantity < item.minStock;
              const isSubUnitActive =
                item.subUnit && selectedUnit.toLowerCase() === item.subUnit.toLowerCase();
              const openPrimary = openWithdrawnByItem[item.id] || 0;
              const maxReturnInUnit = getMaxReturnInUnit(item, openPrimary, selectedUnit);
              const maxAllowedInUnit = getMaxAllowedForModeInUnit(item, mode, selectedUnit);
              const isMaxReached =
                (mode === 'withdraw' || mode === 'return') && inCartAmount >= maxAllowedInUnit;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                    inCartAmount > 0
                      ? 'bg-slate-900 border-sky-500/70 shadow-lg shadow-sky-500/10'
                      : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  {/* Oberer Teil: Titel, Badges & Aktueller Bestand */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-bold text-white text-sm sm:text-base leading-snug">
                          {item.name}
                        </h3>
                        {item.isReturnable && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            Leihgerät
                          </span>
                        )}
                        {isLowStock && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <AlertCircle className="w-3 h-3" />
                            Knapp
                          </span>
                        )}
                        {item.expiryDate ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMhdEditingItem(item);
                              setMhdDateDraft(item.expiryDate || '');
                            }}
                            className="cursor-pointer group"
                            title="Ablaufdatum / MHD ansehen oder ändern (Klicken zum Bearbeiten)"
                          >
                            {(() => {
                              const status = getExpiryStatus(item.expiryDate);
                              const formatted = formatExpiryDate(item.expiryDate);
                              const days = getDaysUntilExpiry(item.expiryDate);
                              if (status === 'expired') {
                                return (
                                  <span
                                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 group-hover:bg-rose-500/30 transition"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                    <span>MHD abgelaufen ({formatted})</span>
                                  </span>
                                );
                              }
                              if (status === 'warning') {
                                return (
                                  <span
                                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 group-hover:bg-amber-500/30 transition"
                                  >
                                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>MHD {days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} T.`} ({formatted})</span>
                                  </span>
                                );
                              }
                              return (
                                <span
                                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 group-hover:border-sky-500/50 group-hover:text-white transition"
                                >
                                  <Calendar className="w-3 h-3 text-sky-400 shrink-0" />
                                  <span>MHD: {formatted}</span>
                                </span>
                              );
                            })()}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMhdEditingItem(item);
                              setMhdDateDraft('');
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-sky-300 border border-slate-700/60 transition cursor-pointer"
                            title="Ablaufdatum / MHD für diesen Artikel eintragen"
                          >
                            <Calendar className="w-3 h-3 text-sky-400 shrink-0" />
                            <span>+ MHD</span>
                          </button>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.location ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocationEditingItem(item);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-sky-300 bg-slate-950/80 hover:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-800 hover:border-sky-500/40 transition cursor-pointer text-left"
                            title="Stellplatz ändern oder per QR-Code scannen"
                          >
                            <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
                            <span>{item.location}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocationEditingItem(item);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-sky-300 border border-slate-700/60 transition cursor-pointer"
                            title="Stellplatz per QR-Scan oder Auswahl zuweisen"
                          >
                            <QrCode className="w-3 h-3 text-sky-400 shrink-0" />
                            <span>+ Stellplatz / QR</span>
                          </button>
                        )}

                        {(() => {
                          const subItems = subItemsByParentId[item.id] || [];
                          const isBoxExpanded =
                            Boolean(expandedBoxIds[item.id]) ||
                            (Boolean(searchQuery.trim()) &&
                              subItems.some((s) =>
                                s.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
                              ));

                          if (subItems.length > 0) {
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedBoxIds((prev) => ({
                                      ...prev,
                                      [item.id]: !isBoxExpanded,
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition cursor-pointer"
                                  title="Kisten-Inhalt / Unterartikel ein- oder ausblenden"
                                >
                                  <Box className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>{subItems.length} Unterartikel</span>
                                  {isBoxExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSubItemsManagingParent(item);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                  title="Unterartikel in dieser Kiste verwalten oder hinzufügen"
                                >
                                  <span>+ Inhalt</span>
                                </button>
                              </>
                            );
                          }

                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubItemsManagingParent(item);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-300 border border-slate-700/60 transition cursor-pointer"
                              title="Unterartikel für diese Kiste / diesen Artikel anlegen (z. B. 15 Artikel in einer Kiste auf einem Stellplatz)"
                            >
                              <Box className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>+ Unterartikel</span>
                            </button>
                          );
                        })()}
                      </div>

                      {mode === 'return' && (
                        <p className="text-xs mt-1">
                          {openPrimary > 0 ? (
                            <span className="text-sky-300 font-medium">
                              Ausgeliehen / Rückgebbar: max.{' '}
                              {formatEnteredAmount(maxReturnInUnit, selectedUnit)}
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              Aktuell nichts ausgeliehen (0 rückgebbar)
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Bestands-Anzeige rechts */}
                    <div className="text-right shrink-0 bg-slate-950/90 px-2.5 py-1.5 rounded-xl border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        Im Keller
                      </div>
                      <div
                        className={`font-bold text-xs sm:text-sm ${
                          item.quantity <= 0
                            ? 'text-rose-400'
                            : isLowStock
                            ? 'text-amber-300'
                            : 'text-emerald-300'
                        }`}
                      >
                        {stockDisplay.primaryText}
                      </div>
                      {stockDisplay.secondaryText && (
                        <div className="text-[10px] text-slate-400">
                          {stockDisplay.secondaryText}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Unterer Teil: Einheiten-Umschalter (z. B. Kiste vs Flasche) + Touch +/- Buttons */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
                    {/* Interaktive Füllstands-Ampel für Gewürze & Schüttgut */}
                    {item.unitProfile === 'spice_bulk' && (
                      <div className="w-full bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300 font-medium flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-400" />
                            <span>Offene Dose (Anbruch-Füllstand):</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              item.openPackLevel
                                ? SPICE_FILL_CONFIG[item.openPackLevel].badgeClass
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.openPackLevel
                              ? SPICE_FILL_CONFIG[item.openPackLevel].label
                              : 'Noch nicht erfasst'}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(['full', 'half', 'low', 'empty'] as SpiceFillLevel[]).map((lvl) => {
                            const cfg = SPICE_FILL_CONFIG[lvl];
                            const isActive = item.openPackLevel === lvl;
                            return (
                              <button
                                key={lvl}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateItemSpiceLevel?.(item.id, lvl);
                                }}
                                className={`py-1.5 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer border ${
                                  isActive
                                    ? `${cfg.badgeClass} ring-1 ring-white/30 shadow-md`
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                                <span>{cfg.short.split(' ')[0]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* Einheiten-Wahl falls Gebinde vorhanden */}
                      {item.unitProfile === 'spice_bulk' ? (
                        <span className="text-xs text-slate-400">
                          Vorrat: <strong className="text-slate-200">Ganze {pluralizeUnit(item.unit, 2)}</strong>
                        </span>
                      ) : item.subUnit && item.subUnitsPerUnit ? (
                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                          <button
                            type="button"
                            onClick={() => handleUnitSwitch(item, item.unit)}
                            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                              !isSubUnitActive
                                ? 'bg-sky-500 text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {item.unit} ({item.subUnitsPerUnit})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnitSwitch(item, item.subUnit!)}
                            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                              isSubUnitActive
                                ? 'bg-sky-500 text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Einzel-{item.subUnit}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Einheit: <strong className="text-slate-200">{item.unit}</strong>
                          {item.allowFractions ? ' (auch ½ möglich)' : ''}
                        </span>
                      )}

                    {/* Große +/- Bedienelemente */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => adjustCartAmount(item, -1)}
                        disabled={inCartAmount <= 0}
                        className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center text-white font-bold transition cursor-pointer"
                        title="-1"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <input
                        type="text"
                        inputMode="decimal"
                        value={inCartAmount > 0 ? formatGermanNumber(inCartAmount) : ''}
                        placeholder="0"
                        disabled={(mode === 'withdraw' || mode === 'return') && maxAllowedInUnit <= 0}
                        onChange={(e) => setExactCartAmount(item, e.target.value)}
                        className={`w-14 h-9 text-center rounded-xl border font-bold text-sm focus:outline-none disabled:opacity-40 ${
                          inCartAmount > 0
                            ? 'bg-sky-500/15 border-sky-500 text-sky-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      />

                      {/* +½ Button für angebrochene Rollen / Packungen / Kisten */}
                      {item.allowFractions && !isSubUnitActive && (
                        <button
                          type="button"
                          onClick={() => adjustCartAmount(item, 0.5)}
                          disabled={isMaxReached}
                          className="h-9 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-sky-300 font-semibold text-xs transition cursor-pointer"
                          title="Halbe Einheit hinzufügen (+0,5)"
                        >
                          +½
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => adjustCartAmount(item, 1)}
                        disabled={isMaxReached}
                        className="w-9 h-9 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-slate-950 flex items-center justify-center font-bold shadow-sm transition cursor-pointer"
                        title="+1"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </button>

                      {isSubUnitActive && (
                        <button
                          type="button"
                          onClick={() => adjustCartAmount(item, 5)}
                          disabled={isMaxReached}
                          className="h-9 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-sky-300 font-semibold text-xs transition cursor-pointer"
                          title="+5"
                        >
                          +5
                        </button>
                      )}
                    </div>
                  </div>
                  </div>

                  {/* Aufklappbarer Kisten-Inhalt (Unterartikel auf demselben Stellplatz) */}
                  {(() => {
                    const subItems = subItemsByParentId[item.id] || [];
                    if (subItems.length === 0) return null;
                    const isBoxExpanded =
                      Boolean(expandedBoxIds[item.id]) ||
                      (Boolean(searchQuery.trim()) &&
                        subItems.some((s) =>
                          s.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
                        ));
                    if (!isBoxExpanded) return null;

                    return (
                      <div className="mt-1 pt-2.5 border-t border-amber-500/30 bg-slate-950/80 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5 text-amber-400" />
                            <span>
                              Unterartikel in „{item.name}“ ({subItems.length})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setSubItemsManagingParent(item)}
                            className="text-[11px] font-semibold text-sky-400 hover:underline cursor-pointer"
                          >
                            + Unterartikel bearbeiten
                          </button>
                        </div>

                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                          {subItems.map((sub) => {
                            const subUnit = getSelectedUnit(sub);
                            const subInCart = cart[sub.id]?.amount || 0;
                            const subMax = getMaxAllowedForModeInUnit(sub, mode, subUnit);
                            const subMaxReached =
                              (mode === 'withdraw' || mode === 'return') && subInCart >= subMax;

                            return (
                              <div
                                key={sub.id}
                                className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                                  subInCart > 0
                                    ? 'bg-sky-500/10 border-sky-500/50'
                                    : 'bg-slate-900/90 border-slate-800'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate">
                                    ↳ {sub.name}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    Im Keller:{' '}
                                    <strong className="text-emerald-300">
                                      {formatStockDisplay(sub).primaryText}
                                    </strong>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => adjustCartAmount(sub, -1)}
                                    disabled={subInCart <= 0}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center text-white text-xs font-bold cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={subInCart > 0 ? formatGermanNumber(subInCart) : ''}
                                    placeholder="0"
                                    onChange={(e) => setExactCartAmount(sub, e.target.value)}
                                    className="w-10 h-7 text-center rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => adjustCartAmount(sub, 1)}
                                    disabled={subMaxReached}
                                    className="w-7 h-7 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-slate-950 flex items-center justify-center text-xs font-bold cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Sticky Buchungs-Abschlussleiste unten (sobald Artikel ausgewählt sind) */}
      {cartEntries.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-md border-t border-slate-700 shadow-2xl p-3 sm:p-4 no-print">
          <div className="max-w-5xl mx-auto space-y-3">
            {/* Ausgewählte Artikel Chips */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-xs font-semibold text-slate-400 shrink-0 mr-1">
                  Auswahl ({cartEntries.length}):
                </span>
                {cartEntries.map((entry) => {
                  const item = items.find((i) => i.id === entry.itemId);
                  if (!item) return null;
                  return (
                    <span
                      key={entry.itemId}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-white whitespace-nowrap"
                    >
                      <strong className="text-sky-300">
                        {formatEnteredAmount(entry.amount, entry.unit)}
                      </strong>{' '}
                      {item.name}
                    </span>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCart({})}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 shrink-0 cursor-pointer"
                title="Auswahl leeren"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leeren</span>
              </button>
            </div>

            {/* Angaben (Name Pflichtfeld bei Entnahme & Event/Zweck) + Buchungs-Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Schnell-Chips für Event / Zweck */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  {showMemberDropdown && filteredMemberSuggestions.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-48 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-50 divide-y divide-slate-800/80">
                      <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 bg-slate-950/80 sticky top-0">
                        Berechtigte Personen ({filteredMemberSuggestions.length}):
                      </div>
                      {filteredMemberSuggestions.map((member) => {
                        const isSelected =
                          member.toLowerCase() === personName.trim().toLowerCase();
                        return (
                          <button
                            key={member}
                            type="button"
                            onMouseDown={(e) => {
                              // Verhindert, dass onBlur vor dem Klick feuert
                              e.preventDefault();
                              setPersonName(member);
                              setNameError(false);
                              setNameErrorMessage('');
                              setShowMemberDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs sm:text-sm flex items-center justify-between transition cursor-pointer ${
                              isSelected
                                ? 'bg-sky-500/20 text-sky-300 font-semibold'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span>{member}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <User
                    className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
                      nameError ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  />
                  <input
                    ref={personInputRef}
                    type="text"
                    required={mode === 'withdraw'}
                    value={personName}
                    onFocus={() => setShowMemberDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setShowMemberDropdown(false), 150);
                    }}
                    onChange={(e) => {
                      setPersonName(e.target.value);
                      setShowMemberDropdown(true);
                      if (e.target.value.trim()) {
                        setNameError(false);
                        setNameErrorMessage('');
                      }
                    }}
                    placeholder="Dein Name"
                    className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none ${
                      nameError
                        ? 'border-rose-500 ring-2 ring-rose-500/30 focus:border-rose-400'
                        : 'border-slate-700 focus:border-sky-500'
                    }`}
                  />
                </div>

                <div className="relative flex items-center gap-1">
                  <div className="relative flex-1">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      autoComplete="off"
                      placeholder="Zweck / Event (z.B. Sommerfest)"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmCartBooking}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition cursor-pointer ${modeConfig.buttonClass}`}
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {modeConfig.actionText} ({cartEntries.length})
                </span>
              </button>
            </div>
            {nameError && (
              <p className="text-xs text-rose-400 font-medium">
                {nameErrorMessage ||
                  'Bitte gib deinen Namen ein – bei der Entnahme aus dem Keller ist die Namensangabe verpflichtend.'}
              </p>
            )}
          </div>
        </div>
      )}
      {/* MHD Bearbeitungs-Modal */}
      {mhdEditingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-400" />
                <span>Ablaufdatum / MHD</span>
              </h3>
              <button
                type="button"
                onClick={() => setMhdEditingItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div>
              <div className="text-xs text-slate-400">Artikel:</div>
              <div className="font-semibold text-white text-sm">{mhdEditingItem.name}</div>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Ablaufdatum (Mindesthaltbarkeitsdatum):
              </label>
              <input
                type="date"
                value={mhdDateDraft}
                onChange={(e) => setMhdDateDraft(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              {mhdEditingItem.expiryDate && (
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateItemExpiry) {
                      onUpdateItemExpiry(mhdEditingItem.id, undefined);
                    }
                    setMhdEditingItem(null);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/40 cursor-pointer"
                >
                  MHD entfernen
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onUpdateItemExpiry) {
                    onUpdateItemExpiry(mhdEditingItem.id, mhdDateDraft.trim() || undefined);
                  }
                  setMhdEditingItem(null);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stellplatz einem einzelnen Artikel per QR-Scan oder Auswahl zuweisen */}
      <QrScannerModal
        isOpen={Boolean(locationEditingItem)}
        onClose={() => setLocationEditingItem(null)}
        items={items}
        title={
          locationEditingItem
            ? `Stellplatz für „${locationEditingItem.name}“`
            : 'Stellplatz wählen'
        }
        subtitle="Scanne den QR-Code am Regal oder wähle Regal (GER, TMR, TSR, MR), Ebene (0–3) & Platz (1–20)."
        currentLocationText={locationEditingItem?.location}
        onSelectLocation={(spot) => {
          if (locationEditingItem && onUpdateItemLocation) {
            onUpdateItemLocation(locationEditingItem.id, spot.fullDisplayLabel);
            setSuccessBanner(
              `Stellplatz „${spot.fullDisplayLabel}“ wurde „${locationEditingItem.name}“ zugewiesen.`
            );
          }
          setLocationEditingItem(null);
        }}
        onClearLocation={() => {
          if (locationEditingItem && onUpdateItemLocation) {
            onUpdateItemLocation(locationEditingItem.id, undefined);
          }
          setLocationEditingItem(null);
        }}
      />

      {/* Globaler Stellplatz-Scanner (öffnet danach das Stellplatz-Fenster zum Filtern oder Zuweisen) */}
      <QrScannerModal
        isOpen={globalScannerOpen}
        onClose={() => setGlobalScannerOpen(false)}
        items={items}
        title="Stellplatz-QR scannen oder auswählen"
        subtitle="Scanne ein Regalschild im Keller, um die dortigen Artikel zu sehen oder nachträglich Artikel mit diesem Platz zu verbinden."
        onSelectLocation={(spot) => {
          setGlobalScannerOpen(false);
          setActiveLocationSpot(spot);
        }}
      />

      {/* Stellplatz-Detail- & Schnell-Zuweisungs-Fenster */}
      <LocationAssignmentModal
        spot={activeLocationSpot}
        items={items}
        onClose={() => setActiveLocationSpot(null)}
        onAssignItemToSpot={(itemId, spot) => {
          if (onUpdateItemLocation) {
            onUpdateItemLocation(itemId, spot ? spot.fullDisplayLabel : undefined);
          }
        }}
        onAssignMultipleItemsToSpot={(itemIds, spot) => {
          if (onBulkUpdateItemLocations) {
            onBulkUpdateItemLocations(itemIds, spot ? spot.fullDisplayLabel : undefined);
            if (spot) {
              setSuccessBanner(
                `${itemIds.length} Artikel wurden dem Stellplatz „${spot.fullDisplayLabel}“ zugewiesen.`
              );
            }
          } else if (onUpdateItemLocation) {
            for (const id of itemIds) {
              onUpdateItemLocation(id, spot ? spot.fullDisplayLabel : undefined);
            }
          }
        }}
        onFilterBySpot={(spot) => {
          setSelectedCategory('all');
          setSearchQuery(spot.code);
        }}
        onSwitchSpotRequest={() => {
          setActiveLocationSpot(null);
          setGlobalScannerOpen(true);
        }}
        onManageSubItems={(parentItem) => {
          setActiveLocationSpot(null);
          setSubItemsManagingParent(parentItem);
        }}
      />

      {/* Unterartikel / Kisten-Inhalt verwalten Modal */}
      <SubItemsModal
        parentItem={
          subItemsManagingParent
            ? items.find((i) => i.id === subItemsManagingParent.id) || subItemsManagingParent
            : null
        }
        items={items}
        onClose={() => setSubItemsManagingParent(null)}
        onAddSubItems={(parentItem, newSubs) => {
          if (onAddSubItems) {
            onAddSubItems(parentItem, newSubs);
            setExpandedBoxIds((prev) => ({ ...prev, [parentItem.id]: true }));
          }
        }}
        onAssignExistingItemToParent={(itemId, parentItem) => {
          if (onAssignItemToParent) {
            onAssignItemToParent(itemId, parentItem);
            if (parentItem) {
              setExpandedBoxIds((prev) => ({ ...prev, [parentItem.id]: true }));
            }
          }
        }}
        onDeleteSubItem={onDeleteItem}
        onChangeParentLocationRequest={(parentItem) => {
          setSubItemsManagingParent(null);
          setLocationEditingItem(parentItem);
        }}
      />
    </div>
  );
};

