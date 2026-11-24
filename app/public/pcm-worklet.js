// Odtwarzacz PCM z buforem ~80 ms. Pilnuje, żeby dźwięk nie „uciekał” od obrazu:
// gdy w buforze zbierze się za dużo, nadmiar jest pomijany.
class PCMPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = sampleRate * 2;
    this.L = new Float32Array(this.size); this.R = new Float32Array(this.size);
    this.w = 0; this.r = 0; this.count = 0; this.started = false;
    this.target = Math.round(sampleRate * 0.08);
    this.max = Math.round(sampleRate * 0.25);
    this.port.onmessage = e => {
      const d = e.data;
      if (d === 'flush') { this.count = 0; this.r = this.w; this.started = false; return; }
      const n = d.length >> 1;
      for (let i = 0; i < n; i++) {
        this.L[this.w] = d[2 * i]; this.R[this.w] = d[2 * i + 1];
        this.w = (this.w + 1) % this.size;
      }
      this.count = Math.min(this.count + n, this.size);
      if (this.count > this.max) {               // za duże opóźnienie → dogoń na żywo
        const drop = this.count - this.target;
        this.r = (this.r + drop) % this.size; this.count -= drop;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    if (!this.started) {
      if (this.count >= this.target) this.started = true;
      else { L.fill(0); R.fill(0); return true; }
    }
    for (let i = 0; i < n; i++) {
      if (this.count > 0) {
        L[i] = this.L[this.r]; R[i] = this.R[this.r];
        this.r = (this.r + 1) % this.size; this.count--;
      } else { L[i] = 0; R[i] = 0; this.started = false; }
    }
    return true;
  }
}
registerProcessor('pcm', PCMPlayer);
