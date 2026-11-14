# Anleitung: Vereinskeller-App (PocketBase-Datenbank, Git-Hosting & Handy-Installation)

## 1. Sofort lokal auf dem Mac starten
Du kannst die fertige App direkt über die Datei `4_final/Vereinskeller_Starten.command` per Doppelklick starten oder im Ordner `2_code` mit `npm run dev`.
- **Standard-Admin-Passwort**: `admin` (kann im Admin-Bereich unter *4. Personen, Datenbank & Passwort* geändert werden).

---

## 2. PocketBase-Server & Collections einrichten
Die App verbindet sich standardmäßig mit dem PocketBase-Server unter [https://api.keller.schuelerunion-vorarlberg.at](https://api.keller.schuelerunion-vorarlberg.at).

Öffne das PocketBase Admin-Dashboard (`https://api.keller.schuelerunion-vorarlberg.at/_/`) und lege folgende Collections an (oder importiere `1_resources/pocketbase_collections.json` unter *Settings -> Import collections*):

### 1. Collection `keller_items` (Typ: **Base collection**)
- **API Rules** (*List/Search*, *View*, *Create*, *Update*, *Delete*): jeweils **leer lassen** (Unlock / Public), damit die App lesen und schreiben kann.
- **Spalten (Fields)**:
  - `name` — Typ: **Plain text**
  - `category` — Typ: **Plain text**
  - `quantity` — Typ: **Number**
  - `updated_at` — Typ: **Plain text**
  - `payload` — Typ: **JSON**

### 2. Collection `keller_transactions` (Typ: **Base collection**)
- **API Rules** (*List/Search*, *View*, *Create*, *Update*, *Delete*): jeweils **leer lassen** (Unlock / Public).
- **Spalten (Fields)**:
  - `timestamp` — Typ: **Plain text**
  - `type` — Typ: **Plain text**
  - `payload` — Typ: **JSON**

### 3. Collection `users` (Typ: **Auth collection** – bereits vorinstalliert)
- Standardmäßig in PocketBase vorhanden (`email`, `password`, `name`).

---

## 3. Über Git-Repository kostenlos für alle Handys bereitstellen
Wenn du ein Git-Repository (z. B. bei GitHub) anlegst, kannst du die App in 1 Minute kostenlos online stellen (z. B. über **Vercel**, **Netlify** oder **GitHub Pages**):

1. Lade den Inhalt von `2_code` in dein Git-Repository hoch (oder verbinde das Repository mit Vercel/Netlify mit Root Directory `2_code`).
2. Sobald die App online ist, öffne den **Admin-Bereich -> 4. Personen, Datenbank & Passwort**, prüfe die hinterlegte PocketBase-URL (`https://api.keller.schuelerunion-vorarlberg.at`) und klicke auf **„Aushang drucken“**.
3. **Magischer QR-Code für die Kellertür**: Der gedruckte QR-Code enthält bereits die Datenbank-Verbindung! Jedes Vereinsmitglied scannt einfach einmalig den QR-Code an der Kellertür mit der Handy-Kamera und ist sofort mit eurer Datenbank verbunden.

---

## 4. Als echte Handy-App installieren (iPhone & Android)
- **iPhone (Safari)**: Link öffnen -> Unten auf das **Teilen-Symbol** tippen -> **„Zum Home-Bildschirm“** wählen.
- **Android (Chrome)**: Link öffnen -> Oben rechts auf das Menü (**⋮**) -> **„App installieren“** / **„Zum Startbildschirm hinzufügen“**.

Die App funktioniert dank integriertem Offline-Speicher (`Service Worker` + lokaler Warteschlange) **auch tief im Keller ohne Empfang** und synchronisiert alle Buchungen automatisch mit PocketBase, sobald man wieder Empfang hat.
