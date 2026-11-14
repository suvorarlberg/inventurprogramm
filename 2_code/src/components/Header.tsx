import React from 'react';
import {
  Package,
  ClipboardList,
  ClipboardPen,
  ShoppingCart,
  ShieldCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  AlertTriangle,
  Smartphone,
  LogOut,
  User,
} from 'lucide-react';
import { MemberPermissions } from '../types';

export type ActiveTab = 'booking' | 'kellerliste' | 'history' | 'shopping' | 'admin';

interface HeaderProps {
  clubName: string;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lowStockCount: number;
  openLoansCount: number;
  projectListsCount: number;
  currentUserName: string;
  isCurrentUserAdmin?: boolean;
  isAdminUnlocked?: boolean;
  canAccessAdminDashboard?: boolean;
  onOpenAdminUnlockModal?: () => void;
  userPermissions?: MemberPermissions;
  onLogout: () => void;
  isOnline: boolean;
  hasCloudConfig: boolean;
  unsyncedCount: number;
  isSyncing: boolean;
  onManualSync: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  clubName,
  activeTab,
  setActiveTab,
  lowStockCount,
  openLoansCount,
  projectListsCount,
  currentUserName,
  isCurrentUserAdmin,
  isAdminUnlocked,
  canAccessAdminDashboard,
  onOpenAdminUnlockModal,
  userPermissions,
  onLogout,
  isOnline,
  hasCloudConfig,
  unsyncedCount,
  isSyncing,
  onManualSync,
}) => {
  const isInsideNativeApk =
    window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost';

  const showBookingTab =
    !userPermissions ||
    userPermissions.canViewInventory ||
    userPermissions.canBook ||
    userPermissions.canRestock;
  const showKellerlisteTab = !userPermissions || userPermissions.canViewKellerlisten;
  const showHistoryTab = !userPermissions || userPermissions.canViewHistory;
  const showShoppingTab =
    !userPermissions || userPermissions.canViewShoppingList || userPermissions.canRestock;

  // Der Admin-Zugang ist nur sichtbar, wenn der Account Admin ist, der Admin-Bereich entsperrt wurde,
  // oder der Admin-Button für diesen Account freigeschaltet ist
  const showAdminTab =
    isCurrentUserAdmin ||
    isAdminUnlocked ||
    Boolean(canAccessAdminDashboard) ||
    Boolean(userPermissions?.canDoInitialInventory);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 no-print">
      <div className="max-w-5xl mx-auto px-3 sm:px-6">
        {/* Top Row: Brand & Sync Status */}
        <div className="flex items-center justify-between py-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg shrink-0">
              <img
                src="./su-logo.png"
                alt="Schülerunion Vorarlberg"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg leading-tight text-white truncate">
                {clubName || 'Vereinskeller'}
              </h1>
              <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                <span>
                  Angemeldet: <strong className="text-sky-300">{currentUserName}</strong>
                </span>
                {isCurrentUserAdmin && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                    Admin-Account
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Sync / Connectivity Badge, APK Download & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isInsideNativeApk && (
              <a
                href="https://erdbeerwaffel311.github.io/inventurprogramm/Vereinskeller.apk"
                download="Vereinskeller.apk"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-medium transition"
                title="Android-App (.apk) direkt herunterladen und installieren"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Android .apk</span>
                <span className="md:hidden">.apk</span>
              </a>
            )}
            {!isOnline ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium"
                title="Offline-Modus aktiv: Alle Buchungen werden auf dem Gerät gespeichert und automatisch synchronisiert, sobald wieder Empfang besteht."
              >
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  Offline{unsyncedCount > 0 ? ` (${unsyncedCount})` : ''}
                </span>
              </div>
            ) : hasCloudConfig ? (
              <button
                onClick={onManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition cursor-pointer"
                title="Mit Cloud-Datenbank verbunden – Klicken zum Synchronisieren"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isSyncing
                    ? 'Synchronisiere...'
                    : unsyncedCount > 0
                    ? `${unsyncedCount} ausstehend`
                    : 'Cloud synchron'}
                </span>
                <span className="sm:hidden">Sync</span>
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('admin')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                title="Noch keine Cloud-Datenbank hinterlegt – Geräte-Sync im Admin-Bereich einrichten"
              >
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Lokal</span>
                <Wifi className="w-3 h-3 text-emerald-400 sm:hidden" />
              </button>
            )}

            {/* Admin-Schnellzugriff wie in SiP */}
            {showAdminTab ? (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'admin' ? 'booking' : 'admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                }`}
                title="Zwischen Inventur/Buchung und Admin-Bereich wechseln"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {activeTab === 'admin' ? 'Zum Keller' : 'Admin & Konten'}
                </span>
                <span className="sm:hidden">Admin</span>
              </button>
            ) : onOpenAdminUnlockModal ? (
              <button
                type="button"
                onClick={onOpenAdminUnlockModal}
                className="p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                title="Admin-Bereich entsperren (Passwort & 2FA)"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-medium transition cursor-pointer"
              title={`Als ${currentUserName} abmelden / Benutzer wechseln`}
            >
              <User className="w-3.5 h-3.5 hidden sm:inline text-sky-400" />
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-wrap sm:grid sm:grid-flow-col sm:auto-cols-fr gap-1 pb-2">
          {showBookingTab && (
            <button
              onClick={() => setActiveTab('booking')}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 rounded-xl text-[11px] sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'booking'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>
                {userPermissions && !userPermissions.canBook && !userPermissions.canRestock
                  ? 'Bestand (Ansicht)'
                  : 'Ein / Ausbuchen'}
              </span>
            </button>
          )}

          {showKellerlisteTab && (
            <button
              onClick={() => setActiveTab('kellerliste')}
              className={`flex-1 relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 rounded-xl text-[11px] sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'kellerliste'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <ClipboardPen className="w-4 h-4" />
              <span>Kellerliste</span>
              {projectListsCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'kellerliste'
                      ? 'bg-slate-950 text-sky-300'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  }`}
                >
                  {projectListsCount}
                </span>
              )}
            </button>
          )}

          {showHistoryTab && (
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 rounded-xl text-[11px] sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Logbuch</span>
              {openLoansCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'history'
                      ? 'bg-slate-950 text-sky-300'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  }`}
                >
                  {openLoansCount}
                </span>
              )}
            </button>
          )}

          {showShoppingTab && (
            <button
              onClick={() => setActiveTab('shopping')}
              className={`flex-1 relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 rounded-xl text-[11px] sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'shopping'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Einkaufsliste</span>
              {lowStockCount > 0 && (
                <span
                  className={`flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'shopping'
                      ? 'bg-slate-950 text-amber-300'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {lowStockCount}
                </span>
              )}
            </button>
          )}

          {showAdminTab && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1.5 rounded-xl text-[11px] sm:text-sm font-medium transition cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {userPermissions?.canDoInitialInventory && !isCurrentUserAdmin
                  ? 'Erstinventur / Admin'
                  : 'Admin / Inventur'}
              </span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
