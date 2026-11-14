import { InventoryItem, SpiceFillLevel, UnitProfile } from '../types';

export function roundStock(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

const PLURAL_MAP: Record<string, string> = {
  Kiste: 'Kisten',
  Kasten: 'Kästen',
  Flasche: 'Flaschen',
  Rolle: 'Rollen',
  Packung: 'Packungen',
  Garnitur: 'Garnituren',
  Sack: 'Säcke',
  Stück: 'Stück',
  Set: 'Sets',
  Liter: 'Liter',
  Dose: 'Dosen',
  Karton: 'Kartons',
  Beutel: 'Beutel',
  Glas: 'Gläser',
};

export interface SpiceFillConfig {
  label: string;
  short: string;
  badgeClass: string;
  dotClass: string;
  percentage: number;
}

export const SPICE_FILL_CONFIG: Record<SpiceFillLevel, SpiceFillConfig> = {
  full: {
    label: 'Voll / Neu (100%)',
    short: 'Voll (100%)',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotClass: 'bg-emerald-400',
    percentage: 100,
  },
  half: {
    label: 'Halbvoll (~50%)',
    short: 'Halbvoll (~50%)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    dotClass: 'bg-amber-400',
    percentage: 50,
  },
  low: {
    label: 'Fast leer / Nachkauf (<25%)',
    short: 'Fast leer (<25%)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    dotClass: 'bg-orange-400',
    percentage: 20,
  },
  empty: {
    label: 'Leer / Aufgebraucht (0%)',
    short: 'Leer (0%)',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    dotClass: 'bg-rose-400',
    percentage: 0,
  },
};

/**
 * Ermittelt, ob ein Artikel knapp ist / auf der Einkaufsliste landen sollte.
 * - Bei Gewürzen & Schüttgut (spice_bulk):
 *   Berücksichtigt sowohl die geschlossenen Vorratspackungen als auch den Füllstand der offenen Dose!
 * - Bei anderen Artikeln: Standard-Vergleich quantity < minStock
 */
export function isItemLowStock(item: InventoryItem): boolean {
  if (item.unitProfile === 'spice_bulk') {
    if (item.quantity < item.minStock) return true;
    if (item.quantity <= 0) {
      // Wenn Mindestbestand 0 gefordert ist und der Anbruch noch voll/halbvoll ist, kein Nachkauf
      if (item.minStock === 0 && (item.openPackLevel === 'full' || item.openPackLevel === 'half')) {
        return false;
      }
      return true;
    }
    if (item.quantity <= 1 && (item.openPackLevel === 'low' || item.openPackLevel === 'empty')) {
      return true;
    }
    return false;
  }
  return item.quantity <= item.minStock;
}

export function pluralizeUnit(unit?: string | null, count: number = 1): string {
  if (!unit || typeof unit !== 'string') return '';
  if (Math.abs(count - 1) < 0.0001) return unit;
  return PLURAL_MAP[unit] || (unit.endsWith('e') ? `${unit}n` : unit);
}

export function formatGermanNumber(num: number): string {
  const rounded = Math.round(num * 100) / 100;
  return rounded.toString().replace('.', ',');
}

/**
 * Formatiert einen Bestand in der Haupteinheit lesbar für den Nutzer.
 * Beispiel bei Kiste (20 Flaschen) und quantity = 4.5 -> "4 Kisten + 10 Flaschen"
 * Beispiel bei Rolle und quantity = 1.5 -> "1,5 Rollen"
 */
export function formatStockDisplay(item: InventoryItem, quantity: number = item?.quantity ?? 0): {
  primaryText: string;
  secondaryText?: string;
} {
  const safeQty = roundStock(quantity);
  const primaryUnit = item?.unit || 'Stück';

  // Profil für Gewürze, Schüttgut & Küchenbedarf mit Füllstands-Ampel
  if (item?.unitProfile === 'spice_bulk') {
    const fullPacks = Math.max(0, Math.floor(safeQty));
    const openStatus = item.openPackLevel ? SPICE_FILL_CONFIG[item.openPackLevel] : null;
    return {
      primaryText: `${fullPacks} ${pluralizeUnit(primaryUnit, fullPacks)} Vorrat`,
      secondaryText: openStatus
        ? `Anbruch: ${openStatus.short}`
        : 'Anbruch: Keine Angabe',
    };
  }

  if (item?.subUnit && item?.subUnitsPerUnit && item.subUnitsPerUnit > 1) {
    const totalSubUnits = Math.round(safeQty * item.subUnitsPerUnit);
    const fullPrimary = Math.trunc(totalSubUnits / item.subUnitsPerUnit);
    const remainingSub = totalSubUnits % item.subUnitsPerUnit;

    if (remainingSub === 0) {
      return {
        primaryText: `${fullPrimary} ${pluralizeUnit(primaryUnit, fullPrimary)}`,
        secondaryText: `= ${totalSubUnits} ${pluralizeUnit(item.subUnit, totalSubUnits)}`,
      };
    }

    if (fullPrimary === 0) {
      return {
        primaryText: `${remainingSub} ${pluralizeUnit(item.subUnit, remainingSub)}`,
        secondaryText: `(${formatGermanNumber(safeQty)} ${pluralizeUnit(primaryUnit, safeQty)})`,
      };
    }

    return {
      primaryText: `${fullPrimary} ${pluralizeUnit(primaryUnit, fullPrimary)} + ${remainingSub} ${pluralizeUnit(item.subUnit, remainingSub)}`,
      secondaryText: `Gesamt: ${totalSubUnits} ${pluralizeUnit(item.subUnit, totalSubUnits)}`,
    };
  }

  return {
    primaryText: `${formatGermanNumber(safeQty)} ${pluralizeUnit(primaryUnit, safeQty)}`,
  };
}

/**
 * Rechnet eine eingegebene Menge + Einheit in die Haupteinheit des Artikels um.
 */
export function toPrimaryUnitQuantity(
  item: InventoryItem,
  enteredAmount: number,
  enteredUnit: string
): number {
  if (
    item.subUnit &&
    item.subUnitsPerUnit &&
    item.subUnitsPerUnit > 0 &&
    enteredUnit.toLowerCase() === item.subUnit.toLowerCase()
  ) {
    return roundStock(enteredAmount / item.subUnitsPerUnit);
  }
  return roundStock(enteredAmount);
}

/**
 * Formatiert eine Buchungsposition (z. B. "5 Flaschen" oder "2 Kisten")
 */
export function formatEnteredAmount(amount: number, unit: string): string {
  return `${formatGermanNumber(amount)} ${pluralizeUnit(unit, amount)}`;
}

/**
 * Parst ein Datumsformat (YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY) ohne Zeitzonenversatz.
 */
export function parseDateOnly(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Match YYYY-MM-DD oder YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Match DD.MM.YYYY oder DD.MM.YY (auch mit Leerzeichen wie 31. 12. 2026)
  const deMatch = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})/);
  if (deMatch) {
    const day = parseInt(deMatch[1], 10);
    const month = parseInt(deMatch[2], 10) - 1;
    let year = parseInt(deMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Match DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
}

/**
 * Normalisiert ein Ablaufdatum in das Standard-ISO-Format YYYY-MM-DD
 */
export function normalizeExpiryDate(val?: string | null): string | undefined {
  const d = parseDateOnly(val);
  if (!d) return undefined;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type ExpiryStatus = 'expired' | 'warning' | 'ok' | null;

/**
 * Berechnet den Status eines Ablaufdatums:
 * - 'expired': Datum liegt in der Vergangenheit
 * - 'warning': Datum liegt innerhalb der nächsten `thresholdDays` Tage (Standard: 30)
 * - 'ok': Noch mehr als `thresholdDays` Tage haltbar
 * - null: Kein gültiges Ablaufdatum hinterlegt
 */
export function getExpiryStatus(
  expiryDate?: string | null,
  thresholdDays: number = 30,
  referenceDate: Date = new Date()
): ExpiryStatus {
  const target = parseDateOnly(expiryDate);
  if (!target) return null;

  const today = new Date(referenceDate.getTime());
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= thresholdDays) return 'warning';
  return 'ok';
}

/**
 * Gibt die Anzahl der verbleibenden Tage bis zum Ablaufdatum zurück (negativ = bereits abgelaufen).
 */
export function getDaysUntilExpiry(
  expiryDate?: string | null,
  referenceDate: Date = new Date()
): number | null {
  const target = parseDateOnly(expiryDate);
  if (!target) return null;
  const today = new Date(referenceDate.getTime());
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Formatiert das Ablaufdatum im deutschen Standard-Format DD.MM.YYYY
 */
export function formatExpiryDate(expiryDate?: string | null): string {
  const d = parseDateOnly(expiryDate);
  if (!d) return expiryDate || '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

