import { describe, it, expect } from 'vitest';
import {
  ADMIN_FULL_PERMISSIONS,
  DEFAULT_ITEMS,
  DEFAULT_MEMBER_ACCOUNTS,
  DEFAULT_MEMBER_PERMISSIONS,
  DEFAULT_SETTINGS,
  buildAdminAccount,
  buildMemberUsername,
  normalizeUsernameForComparison,
  reconcileMemberAccounts,
  resolveMemberPermissions,
} from '../data/defaultData';
import { InventoryItem } from '../types';
import {
  formatExpiryDate,
  formatStockDisplay,
  getDaysUntilExpiry,
  getExpiryStatus,
  isItemLowStock,
  normalizeExpiryDate,
  parseDateOnly,
  SPICE_FILL_CONFIG,
  toPrimaryUnitQuantity,
} from '../utils/units';
import { parseFreeTextBlock } from '../utils/textParser';
import { exportInventoryToCsv, parseInventoryCsv } from '../utils/csvHelper';
import {
  CONFIG_ROW_ID,
  normalizePocketBaseUrl,
  toPocketBaseId,
} from '../utils/pocketbaseSync';
import {
  ALL_PREPLANNED_LOCATIONS,
  buildDefaultPrintCountsMap,
  buildLocationCode,
  buildLocationQrPayload,
  itemMatchesLocationSpot,
  parseStorageLocationInput,
  SHELF_DEFINITIONS,
} from '../utils/storageLocations';
import { parseBulkSubItemLine } from '../components/SubItemsModal';

const now = new Date().toISOString();

const TEST_ITEMS: InventoryItem[] = [
  {
    id: 'test-bier-pils',
    name: 'Pilsener Bier (0,5l)',
    category: 'drinks_food',
    unit: 'Kiste',
    subUnit: 'Flasche',
    subUnitsPerUnit: 20,
    allowFractions: true,
    isReturnable: false,
    quantity: 6,
    minStock: 3,
    targetStock: 8,
    location: 'Getränkekeller Regal A',
    aliases: ['bier', 'pils', 'pilsener', 'kasten bier', 'kiste bier'],
    updatedAt: now,
  },
  {
    id: 'test-cola-mix',
    name: 'Cola / Spezi (0,5l)',
    category: 'drinks_food',
    unit: 'Kiste',
    subUnit: 'Flasche',
    subUnitsPerUnit: 20,
    allowFractions: true,
    isReturnable: false,
    quantity: 4.5,
    minStock: 2,
    targetStock: 6,
    location: 'Getränkekeller Regal A',
    aliases: ['cola', 'spezi', 'limo'],
    updatedAt: now,
  },
  {
    id: 'test-wasser-sprudel',
    name: 'Mineralwasser Sprudel (0,7l)',
    category: 'drinks_food',
    unit: 'Kiste',
    subUnit: 'Flasche',
    subUnitsPerUnit: 12,
    allowFractions: true,
    isReturnable: false,
    quantity: 5,
    minStock: 3,
    targetStock: 6,
    location: 'Getränkekeller Regal B',
    aliases: ['wasser', 'sprudel', 'mineralwasser'],
    updatedAt: now,
  },
  {
    id: 'test-gaffa-tape',
    name: 'Gaffa-Tape (Gewebeband)',
    category: 'consumables',
    unit: 'Rolle',
    allowFractions: true,
    isReturnable: false,
    quantity: 3.5,
    minStock: 2,
    targetStock: 5,
    location: 'Werkzeugschrank Fach 2',
    aliases: ['gaffa', 'panzertape', 'gewebeband', 'klebeband'],
    updatedAt: now,
  },
  {
    id: 'test-servietten',
    name: 'Servietten (250er Pack)',
    category: 'consumables',
    unit: 'Packung',
    allowFractions: true,
    isReturnable: false,
    quantity: 1,
    minStock: 2,
    targetStock: 5,
    location: 'Vorratsschrank 2',
    aliases: ['servietten', 'papierservietten'],
    updatedAt: now,
  },
  {
    id: 'test-bierzeltgarnitur',
    name: 'Bierzeltgarnitur (Tisch + 2 Bänke)',
    category: 'equipment',
    unit: 'Garnitur',
    allowFractions: false,
    isReturnable: true,
    quantity: 8,
    minStock: 8,
    targetStock: 10,
    location: 'Lagerraum Hinten',
    aliases: ['bierzeltgarnitur', 'bierzeltgarnituren', 'biertisch', 'bierbank'],
    updatedAt: now,
  },
];

describe('Standardbestand ist leer (kein Beispielinventar)', () => {
  it('startet standardmäßig ohne Beispielinventar', () => {
    expect(DEFAULT_ITEMS.length).toBe(0);
  });
});

describe('Einheiten & Gebinde-Umrechnung (Kisten / Einzelflaschen / Teilmengen)', () => {
  it('zeigt angebrochene Kisten korrekt als Kisten + Einzelflaschen an', () => {
    const cola = TEST_ITEMS.find((i) => i.id === 'test-cola-mix')!;
    const display = formatStockDisplay(cola, 4.5);
    expect(display.primaryText).toBe('4 Kisten + 10 Flaschen');
    expect(display.secondaryText).toContain('90 Flaschen');
  });

  it('rechnet Einzelflaschen korrekt in Bruchteile einer Kiste um', () => {
    const bier = TEST_ITEMS.find((i) => i.id === 'test-bier-pils')!;
    const inKisten = toPrimaryUnitQuantity(bier, 5, 'Flasche');
    expect(inKisten).toBe(0.25);
  });

  it('zeigt angebrochene Rollen mit deutschem Komma an', () => {
    const gaffa = TEST_ITEMS.find((i) => i.id === 'test-gaffa-tape')!;
    const display = formatStockDisplay(gaffa, 1.5);
    expect(display.primaryText).toBe('1,5 Rollen');
  });
});

describe('Intelligenter Offline-Freitext-Parser (Textblock einfügen)', () => {
  it('erkennt Event-Header, Kisten, Einzelflaschen, Dezimalzahlen und halbe Einheiten aus einem Textblock', () => {
    const text =
      'Fürs Sommerfest:\n3 Kisten Bier, 6 Flaschen Wasser, 1,5 Rollen Gaffa-Tape, halbe Packung Servietten, 2x Bierzeltgarnitur';

    const result = parseFreeTextBlock(text, TEST_ITEMS);
    expect(result.suggestedEvent).toBe('Sommerfest');
    expect(result.items.length).toBe(5);

    expect(result.items[0].matchedItem?.id).toBe('test-bier-pils');
    expect(result.items[0].amount).toBe(3);
    expect(result.items[0].unit).toBe('Kiste');
    expect(result.items[0].normalizedQuantity).toBe(3);

    expect(result.items[1].matchedItem?.id).toBe('test-wasser-sprudel');
    expect(result.items[1].amount).toBe(6);
    expect(result.items[1].unit).toBe('Flasche');
    expect(result.items[1].normalizedQuantity).toBe(0.5);

    expect(result.items[2].matchedItem?.id).toBe('test-gaffa-tape');
    expect(result.items[2].amount).toBe(1.5);
    expect(result.items[2].unit).toBe('Rolle');

    expect(result.items[3].matchedItem?.id).toBe('test-servietten');
    expect(result.items[3].amount).toBe(0.5);

    expect(result.items[4].matchedItem?.id).toBe('test-bierzeltgarnitur');
    expect(result.items[4].amount).toBe(2);
  });

  it('versteht zusammengesetzte Mengenangaben wie "1 Kiste und 5 Flaschen Bier"', () => {
    const text = '1 Kiste und 5 Flaschen Bier';
    const result = parseFreeTextBlock(text, TEST_ITEMS);
    expect(result.items.length).toBe(2);
    expect(result.items[0].matchedItem?.id).toBe('test-bier-pils');
    expect(result.items[0].unit).toBe('Kiste');
    expect(result.items[0].amount).toBe(1);
    expect(result.items[1].matchedItem?.id).toBe('test-bier-pils');
    expect(result.items[1].unit).toBe('Flasche');
    expect(result.items[1].amount).toBe(5);
  });
});

describe('CSV / Excel Export & Import für die Erstinventur', () => {
  it('exportiert den Bestand als CSV und importiert Änderungen sowie neue Artikel fehlerfrei', () => {
    const csv = exportInventoryToCsv(TEST_ITEMS);
    expect(csv).toContain('Pilsener Bier (0,5l)');
    expect(csv).toContain('Gaffa-Tape (Gewebeband)');

    const customCsv = [
      'Name;Kategorie;Bestand (Haupteinheit);Haupteinheit;Untereinheit;Faktor Untereinheit;Mindestbestand;Sollbestand;Lagerort;Leihgerät (Rückgabepflicht);Teilmengen erlaubt;Suchbegriffe / Synonyme',
      'Pilsener Bier (0,5l);Getränke & Lebensmittel;10;Kiste;Flasche;20;3;10;Getränkekeller Regal A;Nein;Ja;bier, pils',
      'Pavillon Faltzelt 3x3m;Werkzeug, Technik & Inventar;2;Stück;;;2;2;Lagerraum Hinten;Ja;Nein;pavillon, zelt, faltzelt',
    ].join('\r\n');

    const imported = parseInventoryCsv(customCsv, TEST_ITEMS);
    expect(imported.updatedCount).toBe(1);
    expect(imported.addedCount).toBe(1);

    const updatedBier = imported.items.find((i) => i.id === 'test-bier-pils')!;
    expect(updatedBier.quantity).toBe(10);

    const addedPavillon = imported.items.find((i) => i.name.includes('Pavillon'))!;
    expect(addedPavillon).toBeDefined();
    expect(addedPavillon.isReturnable).toBe(true);
    expect(addedPavillon.quantity).toBe(2);
  });

  it('legt neue eigene Kategorien beim CSV-Import automatisch an', () => {
    const customCatCsv = [
      'Name;Kategorie;Bestand (Haupteinheit);Haupteinheit;Untereinheit;Faktor Untereinheit;Mindestbestand;Sollbestand;Lagerort;Leihgerät (Rückgabepflicht);Teilmengen erlaubt;Suchbegriffe / Synonyme',
      'Lichterkette 20m;Deko & Partybedarf;4;Stück;;;2;4;Dekokiste 1;Ja;Nein;lichterkette, deko, beleuchtung',
    ].join('\r\n');

    const imported = parseInventoryCsv(customCatCsv, TEST_ITEMS);
    expect(imported.categories.some((c) => c.label === 'Deko & Partybedarf')).toBe(true);
    const lichterkette = imported.items.find((i) => i.name.includes('Lichterkette'))!;
    expect(lichterkette.category).toBe('cat-deko-partybedarf');
  });
});

describe('Mitglieder-Login & Benutzernamen-Format (@schuelerunion.at)', () => {
  it('erzeugt vorname.nachname@schuelerunion.at bzw. vorname1-vorname2.nachname@schuelerunion.at bei Doppelnamen', () => {
    expect(buildMemberUsername('Elias Mantler')).toBe('elias.mantler@schuelerunion.at');
    expect(buildMemberUsername('Celil-Kaan Beler')).toBe('celil-kaan.beler@schuelerunion.at');
    expect(buildMemberUsername('Sophia-Maria Thoma')).toBe('sophia-maria.thoma@schuelerunion.at');
    expect(buildMemberUsername('Simon Märker')).toBe('simon.maerker@schuelerunion.at');
    expect(buildMemberUsername('Max Müller-Lüdenscheidt')).toBe(
      'max.mueller-luedenscheidt@schuelerunion.at'
    );
  });

  it('normalisiert Umlaute beim Login-Vergleich flexibel', () => {
    expect(normalizeUsernameForComparison('simon.märker@schuelerunion.at')).toBe(
      'simon.maerker@schuelerunion.at'
    );
  });

  it('enthält alle 28 berechtigten Mitglieder mit individuellem Zufallspasswort', () => {
    expect(DEFAULT_MEMBER_ACCOUNTS.length).toBe(28);
    for (const acc of DEFAULT_MEMBER_ACCOUNTS) {
      expect(acc.username.endsWith('@schuelerunion.at')).toBe(true);
      expect(acc.password.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('PocketBase-Konfiguration & 15-Zeichen Record-ID Konvertierung', () => {
  it('verwendet standardmäßig https://api.keller.schuelerunion-vorarlberg.at als PocketBase-URL', () => {
    expect(DEFAULT_SETTINGS.pocketbaseUrl).toBe(
      'https://api.keller.schuelerunion-vorarlberg.at'
    );
    expect(
      normalizePocketBaseUrl('https://api.keller.schuelerunion-vorarlberg.at/_/')
    ).toBe('https://api.keller.schuelerunion-vorarlberg.at');
  });

  it('konvertiert App-IDs deterministisch in gültige 15-stellige PocketBase-IDs', () => {
    const configPbId = toPocketBaseId(CONFIG_ROW_ID);
    expect(configPbId).toBe('kellerconfig000');
    expect(configPbId).toMatch(/^[a-z0-9]{15}$/);

    const itemPbId = toPocketBaseId('item-1730214000123');
    expect(itemPbId).toMatch(/^[a-z0-9]{15}$/);
    expect(toPocketBaseId('item-1730214000123')).toBe(itemPbId);

    const txPbId = toPocketBaseId('tx-inv-1730214000123');
    expect(txPbId).toMatch(/^[a-z0-9]{15}$/);
    expect(txPbId).not.toBe(itemPbId);
  });
});

describe('Optionales Ablaufdatum (MHD) & Datumsfunktionen', () => {
  it('parst Datumsangaben im ISO-, deutschen und Schrägstrich-Format zuverlässig', () => {
    expect(normalizeExpiryDate('2026-12-31')).toBe('2026-12-31');
    expect(normalizeExpiryDate('31.12.2026')).toBe('2026-12-31');
    expect(normalizeExpiryDate('31. 12. 2026')).toBe('2026-12-31');
    expect(normalizeExpiryDate('31/12/2026')).toBe('2026-12-31');
    expect(normalizeExpiryDate('')).toBeUndefined();
    expect(normalizeExpiryDate(undefined)).toBeUndefined();
    expect(normalizeExpiryDate('ungueltig')).toBeUndefined();
  });

  it('formatiert Ablaufdaten ins lesbare deutsche Format DD.MM.YYYY', () => {
    expect(formatExpiryDate('2026-12-31')).toBe('31.12.2026');
    expect(formatExpiryDate('2027-01-05')).toBe('05.01.2027');
    expect(formatExpiryDate('')).toBe('');
  });

  it('ermittelt den Ablauf-Status korrekt (abgelaufen, bald fällig, haltbar)', () => {
    // Referenzdatum: 2026-11-14
    const refDate = new Date(2026, 10, 14);

    // Abgelaufen (gestern)
    expect(getExpiryStatus('2026-11-13', 30, refDate)).toBe('expired');
    expect(getDaysUntilExpiry('2026-11-13', refDate)).toBe(-1);

    // Heute fällig (0 Tage) -> Warnung
    expect(getExpiryStatus('2026-11-14', 30, refDate)).toBe('warning');
    expect(getDaysUntilExpiry('2026-11-14', refDate)).toBe(0);

    // In 10 Tagen fällig -> Warnung
    expect(getExpiryStatus('2026-11-24', 30, refDate)).toBe('warning');
    expect(getDaysUntilExpiry('2026-11-24', refDate)).toBe(10);

    // In 45 Tagen fällig -> ok
    expect(getExpiryStatus('2026-12-29', 30, refDate)).toBe('ok');
    expect(getDaysUntilExpiry('2026-12-29', refDate)).toBe(45);

    // Kein Datum
    expect(getExpiryStatus(undefined, 30, refDate)).toBeNull();
  });

  it('exportiert und importiert das Ablaufdatum per CSV', () => {
    const itemWithExpiry: InventoryItem = {
      ...TEST_ITEMS[0],
      expiryDate: '2026-12-31',
    };

    const csv = exportInventoryToCsv([itemWithExpiry]);
    expect(csv).toContain('Ablaufdatum');
    expect(csv).toContain('2026-12-31');

    // Import mit deutschem Datumsformat
    const importCsv = [
      'Name;Kategorie;Bestand (Haupteinheit);Haupteinheit;Untereinheit;Faktor Untereinheit;Mindestbestand;Sollbestand;Lagerort;Ablaufdatum;Leihgerät (Rückgabepflicht);Teilmengen erlaubt;Suchbegriffe / Synonyme',
      'Pilsener Bier (0,5l);Getränke & Lebensmittel;6;Kiste;Flasche;20;3;8;Getränkekeller Regal A;31.12.2026;Nein;Ja;bier, pils',
    ].join('\r\n');

    const result = parseInventoryCsv(importCsv, [itemWithExpiry]);
    expect(result.items[0].expiryDate).toBe('2026-12-31');
  });
});

describe('Stellplatz- & QR-Code-System (GER, TMR, TSR, MR mit Ebenen 0–3 & 20 Plätzen)', () => {
  it('plant alle 4 Regale mit je 4 Ebenen (0, 1, 2, 3) und 20 Plätzen auf Vorrat ein (320 Plätze)', () => {
    expect(SHELF_DEFINITIONS.map((s) => s.id)).toEqual(['GER', 'TMR', 'TSR', 'MR']);
    expect(ALL_PREPLANNED_LOCATIONS.length).toBe(4 * 4 * 20);
    expect(buildLocationCode('GER', 0, 1)).toBe('GER-001');
    expect(buildLocationCode('MR', 3, 20)).toBe('MR-320');
  });

  it('liefert eine Standard-Druckvorauswahl von ca. 50 Etiketten (52 Stück)', () => {
    const counts = buildDefaultPrintCountsMap();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(52);
  });

  it('erkennt Stellplätze aus QR-URLs, Kurzcodes und Volltext-Lagerorten zuverlässig', () => {
    const fromCode = parseStorageLocationInput('GER-001');
    expect(fromCode?.code).toBe('GER-001');
    expect(fromCode?.shelfName).toBe('Getränke- und Essensregal');
    expect(fromCode?.level).toBe(0);
    expect(fromCode?.spot).toBe(1);

    const qrUrl = buildLocationQrPayload(DEFAULT_SETTINGS, 'TMR-215', 'url');
    const fromUrl = parseStorageLocationInput(qrUrl);
    expect(fromUrl?.code).toBe('TMR-215');
    expect(fromUrl?.shelfName).toBe('Trainermaterialregal');

    const fromFlexible = parseStorageLocationInput('tsr-3-7');
    expect(fromFlexible?.code).toBe('TSR-307');

    const fromFullDisplay = parseStorageLocationInput(fromCode!.fullDisplayLabel);
    expect(fromFullDisplay?.code).toBe('GER-001');
    expect(itemMatchesLocationSpot(fromCode!.fullDisplayLabel, fromCode!)).toBe(true);
  });

  it('legt Unterartikel in einer Kiste an und vererbt automatisch den Stellplatz der Kiste', () => {
    const parentBox: InventoryItem = {
      id: 'box-moderation',
      name: 'Moderationskiste',
      category: 'equipment',
      unit: 'Kiste',
      allowFractions: false,
      isReturnable: true,
      quantity: 1,
      minStock: 1,
      location: 'TMR-E1-P04 • Trainermaterialregal (Ebene 1, Platz 04)',
      aliases: ['moderationskiste'],
      updatedAt: now,
    };

    const sub1 = parseBulkSubItemLine('10 Stück Edding schwarz', parentBox, 0);
    const sub2 = parseBulkSubItemLine('3 Packung Moderationskarten', parentBox, 1);

    expect(sub1).not.toBeNull();
    expect(sub1?.name).toBe('Edding schwarz');
    expect(sub1?.quantity).toBe(10);
    expect(sub1?.unit).toBe('Stück');
    expect(sub1?.parentItemId).toBe('box-moderation');
    expect(sub1?.location).toBe(parentBox.location);

    expect(sub2?.name).toBe('Moderationskarten');
    expect(sub2?.quantity).toBe(3);
    expect(sub2?.unit).toBe('Packung');
    expect(sub2?.parentItemId).toBe('box-moderation');
    expect(sub2?.location).toBe(parentBox.location);
  });
});

describe('Admin-Account & Berechtigungs-System (Einzel- und Sammelrechte)', () => {
  it('stellt einen dedizierten Admin-Account (admin@schuelerunion.at) mit Vollrechten bereit', () => {
    const adminAcc = buildAdminAccount(DEFAULT_SETTINGS);
    expect(adminAcc.username).toBe('admin@schuelerunion.at');
    expect(adminAcc.isAdmin).toBe(true);
    expect(resolveMemberPermissions(adminAcc)).toEqual(ADMIN_FULL_PERMISSIONS);
    expect(resolveMemberPermissions(adminAcc).canDoInitialInventory).toBe(true);
  });

  it('bewahrt individuelle und gemeinsame Berechtigungen bei reconcileMemberAccounts', () => {
    const customAccounts = reconcileMemberAccounts(
      ['Elias Mantler', 'Max Mustermann'],
      [
        {
          name: 'Elias Mantler',
          username: 'elias.mantler@schuelerunion.at',
          password: 'TestPass12',
          isAdmin: false,
          permissions: {
            ...DEFAULT_MEMBER_PERMISSIONS,
            canBook: false,
            canRestock: false,
            canDoInitialInventory: true,
          },
        },
      ]
    );

    const elias = customAccounts.find((a) => a.name === 'Elias Mantler')!;
    expect(elias.permissions?.canBook).toBe(false);
    expect(elias.permissions?.canRestock).toBe(false);
    expect(elias.permissions?.canDoInitialInventory).toBe(true);

    const max = customAccounts.find((a) => a.name === 'Max Mustermann')!;
    expect(max.permissions).toEqual(DEFAULT_MEMBER_PERMISSIONS);
  });

  it('erlaubt Dashboard-Zugriff für in adminDashboardUsernames hinterlegte Benutzer', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      adminDashboardUsernames: ['elias.mantler@schuelerunion.at', 'admin@schuelerunion.at'],
    };

    const hasAccess = (username: string) => {
      const normalized = normalizeUsernameForComparison(username);
      return (settings.adminDashboardUsernames || []).some(
        (u) => normalizeUsernameForComparison(u) === normalized
      );
    };

    expect(hasAccess('elias.mantler@schuelerunion.at')).toBe(true);
    expect(hasAccess('ELIAS.MANTLER@SCHUELERUNION.AT')).toBe(true);
    expect(hasAccess('max.mustermann@schuelerunion.at')).toBe(false);
  });
});

describe('Einheitsprofile (Lösung 3: Getränke vs. Gewürze / Verbrauchsmaterial)', () => {
  it('formatiert die Bestandsanzeige für spice_bulk mit ungeöffneter Reserve und Anbruch-Füllstand', () => {
    const spiceItem: InventoryItem = {
      id: 'gewuerz-paprika',
      name: 'Paprikapulver edelsüß',
      category: 'spices_kitchen',
      unitProfile: 'spice_bulk',
      unit: 'Dose',
      quantity: 2,
      openPackLevel: 'half',
      minStock: 1,
      targetStock: 3,
      allowFractions: false,
      isReturnable: false,
      aliases: ['paprika'],
      updatedAt: now,
    };

    const display = formatStockDisplay(spiceItem);
    expect(display.primaryText).toBe('2 Dosen Vorrat');
    expect(display.secondaryText).toBe('Anbruch: Halbvoll (~50%)');

    const emptyOpenSpice: InventoryItem = {
      ...spiceItem,
      quantity: 1,
      openPackLevel: 'empty',
    };
    expect(formatStockDisplay(emptyOpenSpice).primaryText).toBe('1 Dose Vorrat');
    expect(formatStockDisplay(emptyOpenSpice).secondaryText).toBe('Anbruch: Leer (0%)');

    const zeroReserveSpice: InventoryItem = {
      ...spiceItem,
      quantity: 0,
      openPackLevel: 'low',
    };
    expect(formatStockDisplay(zeroReserveSpice).primaryText).toBe('0 Dosen Vorrat');
    expect(formatStockDisplay(zeroReserveSpice).secondaryText).toBe('Anbruch: Fast leer (<25%)');

    const noLevelSpice: InventoryItem = {
      ...spiceItem,
      quantity: 3,
      openPackLevel: undefined,
    };
    expect(formatStockDisplay(noLevelSpice).primaryText).toBe('3 Dosen Vorrat');
    expect(formatStockDisplay(noLevelSpice).secondaryText).toBe('Anbruch: Keine Angabe');
  });

  it('formatiert Standard-Getränke und Stück-Artikel weiterhin mit Einheiten und Nachkommastellen', () => {
    const beverageItem: InventoryItem = {
      id: 'getraenk-bier',
      name: 'Pilsener Bier',
      category: 'drinks_food',
      unitProfile: 'beverage',
      unit: 'Kiste',
      subUnit: 'Flasche',
      subUnitsPerUnit: 20,
      quantity: 4.5,
      minStock: 2,
      aliases: ['bier'],
      allowFractions: true,
      isReturnable: false,
      updatedAt: now,
    };
    const bevDisplay = formatStockDisplay(beverageItem);
    expect(bevDisplay.primaryText).toBe('4 Kisten + 10 Flaschen');
    expect(bevDisplay.secondaryText).toBe('Gesamt: 90 Flaschen');

    const pieceItem: InventoryItem = {
      id: 'stueck-kabelbinder',
      name: 'Kabelbinder',
      category: 'consumables',
      unitProfile: 'piece',
      unit: 'Stück',
      quantity: 50,
      minStock: 10,
      aliases: ['binder'],
      allowFractions: false,
      isReturnable: false,
      updatedAt: now,
    };
    const pieceDisplay = formatStockDisplay(pieceItem);
    expect(pieceDisplay.primaryText).toBe('50 Stück');
    expect(pieceDisplay.secondaryText).toBeUndefined();
  });

  it('erkennt niedrigen Bestand (isItemLowStock) für normale Artikel (quantity <= minStock)', () => {
    const item: InventoryItem = {
      id: 'tape',
      name: 'Gaffa-Tape',
      category: 'consumables',
      unitProfile: 'consumable',
      unit: 'Rolle',
      quantity: 1,
      minStock: 2,
      aliases: ['tape'],
      allowFractions: false,
      isReturnable: false,
      updatedAt: now,
    };
    expect(isItemLowStock(item)).toBe(true);

    const fullItem = { ...item, quantity: 5 };
    expect(isItemLowStock(fullItem)).toBe(false);
  });

  it('erkennt niedrigen Bestand für Gewürze (spice_bulk) anhand von Reserve und Füllstand', () => {
    const spiceItem: InventoryItem = {
      id: 'oregano',
      name: 'Oregano',
      category: 'spices_kitchen',
      unitProfile: 'spice_bulk',
      unit: 'Packung',
      quantity: 2,
      minStock: 1,
      openPackLevel: 'half',
      aliases: ['oregano'],
      allowFractions: false,
      isReturnable: false,
      updatedAt: now,
    };

    // Genug Reserve (2 >= 1) -> kein niedriger Bestand
    expect(isItemLowStock(spiceItem)).toBe(false);

    // Reserve unter minStock (0 < 1) -> niedriger Bestand!
    const lowReserveSpice = { ...spiceItem, quantity: 0, openPackLevel: 'full' as const };
    expect(isItemLowStock(lowReserveSpice)).toBe(true);

    // MinStock ist 0, Reserve ist 0, aber Anbruch noch voll -> nicht nachbestellen
    const spiceNoMin = { ...spiceItem, minStock: 0, quantity: 0, openPackLevel: 'full' as const };
    expect(isItemLowStock(spiceNoMin)).toBe(false);

    // MinStock ist 0, Reserve ist 0, aber Anbruch ist 'low' oder 'empty' -> muss nachbestellt werden!
    const spiceAlmostEmpty = { ...spiceItem, minStock: 0, quantity: 0, openPackLevel: 'low' as const };
    expect(isItemLowStock(spiceAlmostEmpty)).toBe(true);

    const spiceEmpty = { ...spiceItem, minStock: 0, quantity: 0, openPackLevel: 'empty' as const };
    expect(isItemLowStock(spiceEmpty)).toBe(true);
  });

  it('SPICE_FILL_CONFIG stellt alle 4 Ampelstufen mit Icons bereit', () => {
    expect(SPICE_FILL_CONFIG.full.label).toContain('Voll');
    expect(SPICE_FILL_CONFIG.half.label).toContain('Halbvoll');
    expect(SPICE_FILL_CONFIG.low.label).toContain('Fast leer');
    expect(SPICE_FILL_CONFIG.empty.label).toContain('Leer');
  });
});

describe('Artikel Klonen mit Unterartikeln (Bestätigungsfenster & selektive Deaktivierung)', () => {
  const originalParent: InventoryItem = {
    id: 'box-moderation-orig',
    name: 'Kiste Moderation & Workshop',
    category: 'equipment',
    unit: 'Kiste',
    quantity: 1,
    minStock: 1,
    location: 'GER-005',
    allowFractions: false,
    isReturnable: true,
    aliases: ['kiste', 'moderation'],
    updatedAt: now,
  };

  const originalSubs: InventoryItem[] = [
    {
      id: 'sub-edding',
      name: 'Edding schwarz 10er Pack',
      category: 'equipment',
      unit: 'Packung',
      quantity: 2,
      minStock: 1,
      location: 'GER-005',
      parentItemId: 'box-moderation-orig',
      allowFractions: false,
      isReturnable: true,
      aliases: ['edding'],
      updatedAt: now,
    },
    {
      id: 'sub-karten',
      name: 'Moderationskarten bunt',
      category: 'equipment',
      unit: 'Set',
      quantity: 3,
      minStock: 1,
      location: 'GER-005',
      parentItemId: 'box-moderation-orig',
      allowFractions: false,
      isReturnable: false,
      aliases: ['karten'],
      updatedAt: now,
    },
    {
      id: 'sub-schere',
      name: 'Papierschere',
      category: 'equipment',
      unit: 'Stück',
      quantity: 5,
      minStock: 2,
      location: 'GER-005',
      parentItemId: 'box-moderation-orig',
      allowFractions: false,
      isReturnable: true,
      aliases: ['schere'],
      updatedAt: now,
    },
  ];

  it('enthält standardmäßig alle Unterartikel beim Initialisieren des Klons', () => {
    const subDrafts = originalSubs.map((sub) => ({
      sourceId: sub.id,
      name: sub.name,
      quantity: String(sub.quantity),
      unit: sub.unit,
      included: true, // Standardmäßig aktiviert!
    }));

    // Alle 3 Unterartikel müssen standardmäßig aktiviert sein
    expect(subDrafts).toHaveLength(3);
    expect(subDrafts.every((s) => s.included)).toBe(true);
  });

  it('übernimmt bei Klon-Bestätigung nur aktive Unterartikel und verknüpft sie mit der neuen Hauptkiste', () => {
    const newParentId = 'box-moderation-clone-123';
    const clonedParent: InventoryItem = {
      ...originalParent,
      id: newParentId,
      name: 'Kiste Moderation (Kopie 2)',
      location: 'GER-006', // geänderter Stellplatz
      quantity: 1,
    };

    // Szenario: Der Benutzer deaktiviert dediziert "sub-karten"
    const subDrafts = [
      {
        sourceId: 'sub-edding',
        name: 'Edding schwarz 10er Pack (angepasst)',
        quantity: '4', // geänderte Menge
        unit: 'Packung',
        included: true,
      },
      {
        sourceId: 'sub-karten',
        name: 'Moderationskarten bunt',
        quantity: '3',
        unit: 'Set',
        included: false, // DEDIZIERT DEAKTIVIERT!
      },
      {
        sourceId: 'sub-schere',
        name: 'Papierschere',
        quantity: '5',
        unit: 'Stück',
        included: true,
      },
    ];

    const activeClonedSubs = subDrafts
      .filter((s) => s.included)
      .map((s, idx) => ({
        id: `clone-sub-${idx}`,
        name: s.name,
        quantity: parseFloat(s.quantity),
        unit: s.unit,
        parentItemId: newParentId,
        location: clonedParent.location,
        category: 'equipment' as const,
        minStock: 1,
        allowFractions: false,
        isReturnable: true,
        aliases: [s.name.toLowerCase().split(' ')[0]],
        updatedAt: now,
      }));

    // Nur 2 Unterartikel werden übernommen; der deaktivierte ("Moderationskarten") ist NICHT enthalten
    expect(activeClonedSubs).toHaveLength(2);
    expect(activeClonedSubs.map((s) => s.name)).toEqual([
      'Edding schwarz 10er Pack (angepasst)',
      'Papierschere',
    ]);

    // Alle übernommenen Unterartikel sind mit der neuen Kiste verknüpft und übernehmen deren neuen Ort
    activeClonedSubs.forEach((sub) => {
      expect(sub.parentItemId).toBe(newParentId);
      expect(sub.location).toBe('GER-006');
    });
  });
});




