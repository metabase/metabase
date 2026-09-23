/**
 * The layout engine for dashboard focus. Given each card's KIND (what it is) and SCORE (how relevant to
 * the question), produce a compact, packed 24-column grid layout — hero content up top at full emphasis,
 * supporting cards flowing below, low-relevance cards small at the bottom. This is pure geometry: the
 * "what each card is for" judgment happens upstream (deterministic + Jev); here we just place and size.
 *
 * Fixes the naive reflow's staircase (which kept each card's original width/column and only reordered
 * rows, leaving gaps) by actually resizing and bin-packing.
 */

const GRID_COLS = 24;

/** The intrinsic shape of a card — what it IS, independent of how relevant it is. */
export type CardKind =
  | "callout" // a single KPI number — small, punchy
  | "trend" // a time series — wide
  | "comparison" // a categorical breakdown — medium
  | "table" // row detail — height scales with rows
  | "text" // a markdown/heading note — full width, short
  | "other"; // anything else — medium default

export interface FocusCardInput {
  id: number;
  kind: CardKind;
  /** Relevance to the question, 0..1. Drives ordering and size emphasis. */
  score: number;
  /** Row count when known (drives table height). */
  rowCount?: number;
  /** The card's original size, used as a fallback / cap. */
  originalSize: { w: number; h: number };
}

export interface PlacedCard {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The base footprint for a card kind, before emphasis. Width is in grid columns (of 24), height in grid
 * rows. Tuned so a full row holds ~two mediums or one hero, and callouts pack several across.
 */
function baseSize(card: FocusCardInput): { w: number; h: number } {
  switch (card.kind) {
    case "callout":
      return { w: 6, h: 4 };
    case "trend":
      return { w: 16, h: 8 };
    case "comparison":
      return { w: 12, h: 7 };
    case "table": {
      // Height scales with row count, capped so a huge table doesn't dominate.
      const rows = card.rowCount ?? 10;
      const h = Math.max(6, Math.min(14, 4 + Math.ceil(rows / 4)));
      return { w: 12, h };
    }
    case "text":
      return { w: GRID_COLS, h: 2 };
    default:
      return { w: 12, h: 7 };
  }
}

/**
 * Emphasis multiplier from the relevance score: the most relevant cards get bigger, low-relevance ones
 * shrink. Kept gentle (0.8x–1.35x) so the layout stays coherent rather than lurching.
 */
function emphasis(score: number): number {
  return 0.8 + 0.55 * Math.max(0, Math.min(1, score));
}

/** Apply emphasis to a base size, clamped to sane grid bounds. */
function emphasizedSize(card: FocusCardInput): { w: number; h: number } {
  const base = baseSize(card);
  const factor = emphasis(card.score);
  // Text and full-width cards keep their width; others scale then clamp.
  const w =
    card.kind === "text"
      ? GRID_COLS
      : Math.max(4, Math.min(GRID_COLS, Math.round(base.w * factor)));
  const h = Math.max(2, Math.round(base.h * factor));
  return { w, h };
}

/**
 * Bin-pack sized cards into the 24-column grid, filling row by row. Cards arrive already sorted by
 * relevance (callers pass them in the order they want). Within a row we place left-to-right; when a card
 * doesn't fit the remaining width, we start a new row. A simple, gap-minimizing shelf packer — good
 * enough to look intentional and far better than the staircase.
 */
export function packLayout(cards: FocusCardInput[]): PlacedCard[] {
  const placed: PlacedCard[] = [];
  let cursorX = 0;
  let rowY = 0;
  let rowHeight = 0;

  for (const card of cards) {
    const { w, h } = emphasizedSize(card);

    // Start a new row if this card doesn't fit in the remaining width.
    if (cursorX + w > GRID_COLS) {
      rowY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }

    placed.push({ id: card.id, x: cursorX, y: rowY, w, h });
    cursorX += w;
    rowHeight = Math.max(rowHeight, h);
  }

  return placed;
}
