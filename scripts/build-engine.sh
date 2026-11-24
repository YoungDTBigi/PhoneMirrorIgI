#!/usr/bin/env bash
# Buduje silnik AirPlay (UxPlay) razem z potrzebnym GStreamerem do folderu engine/.
# Uruchamiaj w MSYS2 UCRT64 (robi to za Ciebie build-windows.ps1 i GitHub Actions).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; OUT="$ROOT/engine"; WORK="$ROOT/.engine-build"
P=mingw-w64-ucrt-x86_64
[ "${MSYSTEM:-}" = "UCRT64" ] || { echo "Uruchom w powłoce MSYS2 UCRT64"; exit 1; }

echo "==> Instaluję narzędzia i GStreamer (pacman)"
pacman -S --needed --noconfirm git $P-gcc $P-cmake $P-ninja $P-pkgconf $P-libplist $P-openssl \
  $P-gstreamer $P-gst-plugins-base $P-gst-plugins-good $P-gst-plugins-bad $P-gst-libav

echo "==> Pobieram UxPlay (${UXPLAY_REF:-master})"
mkdir -p "$WORK"
if [ -d "$WORK/UxPlay/.git" ]; then git -C "$WORK/UxPlay" fetch --depth 1 origin "${UXPLAY_REF:-master}" && git -C "$WORK/UxPlay" checkout -q FETCH_HEAD
else git clone --depth 1 --branch "${UXPLAY_REF:-master}" https://github.com/FDH2/UxPlay.git "$WORK/UxPlay"; fi

echo "==> Kompiluję"
cmake -S "$WORK/UxPlay" -B "$WORK/build" -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build "$WORK/build"
HELP="$("$WORK/build/uxplay.exe" -h 2>&1 || true)"
grep -q -- "-vrtp" <<<"$HELP" || { echo "Ta wersja UxPlay nie ma opcji -vrtp — ustaw nowszą: UXPLAY_REF=master"; exit 1; }
grep -q -- "-artp" <<<"$HELP" || { echo "Ta wersja UxPlay nie ma opcji -artp (dźwięk przez aplikację, potrzebna 1.73+)"; exit 1; }

echo "==> Pakuję do $OUT"
rm -rf "$OUT"; mkdir -p "$OUT/bin" "$OUT/lib/gstreamer-1.0" "$OUT/libexec/gstreamer-1.0" "$OUT/licenses"
cp "$WORK/build/uxplay.exe" "$OUT/bin/"
cp /ucrt64/libexec/gstreamer-1.0/gst-plugin-scanner.exe "$OUT/libexec/gstreamer-1.0/"

# Wtyczki GStreamera. LEAN=1 = tylko potrzebne (mniejszy instalator), domyślnie wszystkie (najpewniej).
if [ "${LEAN:-0}" = "1" ]; then
  for n in coreelements app typefindfunctions playback videoparsersbad audioparsers libav videoconvertscale videoconvert \
           videoscale videofilter autodetect rtp rtpmanager udp audioconvert audioresample volume wasapi wasapi2 \
           directsound d3d11 isomp4 jpeg opengl; do
    cp /ucrt64/lib/gstreamer-1.0/libgst$n.dll "$OUT/lib/gstreamer-1.0/" 2>/dev/null || true
  done
else
  cp /ucrt64/lib/gstreamer-1.0/*.dll "$OUT/lib/gstreamer-1.0/"
fi

# Wszystkie zależne biblioteki DLL z /ucrt64
ldd "$OUT/bin/uxplay.exe" "$OUT"/lib/gstreamer-1.0/*.dll "$OUT"/libexec/gstreamer-1.0/*.exe 2>/dev/null \
  | awk '$3 ~ /^\/ucrt64\// {print $3}' | sort -u | while read -r dll; do cp -n "$dll" "$OUT/bin/"; done

cp "$WORK/UxPlay/LICENSE" "$OUT/licenses/UxPlay-LICENSE.txt" 2>/dev/null || true
echo "UxPlay source: https://github.com/FDH2/UxPlay (commit $(git -C "$WORK/UxPlay" rev-parse --short HEAD))" > "$OUT/licenses/UxPlay-SOURCE.txt"

echo "==> Test: silnik startuje?"
( cd "$OUT/bin" && GST_PLUGIN_SYSTEM_PATH_1_0="$OUT/lib/gstreamer-1.0" ./uxplay.exe -h >/dev/null 2>&1 ) && echo "OK"
du -sh "$OUT"
echo "Gotowe: $OUT"
