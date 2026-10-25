// Temporary dev tool: live font-size sliders per part of the UI. The owner tunes sizes, copies the config,
// and the chosen values get hardcoded; then this file goes away.
import { useEffect, useState } from "react";

export const REGIONS = [
  { key: "header", label: "Match header", hint: "team names, score, odds" },
  { key: "pitch", label: "Pitch", hint: "player names, formation bar, momentum" },
  { key: "dugout", label: "Benches", hint: "dugouts beside the pitch" },
  { key: "panel", label: "Club columns", hint: "coach, profile, missing, leaders, results" },
  { key: "tabs", label: "Centre tabs", hint: "preview, story, stats, table…" },
  { key: "modal", label: "Modals & popovers", hint: "player, coach, club, squad, shape" },
  { key: "list", label: "Match list", hint: "the home page" },
  { key: "tooltip", label: "Tooltips", hint: "hover explainers" },
] as const;

type Kind = "display" | "text";
type Config = { all: number } & Record<string, { display: number; text: number } | number>;

const KEY = "touchline.fontTuner";
const NAMED: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60 };

const defaults = (): Config => ({ all: 1, ...Object.fromEntries(REGIONS.map((r) => [r.key, { display: 1, text: 1 }])) }) as Config;

function load(): Config {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* private mode etc. */
  }
  return defaults();
}

/**
 * Build override rules for every font-size utility Tailwind generated, so each size scales by its region's
 * variables. Read from the live stylesheet, so new size classes are picked up without a list to maintain.
 */
function buildCss(): string {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (rules: CSSRuleList, wrap?: string) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule) {
        const m = r.selectorText.match(/^\.((?:[@\w\\[\]-]+\\:)?text-(?:\\\[([\d.]+)px\\\]|(xs|sm|base|lg|xl|[2-6]xl)))$/);
        if (!m || !r.style.fontSize) continue;
        const px = m[2] ? Number(m[2]) : NAMED[m[3]];
        if (!px || seen.has(r.selectorText + wrap)) continue;
        seen.add(r.selectorText + wrap);
        const sel = `.${m[1]}`;
        const rule =
          `[data-fs] ${sel}{font-size:calc(${px}px * var(--fs-text,1) * var(--fs-all,1)) !important}` +
          `[data-fs] .font-display${sel},[data-fs] ${sel}.font-display{font-size:calc(${px}px * var(--fs-display,1) * var(--fs-all,1)) !important}`;
        out.push(wrap ? `${wrap}{${rule}}` : rule);
      } else if (r instanceof CSSContainerRule) {
        visit(r.cssRules, `@container ${r.conditionText}`);
      } else if (r instanceof CSSMediaRule) {
        visit(r.cssRules, `@media ${r.conditionText}`);
      } else if ("cssRules" in r) {
        visit((r as CSSGroupingRule).cssRules, wrap);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* cross-origin sheet (Google Fonts) */
    }
  }
  // Each region hands its sliders to the generic variables; nested regions (benches inside the pitch) win.
  for (const { key } of REGIONS) out.push(`[data-fs="${key}"]{--fs-text:var(--fs-${key}-text,1);--fs-display:var(--fs-${key}-display,1)}`);
  return out.join("\n");
}

function apply(c: Config) {
  const root = document.documentElement.style;
  root.setProperty("--fs-all", String(c.all));
  for (const { key } of REGIONS) {
    const v = c[key] as { display: number; text: number };
    root.setProperty(`--fs-${key}-text`, String(v.text));
    root.setProperty(`--fs-${key}-display`, String(v.display));
  }
}

export function FontTuner() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<Config>(load);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Wait a tick so Tailwind's stylesheet is in the document (dev mode injects it).
    const t = setTimeout(() => {
      const el = document.getElementById("font-tuner-css") ?? Object.assign(document.createElement("style"), { id: "font-tuner-css" });
      el.textContent = buildCss();
      document.head.appendChild(el);
    }, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    apply(cfg);
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {
      /* ignore */
    }
    // Layouts that measure themselves (fit-to-height lists, the pitch) re-measure on resize.
    window.dispatchEvent(new Event("resize"));
  }, [cfg]);

  const set = (region: string, kind: Kind, v: number) => setCfg((c) => ({ ...c, [region]: { ...(c[region] as object), [kind]: v } }) as Config);
  const json = JSON.stringify(cfg, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-[80] font-ui" data-fs-tuner>
      {open && (
        <div className="pop-in mb-2 max-h-[80dvh] w-[330px] overflow-auto rounded-xl border border-rule bg-stand p-3 text-[13px] text-chalk shadow-2xl scroll-thin">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-[14px]">Font sizes</b>
            <span className="text-[11px] text-mute">saved in this browser</span>
          </div>
          <Slider label="Everything" value={cfg.all} onChange={(v) => setCfg((c) => ({ ...c, all: v }))} />
          <div className="my-2 border-t border-rule" />
          {REGIONS.map((r) => {
            const v = cfg[r.key] as { display: number; text: number };
            return (
              <div key={r.key} className="mb-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{r.label}</span>
                  <span className="truncate pl-2 text-[11px] text-mute">{r.hint}</span>
                </div>
                <Slider label="Names & numbers" value={v.display} onChange={(x) => set(r.key, "display", x)} />
                <Slider label="Text" value={v.text} onChange={(x) => set(r.key, "text", x)} />
              </div>
            );
          })}
          <div className="mt-2 flex gap-2">
            <button onClick={copy} className="flex-1 rounded-lg bg-chalk py-1.5 font-semibold text-night hover:bg-white">{copied ? "Copied" : "Copy config"}</button>
            <button onClick={() => setCfg(defaults())} className="rounded-lg px-3 py-1.5 ring-1 ring-rule hover:bg-terrace">Reset</button>
          </div>
          <textarea readOnly value={json} rows={4} className="mt-2 w-full rounded-md bg-night p-2 font-mono text-[10.5px] text-chalk/70 ring-1 ring-rule" onFocus={(e) => e.currentTarget.select()} aria-label="Config JSON" />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-auto grid size-10 place-items-center rounded-full bg-chalk font-display text-lg font-extrabold text-night shadow-xl ring-2 ring-night hover:bg-white"
        aria-label="Font size tuner"
        aria-expanded={open}
      >
        Aa
      </button>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mt-1 grid grid-cols-[104px_minmax(0,1fr)_44px] items-center gap-2 text-[12px] text-chalk/80">
      <span>{label}</span>
      <input type="range" min={0.6} max={1.8} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(1)} className="accent-[#eceeea]" />
      <span className="text-right tabular-nums">{value.toFixed(2)}×</span>
    </label>
  );
}
