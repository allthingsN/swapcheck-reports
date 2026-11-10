/**
 * Deterministic hero image: a minimal PNG encoder and a 5x7 bitmap font, no dependencies.
 * The same input always gives the same bytes, so heroes can be reviewed as diffs and
 * signed inside a bundle.
 *   node tools/hero.ts <bundle-dir>    writes <bundle-dir>/hero.png from report.json and meta.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

export const WIDTH = 1200;
export const HEIGHT = 630;

type Rgb = [number, number, number];

const GLYPHS: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110", D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
  "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11111 00010 00100 00010 00001 10001 01110",
  "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
  "-": "00000 00000 00000 11111 00000 00000 00000", ".": "00000 00000 00000 00000 00000 01100 01100",
  ":": "00000 01100 01100 00000 01100 01100 00000", "/": "00001 00010 00010 00100 01000 01000 10000",
  ">": "01000 00100 00010 00001 00010 00100 01000", "%": "11001 11010 00010 00100 01000 01011 10011",
  $: "00100 01111 10100 01110 00101 11110 00100", "(": "00010 00100 01000 01000 01000 00100 00010",
  ")": "01000 00100 00010 00010 00010 00100 01000", ",": "00000 00000 00000 00000 01100 00100 01000",
  _: "00000 00000 00000 00000 00000 00000 11111", "@": "01110 10001 10111 10101 10111 10000 01110",
  "+": "00000 00100 00100 11111 00100 00100 00000", "=": "00000 00000 11111 00000 11111 00000 00000",
  "·": "00000 00000 00000 00100 00000 00000 00000", " ": "00000 00000 00000 00000 00000 00000 00000",
  "?": "01110 10001 00001 00010 00100 00000 00100",
};

const COLORS = {
  background: [15, 23, 42] as Rgb,
  panel: [30, 41, 59] as Rgb,
  accent: [56, 189, 248] as Rgb,
  text: [241, 245, 249] as Rgb,
  muted: [148, 163, 184] as Rgb,
  good: [134, 239, 172] as Rgb,
  warn: [253, 186, 116] as Rgb,
};

export interface HeroSpec {
  kicker: string;
  title: string;
  subtitle?: string;
  detail?: string;
  footer?: string;
  tone?: "good" | "warn";
  bars?: Array<{ label: string; value: number }>;
}

class Canvas {
  readonly pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  fill(x: number, y: number, w: number, h: number, c: Rgb): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(WIDTH, Math.floor(x + w));
    const y1 = Math.min(HEIGHT, Math.floor(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * WIDTH + xx) * 3;
        this.pixels[i] = c[0];
        this.pixels[i + 1] = c[1];
        this.pixels[i + 2] = c[2];
      }
    }
  }
  /** Draws text at the largest scale up to `maxScale` that fits `maxWidth`. Returns the height used. */
  text(raw: string, x: number, y: number, maxScale: number, c: Rgb, maxWidth = WIDTH - 2 * x): number {
    const s = raw.toUpperCase();
    const scale = Math.max(2, Math.min(maxScale, Math.floor(maxWidth / Math.max(1, s.length * 6))));
    let cx = x;
    for (const ch of s) {
      const rows = (GLYPHS[ch] ?? GLYPHS["?"]).split(" ");
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) if (row[rx] === "1") this.fill(cx + rx * scale, y + ry * scale, scale, scale, c);
      });
      cx += 6 * scale;
    }
    return 7 * scale;
  }
}

export function renderHero(spec: HeroSpec): Buffer {
  const canvas = new Canvas();
  canvas.fill(0, 0, WIDTH, HEIGHT, COLORS.background);
  canvas.fill(0, 0, 16, HEIGHT, COLORS.accent);
  canvas.fill(64, 64, WIDTH - 128, HEIGHT - 128, COLORS.panel);
  const left = 104;
  let y = 104;
  y += canvas.text(spec.kicker, left, y, 4, COLORS.accent) + 40;
  y += canvas.text(spec.title, left, y, 9, COLORS.text, WIDTH - 2 * left) + 28;
  if (spec.subtitle) y += canvas.text(spec.subtitle, left, y, 7, spec.tone === "warn" ? COLORS.warn : COLORS.good, WIDTH - 2 * left) + 32;
  if (spec.detail) y += canvas.text(spec.detail, left, y, 5, COLORS.text, WIDTH - 2 * left) + 24;
  if (spec.bars?.length) {
    const barTop = y + 8;
    spec.bars.slice(0, 3).forEach((bar, i) => {
      const by = barTop + i * 44;
      canvas.text(bar.label, left, by + 6, 3, COLORS.muted, 260);
      canvas.fill(left + 280, by, 640, 28, COLORS.background);
      canvas.fill(left + 280, by, Math.round(640 * Math.max(0, Math.min(1, bar.value))), 28, COLORS.accent);
    });
  }
  if (spec.footer) canvas.text(spec.footer, left, HEIGHT - 64 - 56, 3, COLORS.muted);
  return encodePng(canvas.pixels, WIDTH, HEIGHT);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 8-bit RGB, no interlace, filter type 0 on every row. */
export function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

interface NoticeReport {
  schema: string;
  event?: { type: string; model: string; to?: string; effective?: string; date_precision?: string; route: string; confidence: string };
  candidates?: Array<{ model: string; suite_pass_rate: { baseline: number; candidate: number } }>;
  baseline_model?: string;
}

/** Builds the hero from report data only, so the image can never state something the report does not. */
export function heroSpecFromReport(report: NoticeReport, meta: { type: string }): HeroSpec {
  if (report.event) {
    const e = report.event;
    const verb: Record<string, string> = { reroute: "REROUTES", retirement: "RETIRES", alias_move: "ALIAS MOVES", price_change: "PRICE CHANGES", parameter_change: "PARAMETERS CHANGE" };
    const when = e.effective ? `${e.date_precision === "earliest_possible" ? "NO EARLIER THAN" : "ON"} ${e.effective}` : "DATE NOT ANNOUNCED";
    return {
      kicker: `SWAPCHECK · ${meta.type === "notice" ? "CHANGE NOTICE" : meta.type}`,
      title: e.model,
      subtitle: e.to ? `> ${e.to}` : undefined,
      tone: e.type === "retirement" ? "warn" : "good",
      detail: `${verb[e.type] ?? e.type} ${when}`,
      footer: `${e.route} · confidence ${e.confidence} · from registry data`,
    };
  }
  const bars = (report.candidates ?? []).slice(0, 2).flatMap((c, i) => [
    ...(i === 0 ? [{ label: "baseline", value: c.suite_pass_rate.baseline }] : []),
    { label: c.model.slice(0, 18), value: c.suite_pass_rate.candidate },
  ]);
  return { kicker: `SWAPCHECK · ${meta.type}`, title: report.baseline_model ?? "report", bars, footer: "pass rate on our open suite" };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write("Usage: node tools/hero.ts <bundle-dir>\n");
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  writeFileSync(join(dir, "hero.png"), renderHero(heroSpecFromReport(report, meta)));
}
