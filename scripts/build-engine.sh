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

# Wtyczki GStreamera. Kopiujemy wszystkie OPRÓCZ tych, które zależą od konkretnego sprzętu/sterowników
# (NVIDIA, Intel QSV, AMD, D3D12, Vulkan, Qt/GTK…). Na części komputerów takie wtyczki potrafiły
# wywrócić silnik zaraz po starcie. UxPlay ich nie potrzebuje.
SKIP='nvcodec|nvdswrapper|cuda|d3d12|qsv|amfcodec|vulkan|qml|qt|gtk|opencv|webrtc|srt|libvisual|opengl|directshow|winscreencap|wic|dwrite|onnx|svtav1|rav1e|lv2|ladspa|openh264|x265|aom|dav1d|nice|sctp|rist|zbar|chromaprint'
for f in /ucrt64/lib/gstreamer-1.0/*.dll; do
  n=$(basename "$f")
  if [[ "$n" =~ ^libgst($SKIP) ]]; then continue; fi
  cp "$f" "$OUT/lib/gstreamer-1.0/"
done
echo "Wtyczek GStreamera: $(ls "$OUT/lib/gstreamer-1.0" | wc -l)"
# Kontrola: najważniejsze elementy muszą być
for need in coreelements app videoparsersbad rtp udp libav audioconvert audioresample; do
  [ -f "$OUT/lib/gstreamer-1.0/libgst$need.dll" ] || { echo "Brak wymaganej wtyczki: $need"; exit 1; }
done

# Wszystkie zależne biblioteki DLL z /ucrt64
ldd "$OUT/bin/uxplay.exe" "$OUT"/lib/gstreamer-1.0/*.dll "$OUT"/libexec/gstreamer-1.0/*.exe 2>/dev/null \
  | awk '$3 ~ /^\/ucrt64\// {print $3}' | sort -u | while read -r dll; do cp -n "$dll" "$OUT/bin/"; done

cp "$WORK/UxPlay/LICENSE" "$OUT/licenses/UxPlay-LICENSE.txt" 2>/dev/null || true
echo "UxPlay source: https://github.com/FDH2/UxPlay (commit $(git -C "$WORK/UxPlay" rev-parse --short HEAD))" > "$OUT/licenses/UxPlay-SOURCE.txt"

echo "==> Test: GStreamer widzi potrzebne elementy?"
export PATH="$OUT/bin:$PATH" GST_PLUGIN_SYSTEM_PATH_1_0="$OUT/lib/gstreamer-1.0" GST_PLUGIN_PATH_1_0="$OUT/lib/gstreamer-1.0" \
       GST_PLUGIN_SCANNER_1_0="$OUT/libexec/gstreamer-1.0/gst-plugin-scanner.exe" GST_REGISTRY_1_0="$WORK/test-registry.bin"
for el in appsrc h264parse rtph264pay rtpL16pay udpsink avdec_aac avdec_alac audioconvert audioresample; do
  /ucrt64/bin/gst-inspect-1.0.exe "$el" >/dev/null 2>&1 && echo "  ok  $el" || { echo "  BRAK $el"; exit 1; }
done
du -sh "$OUT"
echo "Gotowe: $OUT"
