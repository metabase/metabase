/**
 * Helpers for the dashboard-card-resizing spec port
 * (dashboard-cards/dashboard-card-resizing.cy.spec.js).
 *
 * The one non-mechanical piece is the resize drag. Upstream `H.resizeDashboardCard`
 * (e2e-dashboard-helpers.ts) drives React-Grid-Layout's `.react-resizable-handle`
 * with Cypress `.trigger("mousedown"|"mousemove"|"mouseup")` synthetic events. This
 * is NOT dnd-kit — the handle is a react-draggable `<DraggableCore>`: its
 * `onMouseDown` is a React handler on the handle node, and on drag-start it attaches
 * raw `mousemove`/`mouseup` listeners to `document`. So the faithful port dispatches
 * a real `MouseEvent` (bubbling) — `mousedown` on the handle (reaches React's
 * delegated root listener), then `mousemove`/`mouseup` on `document` (react-draggable's
 * own listeners). A real Playwright mouse can't be used for the min-size test: it
 * drags to hugely negative absolute coordinates (e.g. clientX -2400) that a real
 * cursor can't reach, whereas a synthetic MouseEvent carries them verbatim.
 */
import type { Locator, Page } from "@playwright/test";

import type { StructuredQuestionDetails } from "./factories";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

/**
 * metabase/utils/dashboard_grid GRID_WIDTH — the repo import is outside this
 * project's tsconfig include, so the constant is inlined (matches dashboard-core.ts).
 */
const GRID_WIDTH = 24;

type Size = { width: number; height: number };

export const VISUALIZATION_SIZES: Record<
  string,
  { min: Size; default: Size }
> = {
  line: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  area: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  bar: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  stacked: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  combo: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  row: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  scatter: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  waterfall: {
    min: { width: 4, height: 3 },
    default: { width: 14, height: 6 },
  },
  pie: { min: { width: 4, height: 3 }, default: { width: 12, height: 8 } },
  funnel: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  gauge: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  progress: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  map: { min: { width: 4, height: 3 }, default: { width: 12, height: 6 } },
  table: { min: { width: 4, height: 3 }, default: { width: 12, height: 9 } },
  pivot: { min: { width: 4, height: 3 }, default: { width: 12, height: 9 } },
  object: { min: { width: 4, height: 3 }, default: { width: 12, height: 9 } },
  scalar: { min: { width: 2, height: 2 }, default: { width: 6, height: 3 } },
  smartscalar: {
    min: { width: 2, height: 2 },
    default: { width: 6, height: 3 },
  },
  link: { min: { width: 1, height: 1 }, default: { width: 8, height: 1 } },
  action: { min: { width: 1, height: 1 }, default: { width: 4, height: 1 } },
  heading: {
    min: { width: 1, height: 1 },
    default: { width: GRID_WIDTH, height: 1 },
  },
  text: { min: { width: 1, height: 1 }, default: { width: 12, height: 3 } },
};

export const getMinSize = (visualizationType: string): Size | undefined =>
  VISUALIZATION_SIZES[visualizationType]?.min;
export const getDefaultSize = (visualizationType: string): Size | undefined =>
  VISUALIZATION_SIZES[visualizationType]?.default;

// === mock question factories (ports of the spec-local builders) ===

const getMockQuestionName = (vizType: string) => `MOCK_${vizType}_QUESTION`;

const getCommonQuestionFields = (vizType: string) => ({
  name: getMockQuestionName(vizType),
  query: {
    "source-table": ORDERS_ID,
    limit: 10,
    aggregation: [["count"]],
  },
  database: SAMPLE_DB_ID,
});

/** Covers table, bar, line, pie, row, area, combo, pivot, funnel, object, and
 * waterfall questions. */
const createMockChartQuestion = (
  vizType: string,
): StructuredQuestionDetails => {
  const question = getCommonQuestionFields(vizType);
  return {
    ...question,
    query: {
      ...question.query,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "minute" }]],
    },
    display: vizType,
    visualization_settings: {
      "graph.dimensions": [
        Object.keys(ORDERS).find(
          (key) => ORDERS[key as keyof typeof ORDERS] === ORDERS.CREATED_AT,
        ),
      ],
      "graph.series_order_dimension": null,
      "graph.series_order": null,
      "graph.metrics": ["count"],
    },
  };
};

/** Covers scalar, gauge, and progress questions. */
const createMockScalarQuestion = (
  vizType: string,
): StructuredQuestionDetails => {
  const question = getCommonQuestionFields(vizType);
  return { ...question, display: vizType };
};

/** Covers map questions. */
const createMockMapQuestion = (): StructuredQuestionDetails => {
  const question = getCommonQuestionFields("map");
  return {
    ...question,
    query: {
      ...question.query,
      breakout: [["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }]],
    },
    display: "map",
  };
};

/** The module-level TEST_QUESTIONS list. A getter, not a shared const, so the
 * "default sizes" test's in-place `.sort()` can't leak into sibling tests. */
export const getTestQuestions = (): StructuredQuestionDetails[] => [
  ...[
    "table",
    "bar",
    "line",
    "pie",
    "row",
    "area",
    "combo",
    "pivot",
    "scatter",
    "funnel",
    "object",
    "smartscalar",
    "waterfall",
  ].map((vizType) => createMockChartQuestion(vizType)),
  ...["scalar", "gauge", "progress"].map((vizType) =>
    createMockScalarQuestion(vizType),
  ),
  createMockMapQuestion(),
];

// === resize drag (port of H.resizeDashboardCard) ===

function resizeHandle(card: Locator): Locator {
  return card.locator(".react-resizable-handle").first();
}

async function dispatchMouse(
  target: Locator | Page,
  type: "mousedown" | "mousemove" | "mouseup",
  clientX: number,
  clientY: number,
) {
  const fn = (
    node: Document | Element,
    args: { type: string; clientX: number; clientY: number },
  ) =>
    node.dispatchEvent(
      new MouseEvent(args.type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: args.clientX,
        clientY: args.clientY,
      }),
    );

  if ("evaluate" in target && "boundingBox" in target) {
    // Locator (the handle): dispatch on the element, bubbling to React's root.
    await (target as Locator).evaluate(fn, { type, clientX, clientY });
  } else {
    // Page: dispatch on document, where react-draggable attaches its listeners.
    await (target as Page).evaluate(
      (args) =>
        document.dispatchEvent(
          new MouseEvent(args.type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: args.clientX,
            clientY: args.clientY,
          }),
        ),
      { type, clientX, clientY },
    );
  }
}

async function handleCenter(card: Locator): Promise<{ x: number; y: number }> {
  const box = await resizeHandle(card).boundingBox();
  if (!box) {
    throw new Error("resizeDashboardCard: missing resize handle bounding box");
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/**
 * Port of H.resizeDashboardCard({ card, x, y }): grab the card's
 * `.react-resizable-handle`, press on it, move to the absolute (x, y) target,
 * release. `x`/`y` are absolute clientX/clientY (upstream passes huge negatives
 * to clamp a card to its min size). The 200ms pauses mirror the Cypress `.wait(200)`s.
 */
export async function resizeDashboardCard(
  card: Locator,
  { x, y }: { x: number; y: number },
) {
  const page = card.page();
  const start = await handleCenter(card);
  await dispatchMouse(resizeHandle(card), "mousedown", start.x, start.y);
  await page.waitForTimeout(200);
  await dispatchMouse(page, "mousemove", x, y);
  await page.waitForTimeout(200);
  await dispatchMouse(page, "mouseup", x, y);
  await page.waitForTimeout(200);
}

/**
 * Port of the metabase#70451 drag: press the handle at its center, move by
 * (dx, dy), and — like the Cypress original — leave the drag in flight (no
 * mouseup) so the caller can assert the handle followed the cursor. Returns the
 * target cursor coordinates. Cypress dispatches the mousemove on the handle
 * itself, so this does too.
 */
export async function startResizeDrag(
  card: Locator,
  { dx, dy }: { dx: number; dy: number },
): Promise<{ targetX: number; targetY: number }> {
  const page = card.page();
  const start = await handleCenter(card);
  const targetX = start.x + dx;
  const targetY = start.y + dy;
  await dispatchMouse(resizeHandle(card), "mousedown", start.x, start.y);
  await dispatchMouse(resizeHandle(card), "mousemove", targetX, targetY);
  await page.waitForTimeout(200);
  return { targetX, targetY };
}

/** The current center of a card's resize handle (viewport coords). */
export async function resizeHandleCenter(
  card: Locator,
): Promise<{ x: number; y: number }> {
  return handleCenter(card);
}
