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
  /** Whether the backend marked this card focused (top-ranked). Demoted cards sink to the bottom. */
  focused?: boolean;
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

/** The order kinds stack down the page. Callouts read as a KPI strip up top; text/notes sink. */
const KIND_ORDER: CardKind[] = [
  "callout",
  "trend",
  "comparison",
  "table",
  "other",
  "text",
];

/**
 * How many of a kind sit across one 24-col row. Callouts pack tight (a KPI strip); trends go one-up;
 * comparisons/tables two-up. This fixes the "lonely centered callout" — callouts are packed WITH each
 * other, never interleaved with a tall trend that leaves a hole beside them.
 */
function perRow(kind: CardKind): number {
  switch (kind) {
    case "callout":
      return 4;
    case "trend":
      return 1;
    case "comparison":
    case "table":
    case "other":
      return 2;
    case "text":
      return 1;
  }
}

/** How far demoted cards shrink vertically, and how many extra columns they pack across. */
const DEMOTE_HEIGHT_SCALE = 0.6;
const DEMOTE_MIN_HEIGHT = 3;

/**
 * Pack a set of cards into uniform-height BANDS by kind, starting at row `startY`. Within a band every
 * card is the same height and the row is split evenly, so a shelf never mixes a short card next to a tall
 * one (the source of the vertical holes). When `demoted`, cards are shrunk and packed more across so the
 * whole zone reads as secondary. Returns the placements and the next free row.
 */
function packBands(
  cards: FocusCardInput[],
  startY: number,
  demoted: boolean,
): { placed: PlacedCard[]; nextY: number } {
  const byKind = new Map<CardKind, FocusCardInput[]>();
  for (const card of cards) {
    const list = byKind.get(card.kind) ?? [];
    list.push(card);
    byKind.set(card.kind, list);
  }

  const placed: PlacedCard[] = [];
  let y = startY;

  for (const kind of KIND_ORDER) {
    const band = byKind.get(kind);
    if (!band || band.length === 0) {
      continue;
    }
    // Most relevant first within the band.
    band.sort((a, b) => b.score - a.score);

    // Demoted cards pack one extra across (min 2) so the secondary zone stays compact.
    const cols = demoted ? Math.max(2, perRow(kind)) : perRow(kind);
    const w = Math.floor(GRID_COLS / cols);

    for (let i = 0; i < band.length; i += cols) {
      const rowCards = band.slice(i, i + cols);
      // Uniform row height = the tallest card's emphasized height, so the shelf is flush.
      let rowH = Math.max(...rowCards.map((c) => emphasizedSize(c).h));
      if (demoted) {
        rowH = Math.max(
          DEMOTE_MIN_HEIGHT,
          Math.round(rowH * DEMOTE_HEIGHT_SCALE),
        );
      }
      rowCards.forEach((card, col) => {
        const cardW = kind === "text" ? GRID_COLS : w;
        placed.push({ id: card.id, x: col * w, y, w: cardW, h: rowH });
      });
      y += rowH;
    }
  }

  return { placed, nextY: y };
}

/**
 * Pack cards into the 24-col grid in two zones: focused cards up top at full size, demoted (not-relevant)
 * cards booted to the bottom and shrunk. Each zone packs in uniform-height kind bands (see packBands), so
 * the split stays visible even when relevance scores cluster tightly — the thing that made a weak-fit
 * question leave dimmed cards sitting as equals beside the focused one.
 */
export function packLayout(cards: FocusCardInput[]): PlacedCard[] {
  const focused = cards.filter((c) => c.focused !== false);
  const demoted = cards.filter((c) => c.focused === false);

  const top = packBands(focused, 0, false);
  const bottom = packBands(demoted, top.nextY, true);
  return [...top.placed, ...bottom.placed];
}
