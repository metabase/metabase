import { useEffect, useMemo, useRef, useState } from "react";
import { c, t } from "ttag";

import { Box } from "metabase/ui";

import S from "./DefragLoader.module.css";

/**
 * 90s-defrag-style loader. Renders a grid of "disk clusters" that
 * compact themselves leftward over time, the way Windows 9x Disk
 * Defragmenter visualised cluster movement:
 *
 *   white   = empty cluster
 *   blue    = used data
 *   yellow  = system file (immovable)
 *   red     = unmoveable
 *   green   = currently moving
 *
 * The animation loops: compact → small pause → re-fragment → compact.
 * Used as the "Analyzing…" indicator while the optimizer stream runs.
 */

type Cell = "free" | "data" | "system" | "unmoveable" | "moving";

const COLS = 28;
const ROWS = 8;
const TOTAL = COLS * ROWS;
const TICK_MS = 70;
const PAUSE_TICKS = 18;

type Phase = "compacting" | "paused";

type GridState = {
  grid: Cell[];
  phase: Phase;
  pauseLeft: number;
  moves: number;
  passes: number;
};

const CELL_CLASS: Record<Cell, string> = {
  free: S.free,
  data: S.data,
  system: S.system,
  unmoveable: S.unmoveable,
  moving: S.moving,
};

export function DefragLoader() {
  const [state, setState] = useState<GridState>(() => initState());
  // Stable cell array so React doesn't reconcile the whole grid every tick.
  const cellsArr = useMemo(
    () => Array.from({ length: TOTAL }, (_, i) => i),
    [],
  );
  const tickRef = useRef<number>(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      tickRef.current += 1;
      setState(advance);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const headIdx = Math.max(
    0,
    state.grid.findIndex((cell) => cell === "free"),
  );
  const compacted = headIdx < 0 ? TOTAL : headIdx;
  const percent = Math.min(99, Math.round((compacted / TOTAL) * 100));

  return (
    <Box className={S.window} role="img">
      <div className={S.titleBar}>
        <div className={S.titleIcon} aria-hidden>
          <span className={S.titleIconInner}>T</span>
        </div>
        <div
          className={S.titleText}
        >{t`Transform Optimizer — analyzing opportunities...`}</div>
      </div>

      <div className={S.body}>
        <div className={S.gridFrame}>
          <div
            className={S.grid}
            style={{
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            }}
          >
            {cellsArr.map((i) => (
              <span
                key={i}
                className={`${S.cell} ${CELL_CLASS[state.grid[i] ?? "free"]}`}
              />
            ))}
          </div>
        </div>

        <div className={S.legend} aria-hidden>
          <LegendSwatch swatchClass={S.data} label={t`Rewrite`} />
          <LegendSwatch swatchClass={S.system} label={t`Index`} />
          <LegendSwatch swatchClass={S.unmoveable} label={t`Risk`} />
          <LegendSwatch swatchClass={S.moving} label={t`Precompute`} />
        </div>

        <div className={S.statusBar}>
          <span className={S.statusText}>
            {c("Disk-defrag-style status line")
              .t`Cluster ${pad(compacted, 4)} / ${pad(TOTAL, 4)}`}
          </span>
          <span className={S.statusText}>
            {c("Disk-defrag-style status line — moves performed")
              .t`${pad(state.moves, 4)} moves`}
          </span>
          <span className={S.statusTextRight}>{`${pad(percent, 2)}%`}</span>
        </div>
      </div>
    </Box>
  );
}

function LegendSwatch({
  swatchClass,
  label,
}: {
  swatchClass: string;
  label: string;
}) {
  return (
    <span className={S.legendItem}>
      <span className={`${S.legendSwatch} ${swatchClass}`} />
      <span className={S.legendLabel}>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// State machine

function initState(): GridState {
  return {
    grid: makeFragmentedGrid(),
    phase: "compacting",
    pauseLeft: 0,
    moves: 0,
    passes: 0,
  };
}

function advance(prev: GridState): GridState {
  if (prev.phase === "paused") {
    const left = prev.pauseLeft - 1;
    if (left <= 0) {
      return {
        grid: makeFragmentedGrid(),
        phase: "compacting",
        pauseLeft: 0,
        moves: 0,
        passes: prev.passes + 1,
      };
    }
    return { ...prev, pauseLeft: left };
  }

  // Phase: compacting. If a "moving" cell exists, swap it with the earliest
  // free cell. Otherwise pick the next out-of-place data cell to flag as
  // moving.
  const movingIdx = prev.grid.indexOf("moving");
  if (movingIdx >= 0) {
    const freeIdx = prev.grid.indexOf("free");
    if (freeIdx >= 0 && freeIdx < movingIdx) {
      const next = prev.grid.slice();
      next[freeIdx] = "data";
      next[movingIdx] = "free";
      return { ...prev, grid: next, moves: prev.moves + 1 };
    }
    // Defensive: turn the orphan move back into data.
    const next = prev.grid.slice();
    next[movingIdx] = "data";
    return { ...prev, grid: next };
  }

  const freeIdx = prev.grid.indexOf("free");
  if (freeIdx < 0) {
    return { ...prev, phase: "paused", pauseLeft: PAUSE_TICKS };
  }
  for (let i = freeIdx + 1; i < prev.grid.length; i++) {
    if (prev.grid[i] === "data") {
      const next = prev.grid.slice();
      next[i] = "moving";
      return { ...prev, grid: next };
    }
  }
  // No reachable data cell after the head → compaction complete.
  return { ...prev, phase: "paused", pauseLeft: PAUSE_TICKS };
}

function makeFragmentedGrid(): Cell[] {
  const out: Cell[] = new Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) {
    const r = Math.random();
    if (r < 0.025) {
      out[i] = "unmoveable";
    } else if (r < 0.075) {
      out[i] = "system";
    } else if (r < 0.7) {
      out[i] = "data";
    } else {
      out[i] = "free";
    }
  }
  return out;
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}
