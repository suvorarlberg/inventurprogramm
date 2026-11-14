import React, { useState, useMemo } from 'react';
import {
  Lock,
  User,
  LogIn,
  AlertCircle,
  ShieldCheck,
  Smartphone,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AppSettings, MemberAccount } from '../types';
import { buildAdminAccount, normalizeUsernameForComparison } from '../data/defaultData';
import { authenticateMemberWithPocketBase } from '../utils/pocketbaseSync';
import { verifyTotpCode, verifyAndConsumeBackupCode } from '../utils/totp';

interface MemberLoginViewProps {
  clubName: string;
  settings: AppSettings;
  memberAccounts: MemberAccount[];
  onConsumeBackupCode?: (usedCode: string) => Promise<boolean>;
  onLoginSuccess: (account: MemberAccount) => void;
}

export const MemberLoginView: React.FC<MemberLoginViewProps> = ({
  clubName,
  settings,
  memberAccounts,
  onConsumeBackupCode,
  onLoginSuccess,
}) => {
  const [stage, setStage] = useState<'credentials' | 'admin_totp' | 'admin_backup_code'>('credentials');
  const [pendingAccount, setPendingAccount] = useState<MemberAccount | null>(null);

  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const totpSecret = settings.totpSecret || settings.twoFactor?.secret || '';
  const isTotpActive = Boolean(
    (settings.totpEnabled && settings.totpSecret) ||
      (settings.twoFactor?.enabled && settings.twoFactor?.secret)
  );
  const backupCodes =
    settings.totpBackupCodes ||
    (settings.twoFactor?.backupCodes ? settings.twoFactor.backupCodes.filter((c) => !c.used).map((c) => c.code) : []);

  const allSelectableAccounts = useMemo(() => {
    const adminAcc = buildAdminAccount(settings);
    return [adminAcc, ...memberAccounts];
  }, [settings, memberAccounts]);

  const matchingSuggestions = useMemo(() => {
    const q = usernameInput.trim().toLowerCase();
    if (!q) return [];
    const exactMatch = allSelectableAccounts.some((acc) => acc.username.toLowerCase() === q);
    if (exactMatch) return [];
    return allSelectableAccounts
      .filter(
        (acc) =>
          acc.username.toLowerCase().includes(q) ||
          acc.name.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [usernameInput, allSelectableAccounts]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoggingIn(true);

    try {
      const result = await authenticateMemberWithPocketBase(
        settings,
        usernameInput,
        passwordInput,
        memberAccounts
      );

      if (result.error || !result.account) {
        setErrorMsg(result.error || 'Anmeldung fehlgeschlagen.');
        return;
      }

      const acc = result.account;
      const isAdminAccount =
        acc.isAdmin ||
        normalizeUsernameForComparison(acc.username) ===
          normalizeUsernameForComparison(settings.adminUsername || 'admin@schuelerunion.at');

      // Falls es sich um einen Admin handelt und 2FA eingerichtet ist: 2FA-Bestätigung anfordern
      if (isAdminAccount && isTotpActive && totpSecret) {
        setPendingAccount(acc);
        setStage('admin_totp');
        setTotpCodeInput('');
        setErrorMsg(null);
        return;
      }

      onLoginSuccess(acc);
    } catch {
      setErrorMsg('Fehler bei der Verbindung zum PocketBase-Server.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!pendingAccount) return;

    const clean = totpCodeInput.replace(/\s+/g, '').trim();
    if (clean.length !== 6) {
      setErrorMsg('Bitte gib den vollständigen 6-stelligen Code ein.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const valid = await verifyTotpCode(totpSecret, clean);
      if (!valid) {
        setErrorMsg('Ungültiger 6-stelliger Code. Bitte überprüfe deine Authenticator-App.');
        return;
      }

      onLoginSuccess(pendingAccount);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleBackupCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!pendingAccount) return;

    const clean = backupCodeInput.trim();
    if (!clean) {
      setErrorMsg('Bitte gib einen Notfallcode ein.');
      return;
    }

    const verification = verifyAndConsumeBackupCode(clean, backupCodes);
    if (!verification.valid || !verification.usedCode) {
      setErrorMsg('Ungültiger oder bereits verbrauchter Notfallcode.');
      return;
    }

    setIsLoggingIn(true);
    try {
      if (onConsumeBackupCode) {
        await onConsumeBackupCode(verification.usedCode);
      }
      setSuccessNotice(`Notfallcode erfolgreich eingelöst!`);
      setTimeout(() => {
        onLoginSuccess(pendingAccount);
      }, 600);
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Schülerunion Vorarlberg Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-24 h-24 rounded-2xl bg-white p-2.5 shadow-xl flex items-center justify-center">
            <img
              src="./su-logo.png"
              alt="Schülerunion Vorarlberg Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="font-bold text-xl text-white">
              {clubName || 'SU – Keller'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {stage === 'credentials' && 'Bitte melde dich mit deinem Schülerunion-Benutzernamen an'}
              {stage === 'admin_totp' && '2-Faktor-Authentifizierung (2FA) für Admin-Zugriff'}
              {stage === 'admin_backup_code' && 'Ausfallschutz per Notfallcode'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successNotice && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* 1. Stufe: Benutzername & Passwort */}
        {stage === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Benutzername
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const adminAcc = buildAdminAccount(settings);
                    setUsernameInput(adminAcc.username);
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                  title="Als Admin-Account anmelden"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin ({settings.adminUsername || 'admin@schuelerunion.at'})</span>
                </button>
              </div>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="username"
                  value={usernameInput}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onChange={(e) => {
                    setUsernameInput(e.target.value);
                    setShowSuggestions(true);
                    setErrorMsg(null);
                  }}
                  placeholder="vorname.nachname@schuelerunion.at"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-white placeholder:text-slate-500"
                />
              </div>

              {showSuggestions && matchingSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl bg-slate-950 border border-slate-700 shadow-2xl z-50 divide-y divide-slate-800/80 overflow-hidden">
                  {matchingSuggestions.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setUsernameInput(acc.username);
                        setShowSuggestions(false);
                        setErrorMsg(null);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-800 transition flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-white">{acc.name}</span>
                      <span className="text-[11px] text-sky-400 truncate">{acc.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Passwort
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="Passwort"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-white placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
            >
              <LogIn className="w-4 h-4 stroke-[2.5]" />
              <span>{isLoggingIn ? 'Anmelden...' : 'Anmelden'}</span>
            </button>
          </form>
        )}

        {/* 2. Stufe: TOTP Authenticator Code (nur bei Admin mit aktivem 2FA) */}
        {stage === 'admin_totp' && (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div className="space-y-1 text-center">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center mx-auto">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-white text-base">Zwei-Faktor-Authentifizierung</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Gib den 6-stelligen Code aus deiner Authenticator-App (z. B. Google Authenticator oder Apple Passwörter) ein:
              </p>
            </div>

            <div>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={totpCodeInput}
                onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full py-3 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-[0.5em] text-2xl font-bold focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || totpCodeInput.length !== 6}
              className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
            >
              {isLoggingIn ? 'Prüfe Code...' : 'Code bestätigen & Anmelden'}
            </button>

            <div className="pt-2 flex flex-col items-center gap-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setStage('admin_backup_code');
                  setErrorMsg(null);
                }}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Kein Zugriff aufs Smartphone? Notfallcode nutzen
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage('credentials');
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Zurück zur Anmeldung</span>
              </button>
            </div>
          </form>
        )}

        {/* 3. Stufe: Backup Notfallcode */}
        {stage === 'admin_backup_code' && (
          <form onSubmit={handleBackupCodeSubmit} className="space-y-4">
            <div className="space-y-1 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-white text-base">Notfallcode eingeben</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Verwende einen deiner 10 Notfallcodes (Format: XXXX-XXXX), falls du keinen Zugriff auf dein Handy hast.
              </p>
            </div>

            <div>
              <input
                type="text"
                required
                autoFocus
                value={backupCodeInput}
                onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-base font-bold focus:outline-none focus:border-amber-500 uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || !backupCodeInput.trim()}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              {isLoggingIn ? 'Prüfe Notfallcode...' : 'Mit Notfallcode anmelden'}
            </button>

            <div className="pt-2 text-center border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setStage('credentials');
                  setErrorMsg(null);
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Zurück zur regulären Anmeldung</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

