# PhoneMirror dla Windows: odbiornik AirPlay z ramką iPhone'a

Działa jak **LonelyScreen**: **na telefonie nic nie instalujesz**.
Na iPhonie otwierasz **Centrum sterowania → Klonowanie ekranu → PhoneMirror**.
Ekran telefonu pojawia się na komputerze w ramce **Twojego modelu**: iPhone 14 z notchem, 15 Pro z Dynamic Island, SE z przyciskiem Home itd.

```
iPhone ──AirPlay──▶ silnik (UxPlay, w tle) ──H.264──▶ okno PhoneMirror (ramka telefonu)
```

Okno wygląda jak **„Klonowanie iPhone'a” na Macu**: nie ma ramki Windows, widać tylko telefon.

| Co | Jak |
|---|---|
| Przesuwanie okna | chwyć telefon i przeciągnij |
| Powiększanie i zmniejszanie | uchwyt w prawym dolnym rogu, **Ctrl + kółko myszy**, **Ctrl + / Ctrl −**, **Ctrl 0** = 100% |
| Pasek z przyciskami (zamknij, minimalizuj, zrzut, nagrywanie, obrót, zawsze na wierzchu, ustawienia) | najedź myszą na okno |
| Głośność | **kliknij przyciski głośności na obudowie** (przytrzymaj, aby zmieniać płynnie) albo strzałki ↑ ↓ |
| Wyciszenie | przełącznik lub przycisk Czynność na obudowie albo klawisz M |
| Zrzut ekranu | przycisk boczny (zasilania), Ctrl+S |
| Ustawienia (nazwa odbiornika, jakość, model i kolor, rozmiar) | ikona ⚙︎ albo prawy przycisk myszy |

Pliki zrzutów i nagrań trafiają do folderu **Obrazy**.

---

## Jak zdobyć `PhoneMirror.exe`

### Sposób A: w chmurze, bez instalowania niczego u siebie (polecam)
1. Załóż darmowe konto na GitHub i utwórz **nowe repozytorium**. Wgraj do niego zawartość tego folderu: przeciągnij pliki na stronę albo użyj GitHub Desktop.
2. Otwórz zakładkę **Actions**, wybierz **Build PhoneMirror.exe** i kliknij **Run workflow**.
3. Po około 15–20 minutach wejdź w zakończone zadanie i pobierz z sekcji **Artifacts** paczkę `PhoneMirror-Windows`. W środku są dwa pliki:
   - `PhoneMirror-Setup-1.0.0.exe`: instalator, który sam ustawia zaporę Windows;
   - `PhoneMirror-1.0.0-portable.exe`: wersja przenośna, bez instalacji.

### Sposób B: na własnym komputerze z Windows
W PowerShellu, w folderze projektu:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```
Skrypt sam zainstaluje przez winget brakujące MSYS2 i Node.js, zbuduje silnik AirPlay i zrobi `.exe` w folderze `dist\`.

---

## Użycie

1. Uruchom **PhoneMirror**. Jeśli Windows zapyta o zaporę, zaznacz **Sieci prywatne** i kliknij **Zezwól**.
2. iPhone i komputer muszą być w **tej samej sieci Wi‑Fi**.
3. Na iPhonie przesuń palcem w dół od prawego górnego rogu ekranu, stuknij **Klonowanie ekranu** ⧉ i wybierz **PhoneMirror**.
4. Aby zakończyć, w tym samym miejscu stuknij **Zatrzymaj klonowanie**.

## Gdy coś nie działa

| Problem | Co zrobić |
|---|---|
| iPhone nie widzi „PhoneMirror” | Ustaw sieć Windows jako **Prywatną** (Ustawienia → Sieć → Wi‑Fi → Profil sieci). Sprawdź, czy router nie ma włączonej „izolacji klientów” (częste w sieciach gościnnych). Przy wersji przenośnej zezwól na dostęp w oknie zapory. |
| Czerwony komunikat „Silnik AirPlay nie działa” | Kliknij **Uruchom ponownie**, a potem **Dziennik**: tam jest powód błędu. |
| Zła ramka telefonu | Wybierz model ręcznie w *Wygląd → Ramka*. Wybór zostanie zapamiętany. |
| Obraz obrócony w złą stronę | Naciśnij ⟳ albo klawisz R. |
| Obraz się zacina albo połączenie zrywa | Ustaw jakość 1080p lub 720p. Postaw komputer bliżej routera albo podłącz go kablem. Wyłącz oszczędzanie energii karty Wi‑Fi (Menedżer urządzeń → karta sieciowa → Zarządzanie energią). |

## Uruchamianie podczas tworzenia (Mac, Linux, Windows)
Jeśli masz `uxplay` w systemie (`brew install uxplay`, `sudo apt install uxplay`), wpisz:
```bash
cd app && npm install && npm start      # okno aplikacji
# albo bez Electrona:  node server.js   → otwiera się w przeglądarce Chrome/Edge
```

## Licencje
Silnik AirPlay to [UxPlay](https://github.com/FDH2/UxPlay) (GPL‑3.0), uruchamiany jako osobny program. Biblioteki multimedialne pochodzą z GStreamera (LGPL).
Informacje o źródłach są dołączone w `engine/licenses`. Jeśli udostępniasz `.exe` innym, dołącz też link do kodu źródłowego.
PhoneMirror nie jest produktem Apple. AirPlay i iPhone to znaki towarowe Apple Inc.
