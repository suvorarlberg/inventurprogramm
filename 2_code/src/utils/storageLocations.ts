import { AppSettings } from '../types';
import { normalizePocketBaseUrl } from './pocketbaseSync';

export type ShelfId = 'GER' | 'TMR' | 'TSR' | 'MR';

export interface ShelfDefinition {
  id: ShelfId;
  name: string;
  shortName: string;
  levels: number[];
  maxSpotsPerLevel: number;
  /**
   * Wie viele Stellplätze pro Ebene standardmäßig beim Druckbogen ("~50 Etiketten Vorrat")
   * vorausgewählt sind (Ebenen 0, 1, 2, 3 -> Anzahl Plätze).
   */
  defaultPrintSpotsByLevel: Record<number, number>;
}

export interface StorageLocationSpot {
  /** Eindeutiger Stellplatz-Code, z. B. "GER-E0-P01" */
  code: string;
  /** Kürzel des Regals, z. B. "GER" */
  shelfId: ShelfId;
  /** Voller Name des Regals, z. B. "Getränke- und Essensregal" */
  shelfName: string;
  /** Kompakte Bezeichnung des Regals für kleine Etiketten */
  shelfShortName: string;
  /** Ebene (0, 1, 2, 3) */
  level: number;
  /** Platznummer auf der Ebene (1 bis 20) */
  spot: number;
  /** Kompakte Schriftform neben dem QR-Code, z. B. "Ebene 0 • Platz 01" */
  levelAndSpotText: string;
  /** Vollständiger lesbarer Name für Artikelkarten & Listen, z. B. "GER-E0-P01 • Getränke- und Essensregal (Ebene 0, Platz 01)" */
  fullDisplayLabel: string;
}

/**
 * ============================================================================
 * EIGENE ANPASSUNG (Hier kannst du bei Bedarf selbst Werte ändern!):
 * ============================================================================
 * - Alle 4 Regale (GER, TMR, TSR, MR) haben die Ebenen 0, 1, 2 und 3.
 * - Auf Vorrat sind pro Ebene 20 Stellplätze eingeplant (Plätze 1 bis 20 = 320 mögliche Plätze).
 * - Unter `defaultPrintSpotsByLevel` ist eingestellt, wie viele QR-Codes pro Ebene
 *   standardmäßig für deinen ~50er Druckbogen vorausgewählt sind (hier exakt 52 Stück).
 *   Du kannst diese Zahlen hier im Code oder direkt im Druck-Menü der App frei ändern!
 */
export const SHELF_DEFINITIONS: ShelfDefinition[] = [
  {
    id: 'GER',
    name: 'Getränke- und Essensregal',
    shortName: 'Getränke- & Essensregal',
    levels: [0, 1, 2, 3],
    maxSpotsPerLevel: 20,
    defaultPrintSpotsByLevel: {
      0: 4,
      1: 4,
      2: 4,
      3: 4,
    },
  },
  {
    id: 'TMR',
    name: 'Trainermaterialregal',
    shortName: 'Trainermaterialregal',
    levels: [0, 1, 2, 3],
    maxSpotsPerLevel: 20,
    defaultPrintSpotsByLevel: {
      0: 3,
      1: 3,
      2: 3,
      3: 3,
    },
  },
  {
    id: 'TSR',
    name: 'Technik-und-Sonstiges-Regal',
    shortName: 'Technik & Sonstiges',
    levels: [0, 1, 2, 3],
    maxSpotsPerLevel: 20,
    defaultPrintSpotsByLevel: {
      0: 3,
      1: 3,
      2: 3,
      3: 3,
    },
  },
  {
    id: 'MR',
    name: 'Mittleres Regal',
    shortName: 'Mittleres Regal',
    levels: [0, 1, 2, 3],
    maxSpotsPerLevel: 20,
    defaultPrintSpotsByLevel: {
      0: 3,
      1: 3,
      2: 3,
      3: 3,
    },
  },
];

export const ALL_LEVELS = [0, 1, 2, 3] as const;
export const MAX_SPOTS_PER_LEVEL = 20;

export function formatSpotNumber(spot: number): string {
  return String(spot).padStart(2, '0');
}

export function buildLocationCode(shelfId: ShelfId, level: number, spot: number): string {
  return `${shelfId}-E${level}-P${formatSpotNumber(spot)}`;
}

export function getShelfDefinition(shelfId: string): ShelfDefinition | undefined {
  const upper = shelfId.trim().toUpperCase();
  return SHELF_DEFINITIONS.find((s) => s.id === upper);
}

export function createStorageLocationSpot(
  shelf: ShelfDefinition,
  level: number,
  spot: number
): StorageLocationSpot {
  const spotPadded = formatSpotNumber(spot);
  const code = buildLocationCode(shelf.id, level, spot);
  return {
    code,
    shelfId: shelf.id,
    shelfName: shelf.name,
    shelfShortName: shelf.shortName,
    level,
    spot,
    levelAndSpotText: `Ebene ${level} • Platz ${spotPadded}`,
    fullDisplayLabel: `${code} • ${shelf.name} (Ebene ${level}, Platz ${spotPadded})`,
  };
}

/**
 * Erzeugt alle 320 auf Vorrat eingeplanten Stellplätze (4 Regale × 4 Ebenen × 20 Plätze).
 */
export function getAllPreplannedLocations(): StorageLocationSpot[] {
  const list: StorageLocationSpot[] = [];
  for (const shelf of SHELF_DEFINITIONS) {
    for (const level of shelf.levels) {
      for (let spot = 1; spot <= shelf.maxSpotsPerLevel; spot++) {
        list.push(createStorageLocationSpot(shelf, level, spot));
      }
    }
  }
  return list;
}

export const ALL_PREPLANNED_LOCATIONS: StorageLocationSpot[] = getAllPreplannedLocations();

const LOCATION_BY_CODE_MAP = new Map<string, StorageLocationSpot>(
  ALL_PREPLANNED_LOCATIONS.map((loc) => [loc.code.toUpperCase(), loc])
);

/**
 * Erzeugt die Standard-Vorauswahl für den Druckbogen (ca. 50 QR-Codes verteilt auf GER, TMR, TSR, MR).
 */
export function buildDefaultPrintCountsMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const shelf of SHELF_DEFINITIONS) {
    for (const level of shelf.levels) {
      map[`${shelf.id}-E${level}`] = shelf.defaultPrintSpotsByLevel[level] ?? 3;
    }
  }
  return map;
}

/**
 * Erkennt einen Stellplatz aus einem gescannten QR-Code-Text, einer URL (?loc=GER-E0-P01)
 * oder einem bestehenden Lagerort-Text (z. B. "GER-E0-P01 • Getränke- und Essensregal...").
 */
export function parseStorageLocationInput(rawInput: string | undefined | null): StorageLocationSpot | null {
  if (!rawInput) return null;
  let candidate = rawInput.trim();
  if (!candidate) return null;

  // 1. Falls eine URL gescannt wurde, Parameter `loc` oder `location` extrahieren
  if (candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.includes('?loc=')) {
    try {
      const urlStr = candidate.startsWith('http')
        ? candidate
        : `https://dummy.local/${candidate.startsWith('?') ? candidate : `?${candidate}`}`;
      const parsedUrl = new URL(urlStr);
      const locParam =
        parsedUrl.searchParams.get('loc') ||
        parsedUrl.searchParams.get('location') ||
        parsedUrl.searchParams.get('stellplatz');
      if (locParam) {
        candidate = locParam.trim();
      }
    } catch {
      // Fallback auf Regex-Erkennung
    }
  }

  // Optionales Präfix "VK:" entfernen
  candidate = candidate.replace(/^VK:/i, '').trim();

  // 2. Direkter Treffer über "GER-E0-P01"
  const direct = LOCATION_BY_CODE_MAP.get(candidate.toUpperCase());
  if (direct) return direct;

  // 3. Flexibles Regex-Matching für Formate wie:
  //    "GER-E0-P01", "GER-E0-P1", "GER-0-01", "GER-0-1", "GER E0 P1"
  const regex = /\b(GER|TMR|TSR|MR)[\s\-_/:]*(?:E|EBENE\s*)?([0-3])[\s\-_/:]*(?:P|PLATZ\s*)?([0-9]{1,2})\b/i;
  const match = candidate.match(regex);
  if (match) {
    const shelfId = match[1].toUpperCase() as ShelfId;
    const level = Number(match[2]);
    const spot = Number(match[3]);
    if (spot >= 1 && spot <= MAX_SPOTS_PER_LEVEL) {
      const code = buildLocationCode(shelfId, level, spot);
      return LOCATION_BY_CODE_MAP.get(code) || null;
    }
  }

  return null;
}

/**
 * Prüft, ob ein Artikel zu einem bestimmten Stellplatz-Code gehört.
 */
export function itemMatchesLocationSpot(
  itemLocation: string | undefined,
  spot: StorageLocationSpot
): boolean {
  if (!itemLocation) return false;
  const parsed = parseStorageLocationInput(itemLocation);
  if (parsed && parsed.code === spot.code) {
    return true;
  }
  return itemLocation.toUpperCase().includes(spot.code.toUpperCase());
}

/**
 * Erzeugt den Inhalt für den Stellplatz-QR-Code:
 * - Standardmäßig als kompakte URL (`https://.../?loc=GER-E0-P01`), damit sowohl die normale
 *   Smartphone-Kamera als auch der In-App-Scanner den Stellplatz sofort öffnen können.
 * - Optional als Ultrakurz-Code (`GER-E0-P01`) für besonders kleine Etiketten.
 */
export function buildLocationQrPayload(
  settings: AppSettings,
  spotCode: string,
  mode: 'url' | 'short_code' = 'url'
): string {
  if (mode === 'short_code') {
    return spotCode;
  }

  const isNativeOrLocal =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost');

  const baseUrl = isNativeOrLocal
    ? 'https://erdbeerwaffel311.github.io/inventurprogramm/'
    : typeof window !== 'undefined'
    ? window.location.origin + window.location.pathname
    : 'https://erdbeerwaffel311.github.io/inventurprogramm/';

  const params = new URLSearchParams();
  params.set('loc', spotCode);

  const cleanDb = normalizePocketBaseUrl(settings.pocketbaseUrl);
  if (cleanDb && cleanDb !== 'https://api.keller.schuelerunion-vorarlberg.at') {
    params.set('dbUrl', cleanDb);
  }

  return `${baseUrl}?${params.toString()}`;
}
