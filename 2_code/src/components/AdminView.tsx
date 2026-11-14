import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  Unlock,
  ClipboardCheck,
  Package,
  FileSpreadsheet,
  Settings,
  Plus,
  Trash2,
  Edit3,
  Check,
  Download,
  Upload,
  Copy,
  QrCode,
  Printer,
  Database,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  FolderPlus,
  Tag,
  Mail,
  ShieldCheck,
  Search,
  KeyRound,
  Users,
  UserPlus,
  Smartphone,
  FileText,
  AlertTriangle,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ShieldAlert,
  MapPin,
  Box,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AppSettings,
  BackupCode,
  CategoryId,
  CategoryInfo,
  InventoryItem,
  InventoryTransaction,
  MemberAccount,
  SpiceFillLevel,
  TwoFactorConfig,
  UnitProfile,
} from '../types';
import {
  CATEGORIES,
  DEFAULT_ALLOWED_MEMBERS,
  buildMemberUsername,
  generateRandomMemberPassword,
  reconcileMemberAccounts,
} from '../data/defaultData';
import {
  formatExpiryDate,
  formatGermanNumber,
  formatStockDisplay,
  getDaysUntilExpiry,
  getExpiryStatus,
  normalizeExpiryDate,
  roundStock,
  SPICE_FILL_CONFIG,
} from '../utils/units';
import {
  downloadTextFile,
  exportInventoryToCsv,
  exportTransactionsToCsv,
  generateCsvTemplate,
  parseInventoryCsv,
  slugifyCategoryId,
} from '../utils/csvHelper';
import {
  buildShareableAppUrl,
  getPocketBaseClient,
  POCKETBASE_COLLECTIONS_INFO,
} from '../utils/pocketbaseSync';
import {
  downloadBackupCodesTxt,
  formatBackupCodesForExport,
  generateBackupCodes,
  generateTotpSecret,
  getOtpAuthUrl,
  verifyTotp,
  verifyTwoFactorInput,
} from '../utils/totp';
import {
  buildLocationQrPayload,
  StorageLocationSpot,
} from '../utils/storageLocations';
import { QrScannerModal } from './QrScannerModal';
import { LocationAssignmentModal } from './LocationAssignmentModal';
import { LabelSizeOption, ShelfQrPrintManager } from './ShelfQrPrintManager';
import { SubItemsModal } from './SubItemsModal';
import { CloneItemModal } from './CloneItemModal';

interface AdminViewProps {
  items: InventoryItem[];
  transactions: InventoryTransaction[];
  settings: AppSettings;
  isUnlocked: boolean;
  isCurrentUserAdmin?: boolean;
  canDoInitialInventory?: boolean;
  onUnlock: () => void;
  onLock: () => void;
  initial2FAVerified?: boolean;
  onClearInitial2FAVerified?: () => void;
  onSaveInitialInventory: (
    updatedQuantities: Record<string, number>,
    note?: string,
    updatedExpiries?: Record<string, string | undefined>
  ) => void;
  onUpsertItem: (item: InventoryItem) => void;
  onBulkUpsertItems?: (items: InventoryItem[]) => void;
  onUpdateItemLocation?: (itemId: string, location?: string) => void;
  onBulkUpdateItemLocations?: (itemIds: string[], location?: string) => void;
  onAddSubItems?: (parentItem: InventoryItem, newSubItems: InventoryItem[]) => void;
  onAssignItemToParent?: (itemId: string, parentItem: InventoryItem | null) => void;
  onBulkAssignItemsToParent?: (itemIds: string[], parentItem: InventoryItem | null) => void;
  onDeleteItem: (itemId: string) => void;
  onBulkImportItems: (
    newItems: InventoryItem[],
    newCategories: CategoryInfo[],
    summaryNote: string
  ) => void;
  onUpdateSettings: (newSettings: AppSettings, deletedCatId?: string) => void;
  onManualSync: () => void;
  isSyncing: boolean;
}

export const AdminView: React.FC<AdminViewProps> = ({
  items,
  transactions,
  settings,
  isUnlocked,
  isCurrentUserAdmin,
  canDoInitialInventory,
  onUnlock,
  onLock,
  initial2FAVerified,
  onClearInitial2FAVerified,
  onSaveInitialInventory,
  onUpsertItem,
  onBulkUpsertItems,
  onUpdateItemLocation,
  onBulkUpdateItemLocations,
  onAddSubItems,
  onAssignItemToParent,
  onBulkAssignItemsToParent,
  onDeleteItem,
  onBulkImportItems,
  onUpdateSettings,
  onManualSync,
  isSyncing,
}) => {
  const activeCategories = settings.categories?.length ? settings.categories : CATEGORIES;
  const activeAllowedMembers = [
    ...(Array.isArray(settings.allowedMembers) && settings.allowedMembers.length > 0
      ? settings.allowedMembers
      : DEFAULT_ALLOWED_MEMBERS),
  ].sort((a, b) => a.localeCompare(b, 'de'));
  const activeMemberAccounts: MemberAccount[] = reconcileMemberAccounts(
    activeAllowedMembers,
    settings.memberAccounts
  );

  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<
    'inventory' | 'items' | 'locations' | 'users' | 'permissions' | 'settings' | 'csv'
  >('inventory');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [adminAccessQuery, setAdminAccessQuery] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // State für Stellplatz-QR-Code-Druck & Scanner im Admin-Bereich
  const [printMode, setPrintMode] = useState<'door_qr' | 'shelf_labels'>('door_qr');
  const [spotsToPrint, setSpotsToPrint] = useState<StorageLocationSpot[]>([]);
  const [printLabelSize, setPrintLabelSize] = useState<LabelSizeOption>('standard_3col');
  const [printQrMode, setPrintQrMode] = useState<'url' | 'short_code'>('url');
  const [formScannerMode, setFormScannerMode] = useState<'camera' | 'picker' | null>(null);
  const [adminQuickSpotItem, setAdminQuickSpotItem] = useState<InventoryItem | null>(null);
  const [adminSelectedSpot, setAdminSelectedSpot] = useState<StorageLocationSpot | null>(null);
  const [adminSpotScannerOpen, setAdminSpotScannerOpen] = useState(false);
  const [adminSubItemsParent, setAdminSubItemsParent] = useState<InventoryItem | null>(null);
  const [cloningItem, setCloningItem] = useState<InventoryItem | null>(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [memberPasswordDrafts, setMemberPasswordDrafts] = useState<Record<string, string>>({});
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // State für Erstinventur (itemId -> { main: string, sub: string, expiryDate: string })
  const [counts, setCounts] = useState<
    Record<string, { main: string; sub: string; expiryDate: string }>
  >(() => buildInitialCountState(items));
  const [inventoryNote, setInventoryNote] = useState('Erstinventur / Bestandszählung');

  // State für Neue Kategorie anlegen
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryShort, setNewCategoryShort] = useState('');
  const [newCategoryReturnable, setNewCategoryReturnable] = useState(false);
  const [inlineNewCategoryMode, setInlineNewCategoryMode] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState('');

  // State für Artikel anlegen / bearbeiten (merkt sich zuletzt gewählte Einheit, Kiste, MHD & Kategorie)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adminItemFilter, setAdminItemFilter] = useState<'all' | 'expired' | 'warning'>('all');
  const [adminItemSearch, setAdminItemSearch] = useState('');
  const [itemForm, setItemForm] = useState<{
    name: string;
    category: CategoryId;
    unitProfile: UnitProfile;
    openPackLevel: SpiceFillLevel;
    unit: string;
    subUnit: string;
    subUnitsPerUnit: string;
    allowFractions: boolean;
    isReturnable: boolean;
    quantity: string;
    minStock: string;
    targetStock: string;
    location: string;
    parentItemId: string;
    expiryDate: string;
    aliases: string;
  }>(() => {
    const fallback = {
      name: '',
      category: activeCategories[0]?.id || 'drinks_food',
      unitProfile: (activeCategories[0]?.defaultUnitProfile || 'beverage') as UnitProfile,
      openPackLevel: 'full' as SpiceFillLevel,
      unit: 'Kiste',
      subUnit: 'Flasche',
      subUnitsPerUnit: '20',
      allowFractions: true,
      isReturnable: false,
      quantity: '0',
      minStock: '2',
      targetStock: '5',
      location: '',
      parentItemId: '',
      expiryDate: '',
      aliases: '',
    };
    try {
      const savedDefaults = localStorage.getItem('vk_last_item_form_defaults_v1');
      if (savedDefaults) {
        const parsed = JSON.parse(savedDefaults);
        return {
          ...fallback,
          category: parsed.category || fallback.category,
          unitProfile: (parsed.unitProfile || fallback.unitProfile) as UnitProfile,
          openPackLevel: (parsed.openPackLevel || 'full') as SpiceFillLevel,
          unit: parsed.unit ?? fallback.unit,
          subUnit: parsed.subUnit ?? '',
          subUnitsPerUnit: parsed.subUnitsPerUnit ?? '',
          allowFractions:
            typeof parsed.allowFractions === 'boolean'
              ? parsed.allowFractions
              : fallback.allowFractions,
          isReturnable:
            typeof parsed.isReturnable === 'boolean'
              ? parsed.isReturnable
              : fallback.isReturnable,
          location: parsed.location ?? '',
          parentItemId: parsed.parentItemId ?? '',
          expiryDate: parsed.expiryDate ?? '',
        };
      }
    } catch {
      // Fallback nutzen
    }
    return fallback;
  });

  // State für Einstellungen
  const [settingsForm, setSettingsForm] = useState<AppSettings>(settings);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Stufen für Admin-Login:
  // 'password': Schritt 1 - Passwort eingeben
  // 'totp': Schritt 2 - 6-stelliger Handycode aus der Authenticator-App (nach korrektem Passwort)
  // 'emergency_backup': Notfall-Fallback - Wenn Passwort vergessen ODER kein Zugriff auf Handycode
  const [loginStep, setLoginStep] = useState<'password' | 'totp' | 'emergency_backup'>('password');
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [emergencyCodeInput, setEmergencyCodeInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  // 2FA Setup State (TOTP + 10 Ersatzcodes)
  const [totpSetupActive, setTotpSetupActive] = useState(false);
  const [draftSecret, setDraftSecret] = useState('');
  const [draftBackupCodes, setDraftBackupCodes] = useState<BackupCode[]>([]);
  const [setupCodeInput, setSetupCodeInput] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedDraftBackupCodes, setCopiedDraftBackupCodes] = useState(false);

  // Passwort-Änderung mit 2FA
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [changePassword2FACode, setChangePassword2FACode] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  // Passwort-Änderung ohne 2FA
  const [directOldPassword, setDirectOldPassword] = useState('');
  const [directNewPassword, setDirectNewPassword] = useState('');
  const [directConfirmPassword, setDirectConfirmPassword] = useState('');
  const [directPasswordError, setDirectPasswordError] = useState<string | null>(null);

  // Ersatzcodes anzeigen & verwalten
  const [showBackupCodesManager, setShowBackupCodesManager] = useState(false);
  const [backupCodesAuthInput, setBackupCodesAuthInput] = useState('');
  const [backupCodesUnlocked, setBackupCodesUnlocked] = useState(false);
  const [backupCodesError, setBackupCodesError] = useState<string | null>(null);
  const [copiedActiveBackupCodes, setCopiedActiveBackupCodes] = useState(false);

  // 2FA Deaktivieren
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState('');
  const [disable2FAError, setDisable2FAError] = useState<string | null>(null);
  const [disable2FALoading, setDisable2FALoading] = useState(false);

  useEffect(() => {
    setSettingsForm(settings);
  }, [settings]);

  useEffect(() => {
    if (initial2FAVerified) {
      setAdminSubTab('settings');
      onClearInitial2FAVerified?.();
    }
  }, [initial2FAVerified]);

  useEffect(() => {
    if (!isUnlocked) {
      setLoginStep('password');
      setTotpCodeInput('');
      setEmergencyCodeInput('');
      setUnlockError(null);
    }
  }, [isUnlocked]);

  function handleAddAllowedMember(e: React.FormEvent) {
    e.preventDefault();
    const rawEntries = newMemberName
      .split(/[\n,;]+/)
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (rawEntries.length === 0) return;

    const nextList = [...activeAllowedMembers];
    const nextAccounts = [...activeMemberAccounts];
    let addedCount = 0;

    for (const candidate of rawEntries) {
      const exists = nextList.some(
        (m) => m.trim().toLowerCase() === candidate.toLowerCase()
      );
      if (!exists) {
        nextList.push(candidate);
        nextAccounts.push({
          name: candidate,
          username: buildMemberUsername(candidate),
          password: generateRandomMemberPassword(),
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      nextList.sort((a, b) => a.localeCompare(b, 'de'));
      nextAccounts.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const nextSettings: AppSettings = {
        ...settings,
        allowedMembers: nextList,
        memberAccounts: nextAccounts,
      };
      setSettingsForm(nextSettings);
      onUpdateSettings(nextSettings);
      showBanner(
        addedCount === 1
          ? `Person „${rawEntries[0]}“ (${buildMemberUsername(rawEntries[0])}) wurde mit zufälligem Passwort angelegt.`
          : `${addedCount} Personen wurden mit Zugangsdaten angelegt.`
      );
    }
    setNewMemberName('');
  }

  function handleRemoveAllowedMember(memberToRemove: string) {
    const nextList = activeAllowedMembers.filter((m) => m !== memberToRemove);
    const nextAccounts = activeMemberAccounts.filter(
      (acc) => acc.name.toLowerCase() !== memberToRemove.toLowerCase()
    );
    const nextSettings: AppSettings = {
      ...settings,
      allowedMembers: nextList,
      memberAccounts: nextAccounts,
    };
    setSettingsForm(nextSettings);
    onUpdateSettings(nextSettings);
    showBanner(`Person „${memberToRemove}“ wurde aus der Namensliste entfernt.`);
  }

  function handleSaveMemberPassword(memberName: string, newPasswordRaw: string) {
    const cleanPass = newPasswordRaw.trim();
    if (!cleanPass) return;

    const nextAccounts = activeMemberAccounts.map((acc) =>
      acc.name.toLowerCase() === memberName.toLowerCase()
        ? { ...acc, password: cleanPass }
        : acc
    );
    const nextSettings: AppSettings = {
      ...settings,
      allowedMembers: activeAllowedMembers,
      memberAccounts: nextAccounts,
    };
    setSettingsForm(nextSettings);
    onUpdateSettings(nextSettings);
    setMemberPasswordDrafts((prev) => {
      const copy = { ...prev };
      delete copy[memberName];
      return copy;
    });
    showBanner(`Passwort für „${memberName}“ wurde gespeichert!`);
  }

  // Automatische Erkennung, falls der Nutzer über PocketBase Auth eingeloggt wurde
  useEffect(() => {
    const client = getPocketBaseClient(settings);
    if (!client || !settings.adminEmail) return;

    const unsubscribe = client.authStore.onChange((token, record) => {
      const recordEmail = typeof record?.email === 'string' ? record.email : '';
      if (
        token &&
        recordEmail.toLowerCase() === settings.adminEmail?.trim().toLowerCase()
      ) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('2fa') === 'verify' || window.location.hash.includes('access_token')) {
          setAdminSubTab('settings');
          if (!isUnlocked) {
            onUnlock();
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [settings, isUnlocked]);

  async function handleTotpStepSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings.twoFactor?.enabled || !totpCodeInput.trim()) return;

    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const ok = await verifyTotp(settings.twoFactor.secret, totpCodeInput.trim());
      if (ok) {
        setPasswordInput('');
        setTotpCodeInput('');
        setLoginStep('password');
        setCounts(buildInitialCountState(items));
        showBanner('Erfolgreich mit Passwort & 2FA-Handycode entsperrt!');
        onUnlock();
      } else {
        setUnlockError(
          'Falscher oder abgelaufener Handycode. Bitte prüfe den aktuellen 6-stelligen Code in deiner Authenticator-App.'
        );
      }
    } catch {
      setUnlockError('Fehler bei der Überprüfung des Handycodes.');
    } finally {
      setUnlockLoading(false);
    }
  }

  async function handleEmergencyBackupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings.twoFactor?.enabled || !emergencyCodeInput.trim()) return;

    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const res = await verifyTwoFactorInput(settings.twoFactor, emergencyCodeInput.trim());
      if (res.valid) {
        if (res.isBackupCode && res.updatedBackupCodes) {
          const updated: AppSettings = {
            ...settingsForm,
            twoFactor: {
              ...settings.twoFactor,
              backupCodes: res.updatedBackupCodes,
            },
          };
          setSettingsForm(updated);
          onUpdateSettings(updated);
          showBanner(
            `Admin-Bereich mit Notfall-Ersatzcode ${res.usedBackupCode} entsperrt! Dieser Code wurde entwertet (${res.remainingBackupCodes} von 10 Codes übrig).`
          );
        } else {
          showBanner('Erfolgreich entsperrt!');
        }
        setPasswordInput('');
        setTotpCodeInput('');
        setEmergencyCodeInput('');
        setLoginStep('password');
        setCounts(buildInitialCountState(items));
        onUnlock();
      } else {
        setUnlockError(res.errorMessage || 'Ungültiger oder bereits verwendeter Notfallcode.');
      }
    } catch {
      setUnlockError('Fehler bei der Notfall-Verifizierung.');
    } finally {
      setUnlockLoading(false);
    }
  }

  function handleStartTotpSetup() {
    const secret = generateTotpSecret(20);
    const codes = generateBackupCodes(10);
    setDraftSecret(secret);
    setDraftBackupCodes(codes);
    setSetupCodeInput('');
    setSetupError(null);
    setCopiedSecret(false);
    setCopiedDraftBackupCodes(false);
    setTotpSetupActive(true);
  }

  async function handleConfirmTotpSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupError(null);
    if (!draftSecret || !setupCodeInput.trim()) {
      setSetupError('Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.');
      return;
    }

    try {
      const ok = await verifyTotp(draftSecret, setupCodeInput.trim());
      if (!ok) {
        setSetupError('Ungültiger 6-stelliger Code. Bitte prüfe den aktuellen Code in deiner Authenticator-App.');
        return;
      }

      const newTwoFactor: TwoFactorConfig = {
        enabled: true,
        secret: draftSecret,
        backupCodes: draftBackupCodes,
        createdAt: new Date().toISOString(),
      };

      const updated: AppSettings = {
        ...settingsForm,
        twoFactor: newTwoFactor,
      };

      setSettingsForm(updated);
      onUpdateSettings(updated);
      setTotpSetupActive(false);
      setSetupCodeInput('');
      showBanner('2-Faktor-Authentifizierung erfolgreich aktiviert! 10 Ersatzcodes sind gesichert.');
    } catch {
      setSetupError('Fehler bei der Überprüfung des Codes.');
    }
  }

  function handleDownloadBackupCodes(codes: BackupCode[]) {
    const content = formatBackupCodesForExport(codes, settings.clubName);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.clubName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_2fa_ersatzcodes.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleCopyBackupCodes(codes: BackupCode[], setCopied: (v: boolean) => void) {
    const content = formatBackupCodesForExport(codes, settings.clubName);
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleChangePasswordWith2FA(e: React.FormEvent) {
    e.preventDefault();
    setChangePasswordError(null);

    if (newAdminPassword.length < 4) {
      setChangePasswordError('Das neue Passwort muss mindestens 4 Zeichen lang sein.');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setChangePasswordError('Die Passwörter stimmen nicht überein.');
      return;
    }
    if (!changePassword2FACode.trim()) {
      setChangePasswordError('Bitte gib einen 6-stelligen Authenticator-Code oder Ersatzcode ein.');
      return;
    }

    setChangePasswordLoading(true);
    try {
      const res = await verifyTwoFactorInput(settings.twoFactor, changePassword2FACode.trim());
      if (!res.valid) {
        setChangePasswordError(res.errorMessage || 'Ungültiger 2FA- oder Ersatzcode.');
        return;
      }

      const nextBackupCodes = (res.isBackupCode && res.updatedBackupCodes)
        ? res.updatedBackupCodes
        : settings.twoFactor!.backupCodes;

      const updated: AppSettings = {
        ...settingsForm,
        adminPassword: newAdminPassword.trim(),
        twoFactor: {
          ...settings.twoFactor!,
          backupCodes: nextBackupCodes,
        },
      };

      setSettingsForm(updated);
      onUpdateSettings(updated);
      setShowChangePassword(false);
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setChangePassword2FACode('');

      if (res.isBackupCode) {
        showBanner(`Admin-Passwort geändert! Ersatzcode ${res.usedBackupCode} wurde entwertet (${res.remainingBackupCodes} von 10 Codes übrig).`);
      } else {
        showBanner('Admin-Passwort erfolgreich mit 2FA aktualisiert!');
      }
    } catch {
      setChangePasswordError('Fehler bei der 2FA-Verifizierung.');
    } finally {
      setChangePasswordLoading(false);
    }
  }

  function handleChangePasswordDirect(e: React.FormEvent) {
    e.preventDefault();
    setDirectPasswordError(null);

    if (directOldPassword !== settings.adminPassword) {
      setDirectPasswordError('Das bisherige Passwort ist nicht korrekt.');
      return;
    }
    if (directNewPassword.length < 4) {
      setDirectPasswordError('Das neue Passwort muss mindestens 4 Zeichen lang sein.');
      return;
    }
    if (directNewPassword !== directConfirmPassword) {
      setDirectPasswordError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    const updated: AppSettings = {
      ...settingsForm,
      adminPassword: directNewPassword.trim(),
    };
    setSettingsForm(updated);
    onUpdateSettings(updated);
    setDirectOldPassword('');
    setDirectNewPassword('');
    setDirectConfirmPassword('');
    showBanner('Admin-Passwort erfolgreich geändert! (Tipp: Aktiviere 2FA für zusätzliche Sicherheit)');
  }

  async function handleUnlockBackupCodesView(e: React.FormEvent) {
    e.preventDefault();
    setBackupCodesError(null);
    if (!backupCodesAuthInput.trim()) return;

    try {
      const res = await verifyTwoFactorInput(settings.twoFactor, backupCodesAuthInput.trim());
      if (!res.valid) {
        setBackupCodesError(res.errorMessage || 'Ungültiger 2FA-Code.');
        return;
      }

      if (res.isBackupCode && res.updatedBackupCodes) {
        const updated: AppSettings = {
          ...settingsForm,
          twoFactor: {
            ...settings.twoFactor!,
            backupCodes: res.updatedBackupCodes,
          },
        };
        setSettingsForm(updated);
        onUpdateSettings(updated);
      }

      setBackupCodesUnlocked(true);
      setBackupCodesAuthInput('');
    } catch {
      setBackupCodesError('Fehler bei der Code-Prüfung.');
    }
  }

  function handleRegenerateBackupCodes() {
    if (!window.confirm('Möchtest du wirklich 10 neue Ersatzcodes generieren? Alle bisherigen Ersatzcodes werden dabei sofort ungültig!')) {
      return;
    }

    const freshCodes = generateBackupCodes(10);
    const updated: AppSettings = {
      ...settingsForm,
      twoFactor: {
        ...settings.twoFactor!,
        backupCodes: freshCodes,
      },
    };
    setSettingsForm(updated);
    onUpdateSettings(updated);
    showBanner('10 neue Ersatzcodes wurden generiert! Bitte sichere diese sofort.');
  }

  async function handleDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    setDisable2FAError(null);
    if (!disable2FACode.trim()) {
      setDisable2FAError('Bitte gib einen 6-stelligen Code oder Ersatzcode ein.');
      return;
    }

    setDisable2FALoading(true);
    try {
      const res = await verifyTwoFactorInput(settings.twoFactor, disable2FACode.trim());
      if (!res.valid) {
        setDisable2FAError(res.errorMessage || 'Ungültiger Code.');
        return;
      }

      const updated: AppSettings = {
        ...settingsForm,
        twoFactor: undefined,
      };

      setSettingsForm(updated);
      onUpdateSettings(updated);
      setShowDisable2FA(false);
      setDisable2FACode('');
      setBackupCodesUnlocked(false);
      setShowBackupCodesManager(false);
      showBanner('2-Faktor-Authentifizierung wurde deaktiviert.');
    } catch {
      setDisable2FAError('Fehler beim Deaktivieren von 2FA.');
    } finally {
      setDisable2FALoading(false);
    }
  }

  function showBanner(msg: string) {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }

  function buildInitialCountState(list: InventoryItem[]) {
    const map: Record<string, { main: string; sub: string; expiryDate: string }> = {};
    for (const item of list) {
      if (item.subUnit && item.subUnitsPerUnit && item.subUnitsPerUnit > 1) {
        const totalSub = Math.round(item.quantity * item.subUnitsPerUnit);
        const fullMain = Math.trunc(totalSub / item.subUnitsPerUnit);
        const remSub = totalSub % item.subUnitsPerUnit;
        map[item.id] = {
          main: String(fullMain),
          sub: String(remSub),
          expiryDate: item.expiryDate || '',
        };
      } else {
        map[item.id] = {
          main: formatGermanNumber(item.quantity),
          sub: '0',
          expiryDate: item.expiryDate || '',
        };
      }
    }
    return map;
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (passwordInput === settings.adminPassword) {
      setPasswordError(false);
      if (settings.twoFactor?.enabled) {
        setLoginStep('totp');
        setUnlockError(null);
        setTotpCodeInput('');
      } else {
        setPasswordInput('');
        setCounts(buildInitialCountState(items));
        onUnlock();
      }
    } else {
      setPasswordError(true);
    }
  }

  function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const label = newCategoryName.trim();
    if (!label) return;

    const id = slugifyCategoryId(label);
    if (activeCategories.some((c) => c.id === id || c.label.toLowerCase() === label.toLowerCase())) {
      showBanner(`Die Kategorie „${label}“ existiert bereits.`);
      return;
    }

    const shortLabel =
      newCategoryShort.trim() || (label.length > 18 ? label.slice(0, 16) + '…' : label);

    const newCat: CategoryInfo = {
      id,
      label,
      shortLabel,
      description: newCategoryReturnable
        ? 'Leihgeräte / Inventar mit Rückgabepflicht'
        : 'Eigene Vereins-Kategorie',
      color: 'violet',
      defaultReturnable: newCategoryReturnable,
    };

    const nextCategories = [...activeCategories, newCat];
    const nextSettings = { ...settings, categories: nextCategories };
    setSettingsForm(nextSettings);
    onUpdateSettings(nextSettings);

    setNewCategoryName('');
    setNewCategoryShort('');
    setNewCategoryReturnable(false);
    setItemForm((prev) => ({
      ...prev,
      category: newCat.id,
      isReturnable: Boolean(newCat.defaultReturnable),
    }));
    showBanner(`Neue Kategorie „${newCat.label}“ erfolgreich angelegt!`);
  }

  function handleDeleteCategory(catId: string) {
    if (activeCategories.length <= 1) {
      window.alert('Mindestens eine Kategorie muss erhalten bleiben.');
      return;
    }
    const itemsInCat = items.filter((i) => i.category === catId);
    if (itemsInCat.length > 0) {
      window.alert(
        `In dieser Kategorie befinden sich noch ${itemsInCat.length} Artikel. Bitte ordne diese Artikel zuerst einer anderen Kategorie zu oder lösche sie.`
      );
      return;
    }
    const targetCat = activeCategories.find((c) => c.id === catId);
    if (!window.confirm(`Kategorie „${targetCat?.label || catId}“ wirklich löschen?`)) {
      return;
    }

    const nextCategories = activeCategories.filter((c) => c.id !== catId);
    const nextSettings = { ...settings, categories: nextCategories };
    setSettingsForm(nextSettings);
    onUpdateSettings(nextSettings, catId);
    showBanner(`Kategorie „${targetCat?.label || catId}“ wurde gelöscht.`);
  }

  function handleSaveInventoryCounts() {
    const updatedQuantities: Record<string, number> = {};
    const updatedExpiries: Record<string, string | undefined> = {};
    for (const item of items) {
      const entry = counts[item.id];
      if (!entry) continue;
      const mainVal = Math.max(0, parseFloat(entry.main.replace(',', '.')) || 0);
      const subVal = Math.max(0, parseFloat(entry.sub.replace(',', '.')) || 0);
      if (item.subUnit && item.subUnitsPerUnit && item.subUnitsPerUnit > 1) {
        updatedQuantities[item.id] = roundStock(mainVal + subVal / item.subUnitsPerUnit);
      } else {
        updatedQuantities[item.id] = roundStock(mainVal);
      }
      updatedExpiries[item.id] = entry.expiryDate ? normalizeExpiryDate(entry.expiryDate) : undefined;
    }
    onSaveInitialInventory(updatedQuantities, inventoryNote, updatedExpiries);
    showBanner('Inventur erfolgreich abgeschlossen! Alle Bestände & Ablaufdaten wurden aktualisiert.');
  }

  function startEditItem(item: InventoryItem) {
    setEditingItem(item);
    setInlineNewCategoryMode(false);
    setItemForm({
      name: item.name,
      category: item.category,
      unitProfile:
        item.unitProfile ||
        (item.category === 'spices_kitchen'
          ? 'spice_bulk'
          : item.subUnit
          ? 'beverage'
          : item.isReturnable
          ? 'piece'
          : 'consumable'),
      openPackLevel: item.openPackLevel || 'full',
      unit: item.unit,
      subUnit: item.subUnit || '',
      subUnitsPerUnit: item.subUnitsPerUnit ? String(item.subUnitsPerUnit) : '',
      allowFractions: item.allowFractions,
      isReturnable: item.isReturnable,
      quantity: formatGermanNumber(item.quantity),
      minStock: formatGermanNumber(item.minStock),
      targetStock: item.targetStock !== undefined ? formatGermanNumber(item.targetStock) : '',
      location: item.location || '',
      parentItemId: item.parentItemId || '',
      expiryDate: item.expiryDate || '',
      aliases: item.aliases.join(', '),
    });
    setAdminSubTab('items');
  }

  function handleConfirmClone(clonedItems: InventoryItem[]) {
    if (clonedItems.length === 0) return;
    if (onBulkUpsertItems) {
      onBulkUpsertItems(clonedItems);
    } else {
      clonedItems.forEach((item) => onUpsertItem(item));
    }
    const parent = clonedItems[0];
    const subCount = clonedItems.length - 1;
    showBanner(
      subCount > 0
        ? `„${parent.name}“ inkl. ${subCount} Unterartikeln erfolgreich geklont!`
        : `„${parent.name}“ erfolgreich als Kopie angelegt!`
    );
    setCloningItem(null);
  }

  function resetItemForm(preservedOverrides?: {
    category?: CategoryId;
    unitProfile?: UnitProfile;
    openPackLevel?: SpiceFillLevel;
    unit?: string;
    subUnit?: string;
    subUnitsPerUnit?: string;
    allowFractions?: boolean;
    isReturnable?: boolean;
    location?: string;
    parentItemId?: string;
    expiryDate?: string;
  }) {
    setEditingItem(null);
    setInlineNewCategoryMode(false);
    setInlineCategoryName('');
    setItemForm((prev) => {
      const catId =
        preservedOverrides?.category ?? prev.category ?? (activeCategories[0]?.id || 'drinks_food');
      const catObj = activeCategories.find((c) => c.id === catId);
      const nextState = {
        name: '',
        category: catId,
        unitProfile:
          preservedOverrides?.unitProfile ?? (catObj?.defaultUnitProfile || 'beverage'),
        openPackLevel: preservedOverrides?.openPackLevel ?? 'full',
        unit: preservedOverrides?.unit ?? prev.unit ?? 'Stück',
        subUnit: preservedOverrides?.subUnit ?? prev.subUnit ?? '',
        subUnitsPerUnit: preservedOverrides?.subUnitsPerUnit ?? prev.subUnitsPerUnit ?? '',
        allowFractions: preservedOverrides?.allowFractions ?? prev.allowFractions,
        isReturnable: preservedOverrides?.isReturnable ?? prev.isReturnable,
        quantity: '0',
        minStock: prev.minStock || '1',
        targetStock: prev.targetStock || '4',
        location: preservedOverrides?.location ?? prev.location ?? '',
        parentItemId: preservedOverrides?.parentItemId ?? prev.parentItemId ?? '',
        expiryDate: preservedOverrides?.expiryDate ?? prev.expiryDate ?? '',
        aliases: '',
      };
      try {
        localStorage.setItem(
          'vk_last_item_form_defaults_v1',
          JSON.stringify({
            category: nextState.category,
            unitProfile: nextState.unitProfile,
            openPackLevel: nextState.openPackLevel,
            unit: nextState.unit,
            subUnit: nextState.subUnit,
            subUnitsPerUnit: nextState.subUnitsPerUnit,
            allowFractions: nextState.allowFractions,
            isReturnable: nextState.isReturnable,
            location: nextState.location,
            parentItemId: nextState.parentItemId,
            expiryDate: nextState.expiryDate,
          })
        );
      } catch {
        // Ignorieren
      }
      return nextState;
    });
  }

  function handleSaveItemForm(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.name.trim()) return;

    let chosenCategoryId = itemForm.category;
    let chosenCategoryLabel =
      activeCategories.find((c) => c.id === chosenCategoryId)?.label || chosenCategoryId;

    // Falls direkt im Artikel-Formular eine neue Kategorie eingetippt wurde:
    if (inlineNewCategoryMode && inlineCategoryName.trim()) {
      const label = inlineCategoryName.trim();
      const newId = slugifyCategoryId(label);
      const existing = activeCategories.find(
        (c) => c.id === newId || c.label.toLowerCase() === label.toLowerCase()
      );
      if (existing) {
        chosenCategoryId = existing.id;
        chosenCategoryLabel = existing.label;
      } else {
        const newCat: CategoryInfo = {
          id: newId,
          label,
          shortLabel: label.length > 18 ? label.slice(0, 16) + '…' : label,
          description: 'Eigene Vereins-Kategorie',
          color: 'violet',
          defaultReturnable: itemForm.isReturnable,
        };
        const nextCategories = [...activeCategories, newCat];
        const nextSettings = { ...settings, categories: nextCategories };
        setSettingsForm(nextSettings);
        onUpdateSettings(nextSettings);
        chosenCategoryId = newCat.id;
        chosenCategoryLabel = newCat.label;
      }
    }

    const factor = parseInt(itemForm.subUnitsPerUnit, 10);
    const hasSubUnit = Boolean(itemForm.subUnit.trim() && !isNaN(factor) && factor > 1);

    const newItem: InventoryItem = {
      id: editingItem ? editingItem.id : `item-${Date.now()}`,
      name: itemForm.name.trim(),
      category: chosenCategoryId,
      categoryLabel: chosenCategoryLabel,
      unitProfile: itemForm.unitProfile || 'consumable',
      openPackLevel: itemForm.unitProfile === 'spice_bulk' ? itemForm.openPackLevel : undefined,
      unit: itemForm.unit.trim() || 'Stück',
      subUnit: hasSubUnit ? itemForm.subUnit.trim() : undefined,
      subUnitsPerUnit: hasSubUnit ? factor : undefined,
      allowFractions: itemForm.allowFractions,
      isReturnable: itemForm.isReturnable,
      quantity: roundStock(Math.max(0, parseFloat(itemForm.quantity.replace(',', '.')) || 0)),
      minStock: roundStock(Math.max(0, parseFloat(itemForm.minStock.replace(',', '.')) || 0)),
      targetStock: itemForm.targetStock.trim()
        ? roundStock(Math.max(0, parseFloat(itemForm.targetStock.replace(',', '.')) || 0))
        : undefined,
      location: itemForm.location.trim() || undefined,
      parentItemId: itemForm.parentItemId || undefined,
      expiryDate: itemForm.expiryDate.trim()
        ? normalizeExpiryDate(itemForm.expiryDate.trim())
        : undefined,
      aliases: itemForm.aliases
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
      updatedAt: new Date().toISOString(),
    };

    if (newItem.aliases.length === 0) {
      newItem.aliases = [newItem.name.toLowerCase().split(' ')[0]];
    }

    onUpsertItem(newItem);
    setCounts((prev) => ({
      ...prev,
      [newItem.id]: {
        main: formatGermanNumber(newItem.quantity),
        sub: '0',
        expiryDate: newItem.expiryDate || '',
      },
    }));
    showBanner(
      editingItem
        ? `Artikel „${newItem.name}“ wurde aktualisiert.`
        : `Neuer Artikel „${newItem.name}“ wurde angelegt.`
    );
    resetItemForm({
      category: chosenCategoryId,
      unit: newItem.unit,
      subUnit: newItem.subUnit || '',
      subUnitsPerUnit: newItem.subUnitsPerUnit ? String(newItem.subUnitsPerUnit) : '',
      allowFractions: newItem.allowFractions,
      isReturnable: newItem.isReturnable,
      location: newItem.location || '',
      parentItemId: newItem.parentItemId || '',
      expiryDate: newItem.expiryDate || '',
    });
  }

  function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      const result = parseInventoryCsv(content, items, activeCategories);
      onBulkImportItems(
        result.items,
        result.categories,
        `CSV-Import (${result.addedCount} neu, ${result.updatedCount} aktualisiert)`
      );
      setCounts(buildInitialCountState(result.items));
      showBanner(
        `CSV-Import erfolgreich: ${result.addedCount} Artikel neu angelegt, ${result.updatedCount} aktualisiert.`
      );
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto my-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        {/* Ebene 1: Passwort-Eingabe (Schritt 1) */}
        {loginStep === 'password' && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">Admin-Bereich entsperren</h2>
                <p className="text-xs text-slate-400">
                  {settings.twoFactor?.enabled
                    ? 'Schritt 1 von 2: Admin-Passwort eingeben'
                    : 'Passwortgeschützter Bereich für Erstinventur, Artikelpflege & Einstellungen'}
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Admin-Passwort
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Passwort"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-white"
                />
                {passwordError && (
                  <p className="text-xs text-rose-400 mt-1.5">
                    Falsches Passwort.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                {settings.twoFactor?.enabled ? (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Weiter zu Schritt 2 (Handycode)</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Admin-Bereich entsperren</span>
                  </>
                )}
              </button>

              {settings.twoFactor?.enabled && (
                <div className="pt-2 text-center border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep('emergency_backup');
                      setUnlockError(null);
                      setEmergencyCodeInput('');
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 hover:underline cursor-pointer flex items-center justify-center gap-1.5 w-full py-1"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Passwort vergessen? Mit Notfall-Ersatzcode entsperren</span>
                  </button>
                </div>
              )}
            </form>
          </>
        )}

        {/* Ebene 2: Handycode aus Authenticator-App (Schritt 2) */}
        {loginStep === 'totp' && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">2-Faktor-Authentifizierung</h2>
                <p className="text-xs text-emerald-400 font-medium">
                  Schritt 2 von 2: 6-stelligen Handycode bestätigen
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 leading-relaxed flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Passwort korrekt! Bitte gib den 6-stelligen Code aus deiner <strong>Authenticator-App</strong> ein:
              </span>
            </div>

            <form onSubmit={handleTotpStepSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  6-stelliger Code aus der Authenticator-App
                </label>
                <input
                  type="text"
                  maxLength={8}
                  value={totpCodeInput}
                  onChange={(e) => setTotpCodeInput(e.target.value)}
                  placeholder="z.B. 123456"
                  autoFocus
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-950 border border-emerald-500 focus:outline-none text-base text-white font-mono font-bold tracking-widest text-center"
                />
                {unlockError && (
                  <p className="text-xs text-rose-400 mt-1.5">
                    {unlockError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep('password');
                    setUnlockError(null);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Zurück</span>
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading || !totpCodeInput.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{unlockLoading ? 'Prüfe...' : 'Admin-Bereich entsperren'}</span>
                </button>
              </div>

              <div className="pt-2 text-center border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep('emergency_backup');
                    setUnlockError(null);
                    setEmergencyCodeInput('');
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 hover:underline cursor-pointer flex items-center justify-center gap-1.5 w-full py-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Kein Zugriff auf das Handy? Mit Notfall-Ersatzcode entsperren</span>
                </button>
              </div>
            </form>
          </>
        )}

        {/* Notfall-Fallback mit Ersatzcode */}
        {loginStep === 'emergency_backup' && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="font-bold text-white text-lg">Notfall-Entsperrung</h2>
                <p className="text-xs text-slate-400">
                  Mit einem deiner 10 Offline-Ersatzcodes
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Verwende diese Option, wenn du dein <strong>Admin-Passwort vergessen</strong> hast oder <strong>keinen Zugriff auf deine Authenticator-App</strong> hast. Jeder Ersatzcode kann genau einmal verwendet werden und wird danach entwertet.
              </span>
            </div>

            <form onSubmit={handleEmergencyBackupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Notfall-Ersatzcode eingeben
                </label>
                <input
                  type="text"
                  value={emergencyCodeInput}
                  onChange={(e) => setEmergencyCodeInput(e.target.value)}
                  placeholder="z.B. K7M4-9XP2"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-500 focus:outline-none text-sm text-white font-mono tracking-wider text-center"
                />
                {unlockError && (
                  <p className="text-xs text-rose-400 mt-1.5">
                    {unlockError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep('password');
                    setUnlockError(null);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Zurück</span>
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading || !emergencyCodeInput.trim()}
                  className="flex-[2] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{unlockLoading ? 'Prüfe...' : 'Mit Notfallcode entsperren'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    );
  }

  const adminDashboardUsernames = useMemo(
    () => [...new Set(settings.adminDashboardUsernames ?? [])],
    [settings.adminDashboardUsernames]
  );

  const adminDashboardSuggestions = useMemo(() => {
    const query = adminAccessQuery.trim().toLowerCase();
    if (!query) return [];

    return activeMemberAccounts
      .filter((account) => !adminDashboardUsernames.includes(account.username))
      .filter(
        (account) =>
          account.name.toLowerCase().includes(query) ||
          account.username.toLowerCase().includes(query)
      )
      .slice(0, 6);
  }, [activeMemberAccounts, adminDashboardUsernames, adminAccessQuery]);

  function handleToggleAdminDashboardAccess(username: string, enabled: boolean) {
    let nextUsernames = adminDashboardUsernames;

    if (enabled) {
      if (nextUsernames.includes(username)) return;
      nextUsernames = [...nextUsernames, username];
    } else {
      const account = activeMemberAccounts.find((item) => item.username === username);
      const displayName = account?.name ?? username;

      if (!window.confirm(`Die Freischaltung für „${displayName}“ wirklich entfernen?`)) {
        return;
      }

      nextUsernames = nextUsernames.filter((name: string) => name !== username);
    }

    onUpdateSettings({
      ...settings,
      adminDashboardUsernames: nextUsernames,
    });
    showBanner(enabled ? `Admin-Button für „${username}“ im Header freigeschaltet!` : 'Freischaltung entfernt.');
  }

  const filteredMemberAccounts = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    if (!q) return activeMemberAccounts;
    return activeMemberAccounts.filter(
      (acc: MemberAccount) => acc.name.toLowerCase().includes(q) || acc.username.toLowerCase().includes(q)
    );
  }, [activeMemberAccounts, memberSearchQuery]);

  const shareUrl = buildShareableAppUrl(settingsForm);

  return (
    <div className="space-y-5 pb-20">
      {/* Druckbereich: Entweder Stellplatz-QR-Etiketten zum Ausschneiden ODER Kellertür-QR-Code */}
      {printMode === 'shelf_labels' && spotsToPrint.length > 0 ? (
        <div className="hidden print-only p-1 text-black bg-white">
          <div className="mb-2 pb-1 border-b border-slate-400 flex items-center justify-between text-xs">
            <span className="font-bold">
              {settings.clubName} – Stellplatz-QR-Codes zum Ausschneiden ({spotsToPrint.length} Stück)
            </span>
            <span>Regale: GER • TMR • TSR • MR (Ebenen 0–3)</span>
          </div>
          <div
            className={`grid gap-1.5 ${
              printLabelSize === 'compact_4col'
                ? 'grid-cols-4'
                : 'grid-cols-3'
            }`}
          >
            {spotsToPrint.map((spot) => {
              const qrPayload = buildLocationQrPayload(settings, spot.code, printQrMode);
              return (
                <div
                  key={spot.code}
                  className="print-label-card border border-dashed border-slate-500 rounded p-1.5 flex items-center gap-2 bg-white text-black"
                >
                  <div className="shrink-0 bg-white">
                    <QRCodeSVG
                      value={qrPayload}
                      size={
                        printLabelSize === 'compact_4col'
                          ? 44
                          : printLabelSize === 'standard_3col'
                          ? 52
                          : 64
                      }
                      level="M"
                    />
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="font-mono font-extrabold text-xs sm:text-sm text-black tracking-tight">
                      {spot.code}
                    </div>
                    <div className="text-[10px] font-bold text-black truncate mt-0.5">
                      {spot.shelfName}
                    </div>
                    <div className="text-[9px] font-semibold text-slate-800 mt-0.5">
                      {spot.levelAndSpotText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="hidden print-only p-8 text-center space-y-6">
          <h1 className="text-3xl font-bold">{settings.clubName} – Digitale Kellerliste</h1>
          <p className="text-lg">
            Bitte jede <strong>Entnahme</strong>, <strong>Rückgabe</strong> und{' '}
            <strong>Befüllung</strong> kurz per Smartphone eintragen!
          </p>
          <div className="inline-block p-6 border-4 border-black rounded-2xl">
            <QRCodeSVG value={shareUrl} size={260} />
          </div>
          <p className="text-base font-medium">
            Kamera öffnen & QR-Code scannen – kein Login oder Passwort für Buchungen nötig!
          </p>
        </div>
      )}

      {statusMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 no-print">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{statusMessage}</span>
        </div>
      )}

      {/* Admin Sub-Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setCounts(buildInitialCountState(items));
              setAdminSubTab('inventory');
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'inventory'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>1. Erstinventur / Zählung</span>
          </button>

          <button
            onClick={() => setAdminSubTab('items')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'items'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>2. Artikel & Profile</span>
          </button>

          <button
            onClick={() => setAdminSubTab('locations')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'locations'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>3. Stellplätze & QR</span>
          </button>

          <button
            onClick={() => setAdminSubTab('users')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'users'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>4. Konten & Zugänge</span>
          </button>

          <button
            onClick={() => setAdminSubTab('permissions')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'permissions'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>5. Rechte & Admin-Button</span>
          </button>

          <button
            onClick={() => setAdminSubTab('settings')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'settings'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>6. Sicherheit & 2FA</span>
          </button>

          <button
            onClick={() => setAdminSubTab('csv')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              adminSubTab === 'csv'
                ? 'bg-sky-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>7. Export & Backup</span>
          </button>
        </div>

        <button
          onClick={onLock}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Sperren</span>
        </button>
      </div>

      {/* SUB-TAB 1: ERSTINVENTUR & SCHNELLZÄHLUNG */}
      {adminSubTab === 'inventory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg">
                Erstinventur & Bestands-Schnellzählung
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Trage hier für alle Artikel im Keller den gezählten Ist-Bestand ein (auch angebrochene Kisten / Einzelflaschen). Mit einem Klick unten werden alle Bestände gespeichert.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                resetItemForm();
                setAdminSubTab('items');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold border border-slate-700 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Artikel / Kategorie hinzufügen</span>
            </button>
          </div>

          <div className="space-y-4">
            {activeCategories.map((cat) => {
              const catItems = items.filter((i) => i.category === cat.id);
              if (catItems.length === 0) return null;

              return (
                <div key={cat.id} className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 px-1">
                    {cat.label}
                  </h4>
                  <div className="space-y-2">
                    {catItems.map((item) => {
                      const entry = counts[item.id] || {
                        main: String(item.quantity),
                        sub: '0',
                      };

                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-white">{item.name}</span>
                              <button
                                type="button"
                                onClick={() => startEditItem(item)}
                                className="text-xs text-slate-500 hover:text-sky-400 cursor-pointer"
                                title="Artikeldetails bearbeiten"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <p className="text-xs text-slate-400">
                                Bisheriger Soll-Bestand:{' '}
                                <strong className="text-slate-200">
                                  {formatStockDisplay(item).primaryText}
                                </strong>
                                {item.location ? ` • ${item.location}` : ''}
                              </p>
                              {item.expiryDate && (() => {
                                const status = getExpiryStatus(item.expiryDate);
                                const formatted = formatExpiryDate(item.expiryDate);
                                const days = getDaysUntilExpiry(item.expiryDate);
                                if (status === 'expired') {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                      <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                      MHD abgelaufen ({formatted})
                                    </span>
                                  );
                                }
                                if (status === 'warning') {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                      MHD {days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} T.`} ({formatted})
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-300 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700">
                                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                    MHD: {formatted}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={entry.main}
                                onChange={(e) =>
                                  setCounts((prev) => ({
                                    ...prev,
                                    [item.id]: { ...entry, main: e.target.value },
                                  }))
                                }
                                className="w-16 text-right font-bold text-sm text-white bg-transparent focus:outline-none"
                              />
                              <span className="text-xs font-medium text-sky-300">{item.unit}</span>
                            </div>

                            {item.subUnit && item.subUnitsPerUnit && (
                              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5">
                                <span className="text-xs text-slate-400">+</span>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.subUnitsPerUnit - 1}
                                  value={entry.sub}
                                  onChange={(e) =>
                                    setCounts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...entry, sub: e.target.value },
                                    }))
                                  }
                                  className="w-12 text-right font-bold text-sm text-white bg-transparent focus:outline-none"
                                />
                                <span className="text-xs font-medium text-amber-300">
                                  {item.subUnit}
                                </span>
                              </div>
                            )}

                            {/* MHD Eingabefeld direkt in der Erstinventur-Zeile */}
                            <div
                              className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5"
                              title="Ablaufdatum / Mindesthaltbarkeitsdatum (optional)"
                            >
                              <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span className="text-xs font-semibold text-slate-300">MHD:</span>
                              <input
                                type="date"
                                value={entry.expiryDate || ''}
                                onChange={(e) =>
                                  setCounts((prev) => ({
                                    ...prev,
                                    [item.id]: { ...entry, expiryDate: e.target.value },
                                  }))
                                }
                                className="bg-transparent text-xs text-white focus:outline-none [color-scheme:dark] cursor-pointer"
                              />
                              {entry.expiryDate && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCounts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...entry, expiryDate: '' },
                                    }))
                                  }
                                  className="text-xs text-slate-500 hover:text-rose-400 cursor-pointer ml-0.5"
                                  title="MHD entfernen"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <input
              type="text"
              value={inventoryNote}
              onChange={(e) => setInventoryNote(e.target.value)}
              placeholder="Bemerkung zur Inventur (z. B. Erstinventur Oktober)"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white"
            />
            <button
              type="button"
              onClick={handleSaveInventoryCounts}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Inventur-Bestände jetzt übernehmen & speichern</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ARTIKEL & KATEGORIEN VERWALTEN */}
      {adminSubTab === 'items' && (
        <div className="space-y-5 no-print">
          {/* KATEGORIEN-VERWALTUNG OBEN */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-sky-400" />
                  <span>Kategorien verwalten ({activeCategories.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lege eigene Kategorien für euren Vereinskeller an (z. B. „Deko & Festzelt“, „Putzkammer“, „Jugendabteilung“). Diese erscheinen sofort als Filter in der Klick-Liste.
                </p>
              </div>
            </div>

            {/* Vorhandene Kategorien als Chips */}
            <div className="flex flex-wrap gap-2">
              {activeCategories.map((cat) => {
                const count = items.filter((i) => i.category === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <Tag className="w-3.5 h-3.5 text-sky-400" />
                    <span className="font-semibold text-white">{cat.label}</span>
                    <span className="text-slate-400">({count} Artikel)</span>
                    {cat.defaultReturnable && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300">
                        Leihgeräte
                      </span>
                    )}
                    {count === 0 && activeCategories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-slate-500 hover:text-rose-400 ml-1 cursor-pointer"
                        title="Leere Kategorie löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Formular: Neue Kategorie anlegen */}
            <form
              onSubmit={handleCreateCategory}
              className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 pt-2 border-t border-slate-800/80"
            >
              <div className="flex-1">
                <label className="block text-xs text-slate-300 mb-1">
                  Name der neuen Kategorie *
                </label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="z. B. Deko & Partybedarf, Grillzubehör, Reinigung..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                />
              </div>

              <div className="sm:w-44">
                <label className="block text-xs text-slate-300 mb-1">
                  Kurzname für Tab (optional)
                </label>
                <input
                  type="text"
                  value={newCategoryShort}
                  onChange={(e) => setNewCategoryShort(e.target.value)}
                  placeholder="z. B. Deko & Party"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                />
              </div>

              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 cursor-pointer h-[38px]">
                <input
                  type="checkbox"
                  checked={newCategoryReturnable}
                  onChange={(e) => setNewCategoryReturnable(e.target.checked)}
                  className="rounded accent-sky-500"
                />
                <span>Leihgeräte (Rückgabe)</span>
              </label>

              <button
                type="submit"
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm h-[38px] shadow-md shadow-sky-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Kategorie anlegen</span>
              </button>
            </form>
          </div>

          {/* ARTIKEL-FORMULAR & ARTIKELLISTE UNTEN */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Formular links */}
            <form
              onSubmit={handleSaveItemForm}
              className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 self-start"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base">
                  {editingItem ? `Artikel bearbeiten` : 'Neuen Artikel anlegen'}
                </h3>
                {editingItem && (
                  <button
                    type="button"
                    onClick={() => resetItemForm()}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Abbrechen / Neu
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Artikelname *</label>
                <input
                  type="text"
                  required
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="z. B. Pilsener Bier (0,5l) oder Gaffa-Tape"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                />
              </div>

              {/* Einheitsprofil (Lösung 3: Gewürze vs. Getränke vs. Stückgut) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Einheitsprofil & Zählweise
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    {
                      profile: 'beverage' as UnitProfile,
                      label: 'Getränke',
                      desc: 'Kiste & Flaschen',
                      icon: '🍾',
                    },
                    {
                      profile: 'spice_bulk' as UnitProfile,
                      label: 'Küche & Gewürze',
                      desc: 'Vorrat + Anbruch-Ampel',
                      icon: '🧂',
                    },
                    {
                      profile: 'piece' as UnitProfile,
                      label: 'Stückgut / Technik',
                      desc: 'Ganze Einheiten',
                      icon: '📦',
                    },
                    {
                      profile: 'consumable' as UnitProfile,
                      label: 'Verbrauch',
                      desc: 'Rolle / Packung',
                      icon: '📄',
                    },
                  ].map(({ profile, label, desc, icon }) => {
                    const active = itemForm.unitProfile === profile;
                    return (
                      <button
                        key={profile}
                        type="button"
                        onClick={() => {
                          if (profile === 'spice_bulk') {
                            setItemForm((prev) => ({
                              ...prev,
                              unitProfile: 'spice_bulk',
                              category: activeCategories.some((c) => c.id === 'spices_kitchen')
                                ? 'spices_kitchen'
                                : prev.category,
                              unit: prev.unit === 'Kiste' ? 'Dose' : prev.unit || 'Dose',
                              subUnit: '',
                              subUnitsPerUnit: '',
                              allowFractions: false,
                              openPackLevel: prev.openPackLevel || 'full',
                            }));
                          } else if (profile === 'beverage') {
                            setItemForm((prev) => ({
                              ...prev,
                              unitProfile: 'beverage',
                              category: activeCategories.some((c) => c.id === 'drinks_food')
                                ? 'drinks_food'
                                : prev.category,
                              unit: prev.unit === 'Dose' ? 'Kiste' : prev.unit || 'Kiste',
                              subUnit: prev.subUnit || 'Flasche',
                              subUnitsPerUnit: prev.subUnitsPerUnit || '20',
                              allowFractions: true,
                            }));
                          } else if (profile === 'piece') {
                            setItemForm((prev) => ({
                              ...prev,
                              unitProfile: 'piece',
                              category: activeCategories.some((c) => c.id === 'equipment')
                                ? 'equipment'
                                : prev.category,
                              unit: 'Stück',
                              subUnit: '',
                              subUnitsPerUnit: '',
                              allowFractions: false,
                              isReturnable: true,
                            }));
                          } else {
                            setItemForm((prev) => ({
                              ...prev,
                              unitProfile: 'consumable',
                              category: activeCategories.some((c) => c.id === 'consumables')
                                ? 'consumables'
                                : prev.category,
                              allowFractions: true,
                            }));
                          }
                        }}
                        className={`p-2 rounded-xl text-left border transition cursor-pointer flex flex-col gap-0.5 ${
                          active
                            ? 'bg-sky-500/20 border-sky-500 text-sky-200 shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-base">{icon}</span>
                        <span className="text-xs font-bold text-white">{label}</span>
                        <span className="text-[10px] text-slate-400">{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Füllstands-Ampel bei Gewürzen & Schüttgut */}
              {itemForm.unitProfile === 'spice_bulk' && (
                <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <span>🧂</span>
                      <span>Anbruch-Füllstand der offenen Dose</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Kein Gramm-Schätzen</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Der Vorratsbestand zählt geschlossene Originalpackungen. Wie voll ist die angebrochene Dose in der Küche aktuell?
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['full', 'half', 'low', 'empty'] as SpiceFillLevel[]).map((lvl) => {
                      const cfg = SPICE_FILL_CONFIG[lvl];
                      const isSel = itemForm.openPackLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setItemForm({ ...itemForm, openPackLevel: lvl })}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer ${
                            isSel
                              ? `${cfg.badgeClass} ring-1 ring-white/30 shadow-md`
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300">Kategorie</label>
                    <button
                      type="button"
                      onClick={() => setInlineNewCategoryMode((prev) => !prev)}
                      className="text-[11px] text-sky-400 hover:underline cursor-pointer"
                    >
                      {inlineNewCategoryMode ? 'Aus Liste wählen' : '+ Neue Kategorie'}
                    </button>
                  </div>

                  {inlineNewCategoryMode ? (
                    <input
                      type="text"
                      required
                      value={inlineCategoryName}
                      onChange={(e) => setInlineCategoryName(e.target.value)}
                      placeholder="Neue Kategorie eingeben..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-sky-500 text-sm text-white"
                    />
                  ) : (
                    <select
                      value={itemForm.category}
                      onChange={(e) => {
                        const catId = e.target.value;
                        const catObj = activeCategories.find((c) => c.id === catId);
                        setItemForm({
                          ...itemForm,
                          category: catId,
                          isReturnable: Boolean(catObj?.defaultReturnable || catId === 'equipment'),
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                    >
                      {activeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Haupteinheit (z.B. Kiste, Rolle)
                  </label>
                  <input
                    type="text"
                    required
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    placeholder="Kiste, Rolle, Stück..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              {/* Optionale Untereinheit für Kisten/Gebinde */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-sky-300">
                  Optional: Gebinde / Einzelflaschen-Umrechnung
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Untereinheit (z.B. Flasche)
                    </label>
                    <input
                      type="text"
                      value={itemForm.subUnit}
                      onChange={(e) => setItemForm({ ...itemForm, subUnit: e.target.value })}
                      placeholder="leer lassen falls keine"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Anzahl pro {itemForm.unit || 'Haupteinheit'}
                    </label>
                    <input
                      type="number"
                      min="2"
                      value={itemForm.subUnitsPerUnit}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, subUnitsPerUnit: e.target.value })
                      }
                      placeholder="z. B. 20"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Aktueller Bestand</label>
                  <input
                    type="text"
                    value={itemForm.quantity}
                    onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Mindestbestand</label>
                  <input
                    type="text"
                    value={itemForm.minStock}
                    onChange={(e) => setItemForm({ ...itemForm, minStock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Sollbestand</label>
                  <input
                    type="text"
                    value={itemForm.targetStock}
                    onChange={(e) => setItemForm({ ...itemForm, targetStock: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <label className="text-xs text-slate-300">Stellplatz / Lagerort</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFormScannerMode('camera')}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                        title="QR-Code am Regal scannen"
                      >
                        <QrCode className="w-3 h-3" />
                        <span>QR scannen</span>
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={() => setFormScannerMode('picker')}
                        className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
                        title="Regal (GER, TMR, TSR, MR), Ebene (0–3) & Platz wählen"
                      >
                        Platz wählen
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={itemForm.location}
                    onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                    placeholder="QR scannen / Platz wählen (z. B. GER-E0-P01)..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300">Ablaufdatum / MHD (optional)</label>
                    {itemForm.expiryDate && (
                      <button
                        type="button"
                        onClick={() => setItemForm({ ...itemForm, expiryDate: '' })}
                        className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Datum entfernen
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={itemForm.expiryDate}
                    onChange={(e) => setItemForm({ ...itemForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              {/* Optional: Ist dieser Artikel ein Unterartikel in einer Kiste / einem Überartikel? */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300 flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5 text-amber-400" />
                    <span>Liegt als Unterartikel in Kiste / Überartikel (optional)</span>
                  </label>
                  {editingItem && (
                    <button
                      type="button"
                      onClick={() => setAdminSubItemsParent(editingItem)}
                      className="text-[11px] font-semibold text-amber-300 hover:underline cursor-pointer"
                    >
                      + Unterartikel in „{editingItem.name}“ verwalten
                    </button>
                  )}
                </div>
                <select
                  value={itemForm.parentItemId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const parentObj = items.find((i) => i.id === pid);
                    setItemForm((prev) => ({
                      ...prev,
                      parentItemId: pid,
                      location: parentObj?.location || prev.location,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white"
                >
                  <option value="">
                    — Eigenständiger Artikel / Eigene Kiste (kein Überartikel) —
                  </option>
                  {items
                    .filter((i) => (!editingItem || i.id !== editingItem.id) && !i.parentItemId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        In Kiste: {p.name}
                        {p.location ? ` (${p.location})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Suchbegriffe / Synonyme für Textblock-Erkennung (kommagetrennt)
                </label>
                <input
                  type="text"
                  value={itemForm.aliases}
                  onChange={(e) => setItemForm({ ...itemForm, aliases: e.target.value })}
                  placeholder="z. B. gaffa, panzertape, klebeband"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.allowFractions}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, allowFractions: e.target.checked })
                    }
                    className="rounded accent-sky-500"
                  />
                  <span>Angebrochene Einheiten erlauben (z. B. halbe Rolle / +½ Button)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.isReturnable}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, isReturnable: e.target.checked })
                    }
                    className="rounded accent-sky-500"
                  />
                  <span>Leihgerät / Inventar mit Rückgabepflicht (wird nach Event zurückerwartet)</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{editingItem ? 'Änderungen speichern' : 'Artikel im Keller anlegen'}</span>
                </button>
                {editingItem && (
                  <button
                    type="button"
                    onClick={() => setCloningItem(editingItem)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold text-xs cursor-pointer border border-slate-700 shrink-0"
                    title="Diesen Artikel als Vorlage klonen"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Klonen</span>
                  </button>
                )}
              </div>
            </form>

            {/* Artikelliste rechts */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-bold text-white text-base">
                  Vorhandene Artikel ({items.length})
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {items.some((i) => getExpiryStatus(i.expiryDate) === 'expired') && (
                    <button
                      type="button"
                      onClick={() =>
                        setAdminItemFilter((prev) => (prev === 'expired' ? 'all' : 'expired'))
                      }
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer transition ${
                        adminItemFilter === 'expired'
                          ? 'bg-rose-500 text-slate-950'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        {items.filter((i) => getExpiryStatus(i.expiryDate) === 'expired').length}{' '}
                        abgelaufen
                      </span>
                    </button>
                  )}
                  {items.some((i) => getExpiryStatus(i.expiryDate) === 'warning') && (
                    <button
                      type="button"
                      onClick={() =>
                        setAdminItemFilter((prev) => (prev === 'warning' ? 'all' : 'warning'))
                      }
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer transition ${
                        adminItemFilter === 'warning'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>
                        {items.filter((i) => getExpiryStatus(i.expiryDate) === 'warning').length}{' '}
                        bald fällig
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Schnelle Artikelsuche */}
              <div className="relative">
                <input
                  type="text"
                  value={adminItemSearch}
                  onChange={(e) => setAdminItemSearch(e.target.value)}
                  placeholder="Artikel nach Name, Ort oder MHD filtern..."
                  className="w-full pl-3 pr-8 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                {adminItemSearch && (
                  <button
                    type="button"
                    onClick={() => setAdminItemSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {items
                  .filter((item) => {
                    if (adminItemFilter === 'expired' && getExpiryStatus(item.expiryDate) !== 'expired') {
                      return false;
                    }
                    if (adminItemFilter === 'warning' && getExpiryStatus(item.expiryDate) !== 'warning') {
                      return false;
                    }
                    if (adminItemSearch.trim()) {
                      const q = adminItemSearch.toLowerCase();
                      const matchName = item.name.toLowerCase().includes(q);
                      const matchLoc = (item.location || '').toLowerCase().includes(q);
                      const matchAlias = item.aliases.some((a) => a.toLowerCase().includes(q));
                      const matchExp = item.expiryDate
                        ? item.expiryDate.includes(q) || formatExpiryDate(item.expiryDate).includes(q)
                        : false;
                      return matchName || matchLoc || matchAlias || matchExp;
                    }
                    return true;
                  })
                  .map((item) => {
                    const catObj = activeCategories.find((c) => c.id === item.category);
                    const subItemsCount = items.filter((s) => s.parentItemId === item.id).length;
                    const parentObj = item.parentItemId
                      ? items.find((p) => p.id === item.parentItemId)
                      : undefined;
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-white truncate">
                              {parentObj ? `↳ ${item.name}` : item.name}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
                              {catObj?.shortLabel || catObj?.label || item.categoryLabel || item.category}
                            </span>
                            {subItemsCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setAdminSubItemsParent(item)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer"
                                title="Unterartikel in dieser Kiste anzeigen / bearbeiten"
                              >
                                <Box className="w-3 h-3 text-amber-400" />
                                <span>Kiste ({subItemsCount} Unterartikel)</span>
                              </button>
                            )}
                            {parentObj && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-200 border border-amber-500/30">
                                <Box className="w-3 h-3 text-amber-400" />
                                <span>In: {parentObj.name}</span>
                              </span>
                            )}
                            {item.expiryDate && (() => {
                              const status = getExpiryStatus(item.expiryDate);
                              const formatted = formatExpiryDate(item.expiryDate);
                              const days = getDaysUntilExpiry(item.expiryDate);
                              if (status === 'expired') {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                    MHD abgelaufen ({formatted})
                                  </span>
                                );
                              }
                              if (status === 'warning') {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                    MHD {days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} T.`} ({formatted})
                                  </span>
                                );
                              }
                              return (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-300 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700">
                                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                  MHD: {formatted}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Bestand:{' '}
                            <strong className="text-emerald-300">
                              {formatStockDisplay(item).primaryText}
                            </strong>{' '}
                            • Min: {item.minStock} {item.unit}
                            {item.location ? ` • Ort: ${item.location}` : ''}
                            {item.aliases.length > 0
                              ? ` • Begriffe: ${item.aliases.slice(0, 3).join(', ')}`
                              : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setAdminSubItemsParent(item)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                            title="Unterartikel / Kisten-Inhalt verwalten (z. B. 15 Artikel in dieser Kiste)"
                          >
                            <Box className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdminQuickSpotItem(item)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 cursor-pointer"
                            title="Stellplatz per QR-Scan oder Regal-Auswahl zuweisen"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCloningItem(item)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 cursor-pointer"
                            title="Artikel klonen (Bestätigungsfenster öffnen, inkl. Unterartikel)"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditItem(item)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 cursor-pointer"
                            title="Bearbeiten"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Artikel „${item.name}“ wirklich löschen?`)) {
                                onDeleteItem(item.id);
                              }
                            }}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: STELLPLÄTZE & QR-CODES (GER, TMR, TSR, MR) */}
      {adminSubTab === 'locations' && (
        <ShelfQrPrintManager
          items={items}
          settings={settings}
          onOpenSpotModal={(spot) => setAdminSelectedSpot(spot)}
          onOpenScannerModal={() => setAdminSpotScannerOpen(true)}
          onPrintLabels={(spots, size, qrMode) => {
            setSpotsToPrint(spots);
            setPrintLabelSize(size);
            setPrintQrMode(qrMode);
            setPrintMode('shelf_labels');
            setTimeout(() => {
              window.print();
            }, 80);
          }}
        />
      )}

      {/* SUB-TAB 4: CSV / EXCEL IMPORT & EXPORT */}
      {adminSubTab === 'csv' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-400" />
              <span>Erstinventur per Excel / CSV importieren</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ideal für die schnelle Erstinventur am PC: Lade dir die Muster-Vorlage herunter, befülle sie in Excel oder LibreOffice und lade sie hier wieder hoch. Auch neue Kategorien in der Spalte „Kategorie“ werden beim Import automatisch angelegt!
            </p>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    generateCsvTemplate(),
                    'Vereinskeller_Erstinventur_Vorlage.csv'
                  )
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs sm:text-sm font-semibold border border-slate-700 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>1. CSV-Mustervorlage herunterladen</span>
              </button>

              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs sm:text-sm font-bold shadow-lg shadow-sky-500/20 cursor-pointer">
                <Upload className="w-4 h-4 stroke-[2.5]" />
                <span>2. Ausgefüllte CSV-Datei importieren</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-400" />
              <span>Aktuellen Bestand & Logbuch exportieren</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Exportiere jederzeit den kompletten aktuellen Kellerbestand oder das Buchungs-Logbuch als deutschsprachige CSV-Tabelle (direkt in Excel mit korrekten Umlauten und Spalten öffenbar).
            </p>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    exportInventoryToCsv(items, activeCategories),
                    `Vereinskeller_Bestand_${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Bestandsliste als Excel-CSV speichern</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    exportTransactionsToCsv(transactions),
                    `Vereinskeller_Logbuch_${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold border border-slate-700 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Logbuch / Historie exportieren</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PERSONEN, DATENBANK, QR-CODE & EINSTELLUNGEN */}
      {/* SUB-TAB 4: BENUTZER & KONTEN */}
      {adminSubTab === 'users' && (
        <div className="space-y-5 no-print">
          {/* Zentraler Admin-Account Übersicht */}
          <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base flex flex-wrap items-center gap-2">
                    <span>Zentraler Admin-Account</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      Vollzugriff
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Mit diesem zentralen Admin-Account kannst du dich jederzeit direkt anmelden oder den Admin-Bereich entsperren.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 bg-slate-950 px-3.5 py-2.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Admin-Benutzername:</span>
                  <code className="font-mono font-bold text-sky-300">
                    {settings.adminUsername || 'admin@schuelerunion.at'}
                  </code>
                </div>
                <span className="text-slate-700 mx-1">|</span>
                <div>
                  <span className="text-slate-400 block text-[10px]">Passwort:</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {settings.adminPassword}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Berechtigte Personen, Benutzernamen & Passwörter verwalten */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Users className="w-5 h-5 text-sky-400" />
                  <span>
                    Benutzerkonten & Login-Zugangsdaten ({activeMemberAccounts.length})
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Jede Person erhält automatisch den Benutzernamen{' '}
                  <code className="text-sky-300">vorname.nachname@schuelerunion.at</code> und ein Passwort.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const lines = activeMemberAccounts.map(
                    (acc) => `${acc.name}\t${acc.username}\t${acc.password}`
                  );
                  const text = `Name\tBenutzername\tPasswort\n${lines.join('\n')}`;
                  navigator.clipboard.writeText(text);
                  setCopiedCredentials(true);
                  setTimeout(() => setCopiedCredentials(false), 3000);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 border border-slate-700 cursor-pointer self-start sm:self-auto shrink-0"
              >
                {copiedCredentials ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Alle Zugangsdaten kopiert!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Alle Zugangsdaten kopieren</span>
                  </>
                )}
              </button>
            </div>

            {/* Suche & Neue Person anlegen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="Person oder E-Mail durchsuchen..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <form onSubmit={handleAddAllowedMember} className="flex gap-2">
                <div className="relative flex-1">
                  <UserPlus className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Neue Person anlegen (z. B. Max Mustermann)..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newMemberName.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Anlegen</span>
                </button>
              </form>
            </div>

            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1 pt-1">
              {filteredMemberAccounts.map((acc: MemberAccount) => {
                const draftPass =
                  memberPasswordDrafts[acc.name] !== undefined
                    ? memberPasswordDrafts[acc.name]
                    : acc.password;
                const isModified =
                  memberPasswordDrafts[acc.name] !== undefined &&
                  memberPasswordDrafts[acc.name].trim() !== acc.password;

                return (
                  <div
                    key={acc.name}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white truncate flex items-center gap-2">
                        <span>{acc.name}</span>
                        {acc.isAdmin && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                            👑 Admin
                          </span>
                        )}
                        {adminDashboardUsernames.includes(acc.username) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold">
                            Admin-Button aktiv
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-sky-400 font-mono break-all">
                        {acc.username}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-slate-400 mr-1">Passwort:</span>
                      <input
                        type="text"
                        value={draftPass}
                        onChange={(e) =>
                          setMemberPasswordDrafts((prev) => ({
                            ...prev,
                            [acc.name]: e.target.value,
                          }))
                        }
                        className="w-32 sm:w-36 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-500 focus:outline-none font-mono text-xs text-emerald-300 font-semibold"
                        title="Passwort für diese Person (direkt einsehbar & änderbar)"
                      />

                      {isModified && (
                        <button
                          type="button"
                          onClick={() => handleSaveMemberPassword(acc.name, draftPass)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title="Neues Passwort speichern"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Speichern</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const rnd = generateRandomMemberPassword();
                          handleSaveMemberPassword(acc.name, rnd);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Neues zufälliges Passwort generieren"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `Benutzername: ${acc.username}\nPasswort: ${acc.password}`
                          );
                          showBanner(`Zugangsdaten von ${acc.name} in die Zwischenablage kopiert!`);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 transition cursor-pointer"
                        title="Zugangsdaten dieser Person kopieren"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Soll „${acc.name}“ (${acc.username}) wirklich von der Liste der berechtigten Personen entfernt werden?`
                            )
                          ) {
                            handleRemoveAllowedMember(acc.name);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
                        title={`${acc.name} entfernen`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: RECHTEVERWALTUNG & ADMIN-BUTTON FREISCHALTUNG (SiP-STIL) */}
      {adminSubTab === 'permissions' && (
        <div className="space-y-5 no-print">
          {/* Admin-Dashboard & Button Freischaltung (wie in SiP!) */}
          <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <span>Admin-Button & Dashboard-Freischaltung</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Bestimme hier, wer den <strong>Admin-Button im Header</strong> überhaupt sehen und aufrufen darf. Bei allen anderen Benutzern wird der Admin-Button komplett ausgeblendet!
                </p>
              </div>

              <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs self-start sm:self-auto">
                {adminDashboardUsernames.length} Konto/Konten freigeschaltet
              </span>
            </div>

            {/* Suche nach Mitglied zum Freischalten */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={adminAccessQuery}
                onChange={(e) => setAdminAccessQuery(e.target.value)}
                placeholder="Mitglied suchen, um Admin-Button freizuschalten..."
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Vorschläge zum Hinzufügen */}
            {adminDashboardSuggestions.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Klicken zum Freischalten:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {adminDashboardSuggestions.map((acc: MemberAccount) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleToggleAdminDashboardAccess(acc.username, true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 cursor-pointer transition hover:border-amber-500/40"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-medium">{acc.name}</span>
                      <span className="text-[10px] text-slate-500">({acc.username})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Aktuell freigeschaltete Konten */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-slate-300 block">
                Aktuell freigeschaltete Konten für den Admin-Button:
              </span>
              {adminDashboardUsernames.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-500">
                  Keine zusätzlichen Konten freigeschaltet. Nur der zentrale Admin-Account sieht den Admin-Button.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {adminDashboardUsernames.map((username: string) => {
                    const acc = activeMemberAccounts.find((a) => a.username === username);
                    const displayName = acc?.name || username;
                    return (
                      <div
                        key={username}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-amber-500/30 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-white block truncate">{displayName}</span>
                          <span className="font-mono text-[11px] text-amber-300 truncate block">
                            {username}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleAdminDashboardAccess(username, false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition cursor-pointer ml-2"
                          title="Admin-Freischaltung aufheben"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: SICHERHEIT, DATENBANK & 2FA */}
      {adminSubTab === 'settings' && (
        <div className="space-y-5 no-print">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Database className="w-5 h-5 text-sky-400" />
                  <span>PocketBase Server-Datenbank für Multi-Geräte-Sync</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Alle Geräte synchronisieren den Kellerbestand, Buchungen und Zugangsdaten über euren eigenen PocketBase-Server (Standard: <code className="text-sky-300">https://api.keller.schuelerunion-vorarlberg.at</code>).
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    PocketBase API-URL
                  </label>
                  <input
                    type="url"
                    value={settingsForm.pocketbaseUrl}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, pocketbaseUrl: e.target.value })
                    }
                    placeholder="https://api.keller.schuelerunion-vorarlberg.at"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(POCKETBASE_COLLECTIONS_INFO);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 3000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 border border-slate-700 cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>
                      {copiedSql
                        ? 'PocketBase-Struktur kopiert!'
                        : 'Collections-Übersicht für PocketBase kopieren'}
                    </span>
                  </button>

                  {settings.pocketbaseUrl && (
                    <button
                      type="button"
                      onClick={onManualSync}
                      disabled={isSyncing}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-xs font-semibold text-emerald-300 border border-emerald-500/40 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Jetzt mit PocketBase synchronisieren</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Optionale KI-Erkennung */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Optionale KI-Unterstützung für Freitext-Erkennung</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Die lokale Texterkennung funktioniert bereits komplett kostenlos und offline. Optional kannst du zusätzlich einen Gemini- oder OpenAI-API-Key hinterlegen.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <select
                    value={settingsForm.aiProvider}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        aiProvider: e.target.value as 'gemini' | 'openai',
                      })
                    }
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  >
                    <option value="gemini">Google Gemini API</option>
                    <option value="openai">OpenAI API</option>
                  </select>
                  <input
                    type="password"
                    value={settingsForm.aiApiKey}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, aiApiKey: e.target.value })
                    }
                    placeholder="Optionaler API-Key..."
                    className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              {/* Vereinsname */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-sm">Vereinsname</h4>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Name des Vereins / Kellers</label>
                  <input
                    type="text"
                    value={settingsForm.clubName}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, clubName: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  // Passwort & 2FA-E-Mail sind ausschließlich über den 2FA-Bereich änderbar
                  const safeSettings: AppSettings = {
                    ...settingsForm,
                    adminPassword: settings.adminPassword,
                    adminEmail: settings.adminEmail,
                    allowedMembers: activeAllowedMembers,
                    memberAccounts: activeMemberAccounts,
                    projectLists: settings.projectLists || [],
                  };
                  onUpdateSettings(safeSettings);
                  showBanner('Einstellungen und Datenbank-Verbindung gespeichert!');
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Allgemeine Einstellungen speichern</span>
              </button>

              {/* 2FA-Geschützter Bereich: Admin-Passwort & 2FA-Schutz */}
              <div className="pt-5 border-t border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Admin-Passwort & 2-Faktor-Authentifizierung (2FA)</span>
                  </h4>
                  {settings.twoFactor?.enabled ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>2FA Aktiv (Authenticator-App)</span>
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Nicht aktiviert</span>
                    </span>
                  )}
                </div>

                {!settings.twoFactor?.enabled ? (
                  /* =========================================================
                     FALL 1: 2FA NOCH NICHT AKTIV
                     ========================================================= */
                  <div className="space-y-4">
                    {!totpSetupActive ? (
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Smartphone className="w-5 h-5 text-sky-400" />
                          </div>
                          <div className="space-y-1">
                            <h5 className="font-bold text-white text-xs sm:text-sm">
                              2FA per Authentifizierungs-App einrichten
                            </h5>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              Schütze den Admin-Bereich vor unbefugtem Zugriff mit einem standardmäßigen 6-stelligen Code aus deiner Authenticator-App (z. B. <strong>Google Authenticator</strong>, <strong>Apple Passwörter</strong>, <strong>Microsoft Authenticator</strong>, <strong>1Password</strong>). Zusätzlich erhältst du <strong>10 Offline-Ersatzcodes</strong> für den Notfall.
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={handleStartTotpSetup}
                            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 cursor-pointer"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>2FA jetzt einrichten (QR-Code + 10 Ersatzcodes)</span>
                          </button>
                        </div>

                        {/* Direktes Ändern des Admin-Passworts, solange 2FA noch nicht aktiv ist */}
                        <div className="pt-4 border-t border-slate-900 space-y-3">
                          <span className="text-xs font-semibold text-slate-400 block">
                            Alternativ: Admin-Passwort direkt ändern (ohne 2FA)
                          </span>
                          {directPasswordError && (
                            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                              {directPasswordError}
                            </div>
                          )}
                          <form onSubmit={handleChangePasswordDirect} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="password"
                              required
                              value={directOldPassword}
                              onChange={(e) => setDirectOldPassword(e.target.value)}
                              placeholder="Bisheriges Passwort"
                              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                            />
                            <input
                              type="password"
                              required
                              value={directNewPassword}
                              onChange={(e) => setDirectNewPassword(e.target.value)}
                              placeholder="Neues Passwort"
                              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                            />
                            <div className="flex gap-2">
                              <input
                                type="password"
                                required
                                value={directConfirmPassword}
                                onChange={(e) => setDirectConfirmPassword(e.target.value)}
                                placeholder="Wiederholen"
                                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white"
                              />
                              <button
                                type="submit"
                                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer shrink-0"
                              >
                                Speichern
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    ) : (
                      /* SETUP-WIZARD: QR-Code + 10 Ersatzcodes + 6-stellige Bestätigung */
                      <div className="p-5 rounded-2xl bg-slate-950 border border-sky-500/40 space-y-6">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <h5 className="font-bold text-white text-sm flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-sky-400" />
                            <span>2FA-Einrichtung: Authenticator-App & 10 Ersatzcodes</span>
                          </h5>
                          <button
                            type="button"
                            onClick={() => setTotpSetupActive(false)}
                            className="text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            Abbrechen
                          </button>
                        </div>

                        {setupError && (
                          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                            {setupError}
                          </div>
                        )}

                        {/* Schritt 1: QR-Code & Manueller Schlüssel */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-sky-500 text-slate-950 font-black text-xs flex items-center justify-center">
                              1
                            </span>
                            <span className="font-bold text-white text-xs sm:text-sm">
                              QR-Code in deiner Authenticator-App scannen
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-900 border border-slate-800">
                            <div className="bg-white p-3 rounded-2xl shadow-xl shrink-0">
                              <QRCodeSVG
                                value={getOtpAuthUrl(draftSecret, 'Admin', settings.clubName)}
                                size={160}
                                bgColor="#ffffff"
                                fgColor="#020617"
                                level="M"
                              />
                            </div>
                            <div className="space-y-3 flex-1 text-center sm:text-left">
                              <p className="text-xs text-slate-300 leading-relaxed">
                                Öffne deine bevorzugte Authentifizierungs-App (z. B. Google Authenticator, Apple Passwörter / iCloud-Schlüsselbund, 1Password, Microsoft Authenticator) und scanne diesen QR-Code.
                              </p>
                              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-1.5">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                                  Manueller Einrichtungsschlüssel (Secret)
                                </span>
                                <div className="flex items-center justify-between gap-2">
                                  <code className="text-xs sm:text-sm font-mono font-bold text-sky-300 tracking-widest break-all">
                                    {draftSecret.match(/.{1,4}/g)?.join(' ') || draftSecret}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(draftSecret);
                                      setCopiedSecret(true);
                                      setTimeout(() => setCopiedSecret(false), 2500);
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1 cursor-pointer shrink-0"
                                    title="Schlüssel kopieren"
                                  >
                                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span className="text-[11px]">{copiedSecret ? 'Kopiert' : 'Kopieren'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Schritt 2: 10 Ersatzcodes sichern */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">
                              2
                            </span>
                            <span className="font-bold text-white text-xs sm:text-sm">
                              Deine 10 Notfall-Ersatzcodes sichern
                            </span>
                          </div>

                          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5 leading-relaxed">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              <strong>Wichtig:</strong> Speichere diese 10 Ersatzcodes jetzt an einem sicheren Ort ab (z. B. in deiner Passwort-App, drucke sie aus oder lade die Datei herunter). Jeder Ersatzcode kann genau <strong>einmal</strong> als Notfall-Schlüssel verwendet werden, falls du dein Smartphone verlierst oder keinen Zugriff darauf hast.
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {draftBackupCodes.map((bc, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-0.5"
                              >
                                <span className="text-[10px] text-slate-400 font-semibold block">#{idx + 1}</span>
                                <span className="font-mono font-bold text-white text-xs sm:text-sm tracking-wider">
                                  {bc.code}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleCopyBackupCodes(draftBackupCodes, setCopiedDraftBackupCodes)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                            >
                              {copiedDraftBackupCodes ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                              <span>{copiedDraftBackupCodes ? '10 Ersatzcodes kopiert!' : 'Alle 10 Ersatzcodes kopieren'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBackupCodes(draftBackupCodes)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-sky-300 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                              <span>Als Textdatei herunterladen (.txt)</span>
                            </button>
                          </div>
                        </div>

                        {/* Schritt 3: Bestätigungscode zur Aktivierung */}
                        <form onSubmit={handleConfirmTotpSetup} className="space-y-3 pt-3 border-t border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">
                              3
                            </span>
                            <span className="font-bold text-white text-xs sm:text-sm">
                              Aktivierung mit 6-stelligem Code aus deiner Authenticator-App bestätigen
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              required
                              maxLength={8}
                              value={setupCodeInput}
                              onChange={(e) => setSetupCodeInput(e.target.value)}
                              placeholder="z.B. 123456"
                              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-sky-500 text-sm font-mono font-bold tracking-widest text-center text-white focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!setupCodeInput.trim()}
                              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                            >
                              2FA jetzt aktivieren
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                ) : (
                  /* =========================================================
                     FALL 2: 2FA IST BEREITS AKTIV
                     ========================================================= */
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                    {/* Statusübersicht */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block mb-0.5">Admin-Passwort:</span>
                        <span className="font-bold text-white tracking-widest text-sm">••••••••••••</span>
                        <span className="text-[11px] text-emerald-400 block mt-0.5 font-medium">
                          Durch 2FA geschützt
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block mb-0.5">Authenticator-App:</span>
                        <span className="font-bold text-sky-300 text-sm">Aktiv (TOTP)</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          6-stelliger Bestätigungscode
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block mb-0.5">Verfügbare Ersatzcodes:</span>
                        {(() => {
                          const total = settings.twoFactor?.backupCodes?.length || 10;
                          const active = (settings.twoFactor?.backupCodes || []).filter((c) => !c.used).length;
                          const isLow = active <= 2;
                          return (
                            <>
                              <span className={`font-bold text-sm ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {active} von {total} verfügbar
                              </span>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {isLow ? 'Achtung: Bald aufgebraucht!' : 'Für Offline-/Notfall-Login'}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Aktionsleiste */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowChangePassword((prev) => !prev);
                          setShowBackupCodesManager(false);
                          setShowDisable2FA(false);
                          setChangePasswordError(null);
                        }}
                        className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition ${
                          showChangePassword
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>Admin-Passwort ändern</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowBackupCodesManager((prev) => !prev);
                          setShowChangePassword(false);
                          setShowDisable2FA(false);
                          setBackupCodesError(null);
                        }}
                        className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition ${
                          showBackupCodesManager
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>Ersatzcodes anzeigen & verwalten</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowDisable2FA((prev) => !prev);
                          setShowChangePassword(false);
                          setShowBackupCodesManager(false);
                          setDisable2FAError(null);
                        }}
                        className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-xs font-medium cursor-pointer ml-auto"
                      >
                        <span>2FA deaktivieren</span>
                      </button>
                    </div>

                    {/* Panel 1: Passwort mit 2FA ändern */}
                    {showChangePassword && (
                      <form
                        onSubmit={handleChangePasswordWith2FA}
                        className="p-4 rounded-xl bg-slate-900 border border-sky-500/30 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <h6 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-sky-400" />
                            <span>Neues Admin-Passwort festlegen (2FA-Autorisierung erforderlich)</span>
                          </h6>
                          <button
                            type="button"
                            onClick={() => setShowChangePassword(false)}
                            className="text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            Schließen
                          </button>
                        </div>

                        {changePasswordError && (
                          <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                            {changePasswordError}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs text-slate-300 mb-1">Neues Admin-Passwort</label>
                            <input
                              type="password"
                              required
                              value={newAdminPassword}
                              onChange={(e) => setNewAdminPassword(e.target.value)}
                              placeholder="Mindestens 4 Zeichen..."
                              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-300 mb-1">Passwort wiederholen</label>
                            <input
                              type="password"
                              required
                              value={confirmAdminPassword}
                              onChange={(e) => setConfirmAdminPassword(e.target.value)}
                              placeholder="Passwort wiederholen..."
                              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
                            />
                          </div>
                        </div>

                        <div className="pt-1">
                          <label className="block text-xs text-sky-300 mb-1 font-semibold">
                            6-stelliger Authenticator-Code ODER unbenutzter Ersatzcode (z.B. XXXX-XXXX)
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              required
                              value={changePassword2FACode}
                              onChange={(e) => setChangePassword2FACode(e.target.value)}
                              placeholder="Code eingeben..."
                              className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-sky-500 text-sm text-white font-mono font-bold"
                            />
                            <button
                              type="submit"
                              disabled={changePasswordLoading || !changePassword2FACode.trim()}
                              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
                            >
                              {changePasswordLoading ? 'Prüfe...' : 'Neues Passwort speichern'}
                            </button>
                          </div>
                        </div>
                      </form>
                    )}

                    {/* Panel 2: Ersatzcodes verwalten & einsehen */}
                    {showBackupCodesManager && (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-4">
                        <div className="flex items-center justify-between">
                          <h6 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-sky-400" />
                            <span>10 Offline-Ersatzcodes verwalten</span>
                          </h6>
                          <button
                            type="button"
                            onClick={() => setShowBackupCodesManager(false)}
                            className="text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            Schließen
                          </button>
                        </div>

                        {!backupCodesUnlocked ? (
                          /* Autorisierung vor Einsicht der Codes */
                          <form onSubmit={handleUnlockBackupCodesView} className="space-y-3">
                            <p className="text-xs text-slate-300 leading-relaxed">
                              Zum Schutz deiner Ersatzcodes: Bitte bestätige mit einem <strong>6-stelligen Authenticator-Code</strong> oder einem Ersatzcode:
                            </p>
                            {backupCodesError && (
                              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                                {backupCodesError}
                              </div>
                            )}
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                required
                                value={backupCodesAuthInput}
                                onChange={(e) => setBackupCodesAuthInput(e.target.value)}
                                placeholder="6-stelliger Code oder Ersatzcode..."
                                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white font-mono"
                              />
                              <button
                                type="submit"
                                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm cursor-pointer"
                              >
                                Ersatzcodes anzeigen
                              </button>
                            </div>
                          </form>
                        ) : (
                          /* Freigeschaltete Ersatzcodes-Liste */
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              {(settings.twoFactor?.backupCodes || []).map((bc, idx) => (
                                <div
                                  key={idx}
                                  className={`p-2.5 rounded-xl border text-center space-y-0.5 ${
                                    bc.used
                                      ? 'bg-slate-950/60 border-slate-800 text-slate-500 line-through opacity-60'
                                      : 'bg-slate-950 border-emerald-500/40 text-emerald-200'
                                  }`}
                                >
                                  <span className="text-[10px] text-slate-400 font-semibold block">#{idx + 1}</span>
                                  <span className="font-mono font-bold text-xs sm:text-sm tracking-wider">
                                    {bc.code}
                                  </span>
                                  <span className="text-[9px] block">
                                    {bc.used ? 'Bereits verwendet' : 'Gültig'}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyBackupCodes(
                                      settings.twoFactor?.backupCodes || [],
                                      setCopiedActiveBackupCodes
                                    )
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 font-semibold cursor-pointer"
                                >
                                  {copiedActiveBackupCodes ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>{copiedActiveBackupCodes ? 'Kopiert!' : 'Codes kopieren'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDownloadBackupCodes(settings.twoFactor?.backupCodes || [])
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs text-sky-300 font-semibold cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Herunterladen (.txt)</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={handleRegenerateBackupCodes}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs text-amber-300 font-semibold cursor-pointer ml-auto"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>10 neue Ersatzcodes generieren</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Panel 3: 2FA deaktivieren */}
                    {showDisable2FA && (
                      <form
                        onSubmit={handleDisable2FA}
                        className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-3"
                      >
                        <h6 className="font-bold text-rose-300 text-xs sm:text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                          <span>2-Faktor-Authentifizierung wirklich deaktivieren?</span>
                        </h6>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Wenn du 2FA deaktivierst, ist dein Admin-Passwort nicht mehr durch Handy-Codes oder Ersatzcodes abgesichert. Zur Bestätigung gib bitte einen aktuellen 6-stelligen Code oder Ersatzcode ein:
                        </p>
                        {disable2FAError && (
                          <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200">
                            {disable2FAError}
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            required
                            value={disable2FACode}
                            onChange={(e) => setDisable2FACode(e.target.value)}
                            placeholder="6-stelliger Code oder Ersatzcode..."
                            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-rose-500/50 text-sm text-white font-mono"
                          />
                          <button
                            type="submit"
                            disabled={disable2FALoading || !disable2FACode.trim()}
                            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
                          >
                            {disable2FALoading ? 'Deaktiviere...' : 'Jetzt 2FA deaktivieren'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDisable2FA(false)}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>

          {/* QR-Code für die Kellertür & Handy-Einladung */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col items-center text-center space-y-4 self-start">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <QrCode className="w-5 h-5 text-sky-400" />
              <span>QR-Code für Kellertür & Mitglieder-Handys</span>
            </div>
            <p className="text-xs text-slate-400">
              Wenn Mitglieder diesen QR-Code scannen, öffnet sich die App direkt verbunden mit eurer Vereins-Datenbank. Auf iPhone & Android kann sie über „Zum Home-Bildschirm“ als echte App installiert werden.
            </p>

            <div className="p-4 bg-white rounded-2xl shadow-lg">
              <QRCodeSVG value={shareUrl} size={190} />
            </div>

            <div className="flex flex-wrap justify-center gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 3000);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Link kopiert!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-sky-400" />
                    <span>Einladungs-Link kopieren</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPrintMode('door_qr');
                  setTimeout(() => window.print(), 50);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Aushang drucken</span>
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Scanner/Auswahl-Modal für das Artikelformular im Admin-Bereich */}
      <QrScannerModal
        isOpen={formScannerMode !== null}
        onClose={() => setFormScannerMode(null)}
        items={items}
        initialMode={formScannerMode || 'camera'}
        title="Stellplatz für Artikel wählen"
        subtitle="Scanne den QR-Code am Regal oder wähle Regal (GER, TMR, TSR, MR), Ebene (0–3) & Platz (1–20)."
        currentLocationText={itemForm.location}
        onSelectLocation={(spot) => {
          setItemForm((prev) => ({ ...prev, location: spot.fullDisplayLabel }));
          setFormScannerMode(null);
        }}
        onClearLocation={() => {
          setItemForm((prev) => ({ ...prev, location: '' }));
          setFormScannerMode(null);
        }}
      />

      {/* Schnell-Zuweisung eines Stellplatzes direkt aus der Admin-Artikelliste */}
      <QrScannerModal
        isOpen={Boolean(adminQuickSpotItem)}
        onClose={() => setAdminQuickSpotItem(null)}
        items={items}
        title={
          adminQuickSpotItem
            ? `Stellplatz für „${adminQuickSpotItem.name}“`
            : 'Stellplatz zuweisen'
        }
        subtitle="Scanne den QR-Code am Regal oder wähle Regal (GER, TMR, TSR, MR), Ebene (0–3) & Platz (1–20)."
        currentLocationText={adminQuickSpotItem?.location}
        onSelectLocation={(spot) => {
          if (adminQuickSpotItem) {
            if (onUpdateItemLocation) {
              onUpdateItemLocation(adminQuickSpotItem.id, spot.fullDisplayLabel);
            } else {
              onUpsertItem({
                ...adminQuickSpotItem,
                location: spot.fullDisplayLabel,
                updatedAt: new Date().toISOString(),
              });
            }
            showBanner(
              `Stellplatz „${spot.fullDisplayLabel}“ wurde „${adminQuickSpotItem.name}“ zugewiesen.`
            );
          }
          setAdminQuickSpotItem(null);
        }}
        onClearLocation={() => {
          if (adminQuickSpotItem) {
            if (onUpdateItemLocation) {
              onUpdateItemLocation(adminQuickSpotItem.id, undefined);
            } else {
              onUpsertItem({
                ...adminQuickSpotItem,
                location: undefined,
                updatedAt: new Date().toISOString(),
              });
            }
          }
          setAdminQuickSpotItem(null);
        }}
      />

      {/* Scanner im Reiter "3. Stellplätze & QR-Codes" zum Öffnen eines Stellplatzes */}
      <QrScannerModal
        isOpen={adminSpotScannerOpen}
        onClose={() => setAdminSpotScannerOpen(false)}
        items={items}
        title="Stellplatz-QR scannen oder wählen"
        subtitle="Scanne ein Etikett, um diesem Stellplatz anschließend per Klick Artikel zuzuweisen."
        onSelectLocation={(spot) => {
          setAdminSpotScannerOpen(false);
          setAdminSelectedSpot(spot);
        }}
      />

      {/* Stellplatz-Zuweisungs-Modal im Reiter "3. Stellplätze & QR-Codes" */}
      <LocationAssignmentModal
        spot={adminSelectedSpot}
        items={items}
        onClose={() => setAdminSelectedSpot(null)}
        onAssignItemToSpot={(itemId, spot) => {
          if (onUpdateItemLocation) {
            onUpdateItemLocation(itemId, spot ? spot.fullDisplayLabel : undefined);
          } else {
            const target = items.find((i) => i.id === itemId);
            if (target) {
              onUpsertItem({
                ...target,
                location: spot ? spot.fullDisplayLabel : undefined,
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }}
        onSwitchSpotRequest={() => {
          setAdminSelectedSpot(null);
          setAdminSpotScannerOpen(true);
        }}
        onManageSubItems={(parentItem) => {
          setAdminSelectedSpot(null);
          setAdminSubItemsParent(parentItem);
        }}
      />

      {/* Unterartikel / Kisten-Inhalt verwalten Modal im Admin-Bereich */}
      <SubItemsModal
        parentItem={
          adminSubItemsParent
            ? items.find((i) => i.id === adminSubItemsParent.id) || adminSubItemsParent
            : null
        }
        items={items}
        onClose={() => setAdminSubItemsParent(null)}
        onAddSubItems={(parentItem, newSubs) => {
          if (onAddSubItems) {
            onAddSubItems(parentItem, newSubs);
          } else {
            newSubs.forEach((s) => onUpsertItem(s));
          }
          showBanner(
            `${newSubs.length} Unterartikel in „${parentItem.name}“ angelegt (gleicher Stellplatz).`
          );
        }}
        onAssignExistingItemToParent={(itemId, parentItem) => {
          if (onAssignItemToParent) {
            onAssignItemToParent(itemId, parentItem);
          } else {
            const target = items.find((i) => i.id === itemId);
            if (target) {
              onUpsertItem({
                ...target,
                parentItemId: parentItem ? parentItem.id : undefined,
                location: parentItem ? parentItem.location || target.location : target.location,
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }}
        onDeleteSubItem={onDeleteItem}
        onChangeParentLocationRequest={(parentItem) => {
          setAdminSubItemsParent(null);
          setAdminQuickSpotItem(parentItem);
        }}
        onCloneParentItem={(parentItem) => {
          setAdminSubItemsParent(null);
          setCloningItem(parentItem);
        }}
      />

      {/* Bestätigungsfenster zum Klonen eines Artikels inkl. Unterartikeln */}
      {cloningItem && (
        <CloneItemModal
          sourceItem={cloningItem}
          items={items}
          categories={activeCategories}
          onClose={() => setCloningItem(null)}
          onConfirmClone={handleConfirmClone}
          onOpenLocationScanner={(currentLoc, applyLoc) => {
            // Scanner für Stellplatz-Auswahl öffnen
            setAdminSelectedSpot(null);
            setAdminQuickSpotItem({
              id: 'temp-clone-target',
              name: cloningItem.name,
              category: cloningItem.category,
              unit: cloningItem.unit,
              allowFractions: false,
              isReturnable: false,
              quantity: 0,
              minStock: 0,
              location: currentLoc,
              aliases: [],
              updatedAt: new Date().toISOString(),
            });
          }}
        />
      )}
    </div>
  );
};
