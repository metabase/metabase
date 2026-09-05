/**
 * Helpers for the maps spec port
 * (e2e/test/scenarios/visualizations-charts/maps.cy.spec.js).
 *
 * All ports of spec-local functions — kept in their own module so parallel
 * porting agents don't collide on the shared support/*.ts files. Fold the
 * generic ones into charts.ts on the next consolidation pass if reused.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { visitQuestionAdhoc } from "./permissions";
import { SAMPLE_DB_ID, SAMPLE_DATABASE } from "./sample-data";

const { PEOPLE_ID } = SAMPLE_DATABASE;

type Scope = Page | Locator;

/**
 * Port of the spec-local toggleFieldSelectElement: open a chart-setting select
 * by its data-field-title wrapper. `scope` mirrors the Cypress calls that were
 * sometimes bare (`cy.get`) and sometimes inside `H.leftSidebar().within`.
 */
export async function toggleFieldSelectElement(scope: Scope, field: string) {
  await scope
    .locator(`[data-field-title="${field}"]`)
    .getByTestId("chart-setting-select")
    .click();
}

/**
 * Port of the spec-local zoomIn: click the leaflet zoom-in control `times`
 * times, pausing between clicks the way the Cypress helper's cy.wait(200) did
 * to let leaflet finish each zoom step.
 */
export async function zoomIn(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(200);
  }
}

const SETTLE_TOLERANCE_PX = 0.5;
const SETTLE_HOLD_MS = 200;

/**
 * Port of the spec-local getSettledMarkerPosition (metabase#11211): read the
 * first marker's rect only once it has held steady for a real time window, so
 * we sample a settled position instead of racing leaflet's zoom/resize
 * animation. Anchors on elapsed wall-clock time (performance.now) rather than
 * retry count — two fast reads can otherwise land in the same animation frame
 * and look "stable" mid-animation.
 */
export async function getSettledMarkerPosition(
  page: Page,
): Promise<{ left: number; top: number }> {
  const marker = page.locator(".leaflet-marker-icon").first();
  let anchor: { left: number; top: number } | null = null;
  let anchorAt = 0;

  await expect
    .poll(
      async () => {
        const box = await marker.boundingBox();
        if (!box) {
          return false;
        }
        const now = performance.now();
        const stable =
          anchor != null &&
          Math.abs(box.x - anchor.left) < SETTLE_TOLERANCE_PX &&
          Math.abs(box.y - anchor.top) < SETTLE_TOLERANCE_PX;
        if (!stable) {
          // Position moved (or first read) — reset the anchor and restart the timer.
          anchor = { left: box.x, top: box.y };
          anchorAt = now;
        }
        return stable && now - anchorAt >= SETTLE_HOLD_MS;
      },
      { message: "leaflet marker position should be settled" },
    )
    .toBe(true);

  // anchor is guaranteed set once the poll resolves true.
  return anchor as unknown as { left: number; top: number };
}

/**
 * Port of the spec-local pinMapSelectRegion: visit a People pin map, arm the
 * "Draw box to filter" tool, then drag a box across the map. The drag replaces
 * the Cypress realMouseDown/Move/Up (coordinates relative to the
 * visualization-root element) with real Playwright mouse events at the same
 * element-relative coordinates. Awaits the /api/dataset re-run the brush
 * triggers.
 */
export async function pinMapSelectRegion(
  page: Page,
  x: number,
  y: number,
  moveX: number,
  moveY: number,
  visualization_settings: Record<string, unknown> = {
    "map.center_latitude": 0,
    "map.center_longitude": 0,
    "map.zoom": 0,
    "map.type": "pin",
    "map.latitude_column": "LATITUDE",
    "map.longitude_column": "LONGITUDE",
  },
) {
  await visitQuestionAdhoc(page, {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": PEOPLE_ID,
      },
    },
    display: "map",
    visualization_settings,
  });

  await page.locator(".CardVisualization").hover();
  await page
    .getByTestId("visualization-root")
    .getByText("Draw box to filter")
    .click();

  const root = page.getByTestId("visualization-root");
  const box = await root.boundingBox();
  if (!box) {
    throw new Error("pinMapSelectRegion: visualization-root has no bounding box");
  }

  const datasetResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );

  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + moveX, box.y + moveY, { steps: 10 });
  await page.mouse.up();

  await datasetResponse;
}
