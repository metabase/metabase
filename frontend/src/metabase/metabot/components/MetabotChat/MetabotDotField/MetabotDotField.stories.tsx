import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { METABOT_LOGO_MASK, MetabotLoader } from "../MetabotLoader";

import { MetabotDotField, type MetabotDotFieldHandle } from "./MetabotDotField";
import { MetabotRevealBlock } from "./MetabotRevealBlock";
import { clamp01, easeOutBack, smoothstep } from "./dot-field";
import {
  REVEAL_TIMELINES,
  type RevealContentKind,
  computeRevealFrame,
} from "./reveal-timeline";

// ---------------------------------------------------------------------------
// A self-contained harness that reproduces the validated standalone prototype
// using the REAL MetabotDotField + MetabotLoader, so we can confirm the port
// renders identically (frame-by-frame) in the app's React/CSS environment.
//
// The chart here is a synthetic SVG line — a stand-in for the story only; the
// real app uses the live ECharts chart's native entrance animation.
// ---------------------------------------------------------------------------

const IDLE_Y = 20;
const RESERVE_H: Record<RevealContentKind, number> = { chart: 360, text: 90 };

// deterministic rising-then-dipping monthly series (matches the mock)
const N = 46;
const SERIES_MAX = 600;
const series = (() => {
  let seed = 99;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const pts: number[] = [];
  for (let i = 0; i < N; i++) {
    const tnorm = i / (N - 1);
    const base = 560 / (1 + Math.exp(-9 * (tnorm - 0.4)));
    let v = base + (rnd() - 0.5) * 70 * (0.4 + tnorm);
    if (i >= N - 2) {
      v = 540 + ((340 - 540) * (i - (N - 3))) / 2;
    }
    pts.push(Math.max(2, v));
  }
  return pts;
})();

const VB_W = 880;
const VB_H = 260;
const M_L = 64;
const M_R = 24;
const M_T = 14;
const M_B = 40;
const plotW = VB_W - M_L - M_R;
const plotH = VB_H - M_T - M_B;
const xAt = (i: number) => M_L + (plotW * i) / (N - 1);
const yAt = (val: number) => M_T + plotH * (1 - val / SERIES_MAX);
const linePathD = series
  .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
  .join(" ");

type Driver = {
  seek: (t: number) => void;
  start: () => void;
  pause: () => void;
  setChart: (k: RevealContentKind) => void;
  setKeepGenerating: (v: boolean) => void;
  readonly duration: number;
  readonly time: number;
};

const Harness = () => {
  const dotField = useRef<MetabotDotFieldHandle>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<SVGGElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const markersRef = useRef<SVGGElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  const [chartType, setChartType] = useState<RevealContentKind>("chart");
  const chartTypeRef = useRef(chartType);
  chartTypeRef.current = chartType;
  const keepGenRef = useRef(true);

  const clockRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number>();
  const lastTsRef = useRef<number | null>(null);
  const [hud, setHud] = useState({ t: 0, phase: "idle" });

  const lineLenRef = useRef(0);
  useEffect(() => {
    lineLenRef.current = lineRef.current?.getTotalLength() ?? 0;
  }, []);

  const render = useCallback((t: number) => {
    const kind = chartTypeRef.current;
    const tl = REVEAL_TIMELINES[kind];
    const tc = Math.min(t, tl.duration);
    const f = computeRevealFrame(tc, tl);
    const reservedH = RESERVE_H[kind];
    const thinkingY = IDLE_Y + f.reserveProgress * reservedH;

    const keepGen = keepGenRef.current;
    const thinkingFade = keepGen ? 0 : f.fadeProgress;

    dotField.current?.renderFrame({
      thinkingY,
      fadeProgress: f.fadeProgress,
      thinkingFade,
    });

    if (thinkingRef.current) {
      thinkingRef.current.style.transform = `translateY(${thinkingY}px)`;
      thinkingRef.current.style.opacity = `${1 - thinkingFade}`;
    }
    if (pillRef.current) {
      const dots = Math.floor((t / 380) % 4);
      pillRef.current.textContent =
        "Thinking" + ".".repeat(dots) + " ".repeat(3 - dots);
    }

    const hasChart = kind === "chart";
    if (contentRef.current) {
      contentRef.current.style.opacity = f.contentVisible ? "1" : "0";
    }
    if (introRef.current) {
      introRef.current.style.opacity = `${f.revealProgress}`;
    }
    if (titleRef.current) {
      titleRef.current.style.opacity = `${f.revealProgress}`;
      titleRef.current.style.display = hasChart ? "" : "none";
    }
    if (chromeRef.current) {
      chromeRef.current.style.opacity = `${f.revealProgress}`;
    }
    if (lineRef.current && markersRef.current) {
      const show = hasChart ? "" : "none";
      lineRef.current.style.display = show;
      markersRef.current.style.display = show;
      if (hasChart) {
        lineRef.current.style.strokeDashoffset = `${
          lineLenRef.current * (1 - f.drawProgress)
        }`;
        const children = markersRef.current.children;
        for (let i = 0; i < N; i++) {
          const fi = i / (N - 1);
          const appear = clamp01((f.drawProgress - fi + 0.02) / 0.06);
          const c = children[i] as SVGCircleElement | undefined;
          if (!c) {
            continue;
          }
          c.style.opacity = `${smoothstep(appear)}`;
          const sc = 0.1 + 0.9 * easeOutBack(appear);
          c.setAttribute(
            "transform",
            `translate(${xAt(i)} ${yAt(series[i])}) scale(${sc}) translate(${-xAt(i)} ${-yAt(series[i])})`,
          );
        }
      }
    }

    let phase = "idle";
    if (tc >= tl.reserve[0] && tc < tl.reserve[1]) {
      phase = "reserve";
    }
    if (hasChart && tc >= tl.draw[0] && tc < tl.draw[1]) {
      phase = "draw";
    }
    if (tc >= tl.dotsFade[0] && tc < tl.dotsFade[1]) {
      phase = "dots out";
    }
    if (tc >= tl.reveal[0] && tc < tl.reveal[1]) {
      phase = "text in";
    }
    if (tc >= tl.dotsFade[1]) {
      phase = "done";
    }
    setHud({ t: Math.round(t), phase });
  }, []);

  const frame = useCallback(
    (ts: number) => {
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      clockRef.current += ts - lastTsRef.current;
      lastTsRef.current = ts;
      const tl = REVEAL_TIMELINES[chartTypeRef.current];
      if (clockRef.current >= tl.duration && !keepGenRef.current) {
        clockRef.current = tl.duration;
        render(clockRef.current);
        playingRef.current = false;
        return;
      }
      render(clockRef.current);
      rafRef.current = requestAnimationFrame(frame);
    },
    [render],
  );

  const driver = useMemo<Driver>(() => {
    const halt = () => {
      playingRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = undefined;
      lastTsRef.current = null;
    };
    return {
      seek: (t: number) => {
        halt();
        clockRef.current = Math.max(
          0,
          Math.min(t, REVEAL_TIMELINES[chartTypeRef.current].duration),
        );
        render(clockRef.current);
      },
      start: () => {
        if (playingRef.current) {
          return;
        }
        if (
          clockRef.current >= REVEAL_TIMELINES[chartTypeRef.current].duration
        ) {
          clockRef.current = 0;
        }
        playingRef.current = true;
        lastTsRef.current = null;
        rafRef.current = requestAnimationFrame(frame);
      },
      pause: halt,
      setChart: (k: RevealContentKind) => {
        halt();
        chartTypeRef.current = k;
        setChartType(k);
        clockRef.current = 0;
        render(0);
      },
      setKeepGenerating: (v: boolean) => {
        keepGenRef.current = v;
      },
      get duration() {
        return REVEAL_TIMELINES[chartTypeRef.current].duration;
      },
      get time() {
        return clockRef.current;
      },
    };
  }, [frame, render]);

  // expose for frame-by-frame screenshot testing
  useEffect(() => {
    (window as unknown as { __sbAnim: Driver }).__sbAnim = driver;
    render(0);
  }, [driver, render]);

  return (
    <div
      style={{
        background: "#e9edf1",
        padding: 24,
        minHeight: "100vh",
        fontFamily: "var(--mb-default-font-family, sans-serif)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <button onClick={() => driver.start()}>▶ Play</button>
        <button
          onClick={() => {
            driver.seek(0);
            driver.start();
          }}
        >
          ↺ Restart
        </button>
        <input
          type="range"
          min={0}
          max={driver.duration}
          value={hud.t}
          onChange={(e) => driver.seek(Number(e.target.value))}
          style={{ width: 280 }}
        />
        <span style={{ fontFamily: "monospace", minWidth: 70 }}>
          {hud.t} ms
        </span>
        <span
          style={{ fontFamily: "monospace", color: "var(--mb-color-brand)" }}
        >
          {hud.phase}
        </span>
        {(["chart", "text"] as const).map((k) => (
          <label key={k}>
            <input
              type="radio"
              name="kind"
              checked={chartType === k}
              onChange={() => driver.setChart(k)}
            />
            {k}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            defaultChecked
            onChange={(e) => driver.setKeepGenerating(e.target.checked)}
          />
          keep generating
        </label>
      </div>

      <div
        style={{
          position: "relative",
          width: "min(100%, 1040px)",
          height: 720,
          background: "var(--mb-color-background-secondary)",
          border: "1px solid var(--mb-color-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--mb-color-text-primary)",
          }}
        >
          Inquiry About Order Status
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 32px",
          }}
        >
          <div
            style={{
              background: "var(--mb-color-background-secondary)",
              border: "1px solid var(--mb-color-border)",
              fontSize: 14,
              padding: "9px 16px",
              borderRadius: 16,
              color: "var(--mb-color-text-primary)",
            }}
          >
            any info on orders?
          </div>
        </div>

        <div style={{ position: "relative", width: "100%", minHeight: 560 }}>
          <MetabotDotField ref={dotField} />

          <div
            ref={contentRef}
            style={{
              position: "absolute",
              top: 0,
              left: 32,
              right: 24,
              maxWidth: 880,
              zIndex: 1,
            }}
          >
            <div
              ref={introRef}
              style={{
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--mb-color-text-primary)",
              }}
            >
              <p style={{ margin: "0 0 8px" }}>
                I&apos;ll take a look at the Orders + People model that you
                recently viewed to give you a quick overview.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                Let me show you orders over time as a quick overview.
              </p>
            </div>
            <div
              ref={titleRef}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--mb-color-text-primary)",
                margin: "0 0 2px 6px",
              }}
            >
              Orders per month
            </div>
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              style={{
                display: "block",
                width: "100%",
                height: 260,
                overflow: "visible",
              }}
            >
              <g ref={chromeRef}>
                {Array.from({ length: 7 }).map((_, g) => {
                  const val = (SERIES_MAX / 6) * g;
                  const y = yAt(val);
                  return (
                    <g key={g}>
                      <line
                        x1={M_L}
                        y1={y}
                        x2={VB_W - M_R}
                        y2={y}
                        stroke="var(--mb-color-border)"
                        strokeDasharray="2 4"
                        opacity={0.7}
                      />
                      <text
                        x={M_L - 10}
                        y={y + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill="var(--mb-color-text-secondary)"
                      >
                        {Math.round(val)}
                      </text>
                    </g>
                  );
                })}
                <line
                  x1={M_L}
                  y1={yAt(0)}
                  x2={VB_W - M_R}
                  y2={yAt(0)}
                  stroke="var(--mb-color-border)"
                />
                {[
                  ["January 2026", 2],
                  ["January 2027", 14],
                  ["January 2028", 26],
                  ["January 2029", 38],
                ].map(([label, i]) => (
                  <text
                    key={label as string}
                    x={xAt(i as number)}
                    y={VB_H - 22}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--mb-color-text-secondary)"
                  >
                    {label}
                  </text>
                ))}
                <text
                  x={M_L + plotW / 2}
                  y={VB_H - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--mb-color-text-secondary)"
                >
                  Created At: Month
                </text>
              </g>
              <path
                ref={lineRef}
                d={linePathD}
                fill="none"
                stroke="var(--mb-color-brand)"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={lineLenRef.current || 2000}
              />
              <g ref={markersRef}>
                {series.map((v, i) => (
                  <circle
                    key={i}
                    cx={xAt(i)}
                    cy={yAt(v)}
                    r={2.6}
                    fill="var(--mb-color-background-secondary)"
                    stroke="var(--mb-color-brand)"
                    strokeWidth={1.4}
                  />
                ))}
              </g>
            </svg>
          </div>

          <div
            ref={thinkingRef}
            style={{
              position: "absolute",
              top: 0,
              left: 32,
              display: "flex",
              alignItems: "center",
              gap: 14,
              zIndex: 2,
            }}
          >
            <MetabotLoader mask={METABOT_LOGO_MASK} />
            <div
              ref={pillRef}
              style={{
                fontFamily:
                  "var(--mb-default-monospace-font-family, monospace)",
                fontSize: 13,
                color: "var(--mb-color-text-primary)",
                background: "var(--mb-color-background-secondary)",
                padding: "3px 10px",
                borderRadius: 6,
                whiteSpace: "pre",
              }}
            >
              Thinking
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const meta = {
  title: "Metabot/MetabotDotField",
  component: Harness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Harness>;

export default meta;

export const Choreography: StoryObj<typeof Harness> = {};

// ---------------------------------------------------------------------------
// Mount-driven reveal: exercises the real MetabotRevealBlock exactly as the app
// will (each block reserves its space, then crossfades content in / dots out on
// mount). Replay remounts the blocks. `ready` is toggled to show the reserved
// (dots-only) hold for a chart whose query hasn't resolved yet.
// ---------------------------------------------------------------------------
const RevealBlocksDemo = () => {
  const [runKey, setRunKey] = useState(0);
  const [ready, setReady] = useState(true);
  // simulate the real inter-message gap (actions area + margin) between blocks
  const gap = <div style={{ height: 32 }} />;

  return (
    <div style={{ background: "#e9edf1", padding: 24, minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 13 }}>
        <button onClick={() => setRunKey((k) => k + 1)}>↺ Replay</button>
        <label>
          <input
            type="checkbox"
            checked={ready}
            onChange={(e) => setReady(e.target.checked)}
          />
          ready (uncheck to hold the reserved dots and inspect seams)
        </label>
      </div>
      <div
        style={{
          width: "min(100%, 1040px)",
          background: "var(--mb-color-background-secondary)",
          border: "1px solid var(--mb-color-border)",
          borderRadius: 12,
          padding: "16px 0",
          // container query context so the dot fields can break out full-width
          containerType: "inline-size",
          ["--metabot-thinking-field-bleed" as string]: "12px",
        }}
      >
        <div
          key={runKey}
          style={{ maxWidth: 860, margin: "0 auto", padding: "0 32px" }}
        >
          <MetabotRevealBlock kind="text" ready={ready}>
            <p
              style={{ fontSize: 13.5, color: "var(--mb-color-text-primary)" }}
            >
              I&apos;ll take a look at the Orders + People model that you
              recently viewed to give you a quick overview.
            </p>
          </MetabotRevealBlock>
          {gap}
          <MetabotRevealBlock kind="text" ready={ready}>
            <p
              style={{ fontSize: 13.5, color: "var(--mb-color-text-primary)" }}
            >
              Let me show you orders over time as a quick overview.
            </p>
          </MetabotRevealBlock>
          {gap}
          <MetabotRevealBlock kind="chart" ready={ready}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--mb-color-text-primary)",
                marginBottom: 6,
              }}
            >
              Orders per month
            </div>
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              style={{ display: "block", width: "100%", height: 240 }}
            >
              <path
                d={linePathD}
                fill="none"
                stroke="var(--mb-color-brand)"
                strokeWidth={1.6}
              />
            </svg>
          </MetabotRevealBlock>
        </div>
      </div>
    </div>
  );
};

export const RevealBlocks: StoryObj<typeof Harness> = {
  render: () => <RevealBlocksDemo />,
};
