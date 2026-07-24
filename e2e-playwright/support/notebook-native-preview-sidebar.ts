/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question/notebook-native-preview-sidebar.cy.spec.ts.
 *
 * Own module per PORTING rule 9 — every shared support file is imported
 * read-only. Module name matches the spec name exactly
 * (support/notebook-native-preview-sidebar.ts <-> the spec's import), so there
 * is no dangling-import hazard.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { adhocQuestionHash } from "./native-editor";
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

const { REVIEWS_ID } = SAMPLE_DATABASE;

export const MONGO_SKIP_REASON =
  "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)";

/**
 * Port of ORDERS_COUNT_QUESTION_ID (e2e/support/cypress_sample_instance_data.js:26).
 * Derived by NAME from the same generated JSON the Cypress export reads, never
 * hardcoded — PORTING's "NEVER guess a fixture id" rule. `support/sample-data.ts`
 * exports ORDERS_QUESTION_ID / ORDERS_BY_YEAR_QUESTION_ID but not this one, and
 * shared modules are off-limits to a porting agent, so it lives here.
 * Consolidation candidate: fold into sample-data.ts alongside its siblings.
 */
export const ORDERS_COUNT_QUESTION_ID: number = (() => {
  const question = (
    SAMPLE_INSTANCE_DATA.questions as { name: string; id: number | string }[]
  ).find((entity) => entity.name === "Orders, Count");
  if (!question) {
    throw new Error(
      'Question "Orders, Count" not found in cypress_sample_instance_data',
    );
  }
  return Number(question.id);
})();

/**
 * Port of `H.openReviewsTable({ mode: "notebook", limit })`.
 *
 * ⚠️ The shared `ad-hoc-question.ts openTable` DROPS `limit` on the notebook
 * branch — its own comment says "No current caller opens a table in notebook
 * mode with a limit", which this spec makes false. Upstream's `openTable`
 * builds ONE query object (`{"source-table", limit}`) and `mode` only picks the
 * URL and the waits, so the limit is always present. This spec's smoke test
 * depends on it: it asserts the generated SQL carries the limit and then
 * deletes the `step-limit-0-0` notebook step, which does not exist at all
 * without it. Reproduced faithfully here rather than editing the shared module.
 * Consolidation candidate — see findings.
 *
 * Readiness anchor: upstream's notebook branch waits for nothing, and the
 * shared `visitQuestionAdhocNotebook` anchors on `data-step-cell`, which
 * PORTING flags as a pre-interaction placeholder (the empty data step is
 * already mounted). Anchor on the step actually NAMING the table instead.
 */
export async function openReviewsTableNotebook(
  page: Page,
  { limit }: { limit?: number } = {},
) {
  await page.goto(
    `/question/notebook#${adhocQuestionHash({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": REVIEWS_ID,
          ...(limit != null ? { limit } : {}),
        },
        type: "query",
      },
    })}`,
  );
  await expect(
    page.getByTestId("step-data-0-0").getByTestId("data-step-cell"),
  ).toHaveText("Reviews");
}

export function previewSidebar(page: Page): Locator {
  return page.getByTestId("native-query-preview-sidebar");
}

/**
 * Port of the spec-local `openSidebar(variant)`.
 * `cy.findByLabelText(label)` is an EXACT testing-library match (rule 1).
 */
export async function openSidebar(page: Page, variant: "sql" | "native" = "sql") {
  const label = variant === "sql" ? "View SQL" : "View native query";
  const button = page.getByLabel(label, { exact: true });
  await expect(button).toBeVisible();
  await button.click();
}

/** Port of the spec-local `closeSidebar(variant)`. */
export async function closeSidebar(
  page: Page,
  variant: "sql" | "native" = "sql",
) {
  const label = variant === "sql" ? "Hide SQL" : "Hide native query";
  const button = page.getByLabel(label, { exact: true });
  await expect(button).toBeVisible();
  await button.click();
}

/**
 * The preview's CodeMirror content, scoped to the sidebar.
 *
 * `H.NativeEditor.get()` is `codeMirrorHelpers("native-query-editor").get()` —
 * it asserts the loading indicator is gone and then resolves
 * `[data-testid=native-query-editor] .cm-content`. The sidebar's preview really
 * does carry that testid (`querying/components/CodeMirrorEditor/CodeMirrorEditor.tsx:161`),
 * and upstream calls it inside `.within(previewSidebar)`, so the scoping is
 * faithful, not defensive.
 */
export function previewEditor(page: Page): Locator {
  return previewSidebar(page).locator(
    "[data-testid=native-query-editor] .cm-content",
  );
}

/**
 * The generated SQL as RAW text.
 *
 * ⚠️ Whitespace: Playwright's `toHaveText` / `toContainText` normalize
 * whitespace, so any assertion whose subject is the SQL's own formatting would
 * be silently vacuous. Every generated-SQL assertion in this spec goes through
 * this function and plain `String.includes`, i.e. raw `textContent` — see the
 * findings file for the per-assertion audit.
 *
 * Note CodeMirror renders each line as its own div and `textContent`
 * concatenates them with NO separator, exactly like the jQuery `.text()` that
 * chai-jquery's `contain` compared against upstream.
 */
export async function previewSql(page: Page): Promise<string> {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  return (await previewEditor(page).textContent()) ?? "";
}

/**
 * Poll the preview's raw text until `assertion` holds. Cypress's
 * `.should("contain", …).and("contain", …)` retries the whole chain, so the
 * port has to retry too — the preview refetches on every query change.
 */
export async function expectPreviewSql(
  page: Page,
  assertion: (sql: string) => boolean,
  message: string,
) {
  await expect(async () => {
    const sql = await previewSql(page);
    expect(
      assertion(sql),
      `expected the generated SQL to satisfy: ${message}\nactual SQL: ${sql}`,
    ).toBe(true);
  }).toPass({ timeout: 15_000 });
}

/** POST /api/dataset/native — the spec's "@nativeDataset" alias. */
export function waitForNativeDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset/native",
  );
}

/** POST /api/dataset — the spec's "@dataset" alias (convertToSql). */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** GET /api/session/properties — the spec's "@sessionProperties" alias. */
export function waitForSessionProperties(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/session/properties",
  );
}

/** PUT /api/setting/notebook-native-preview-sidebar-width — "@updateSidebarWidth". */
export function waitForUpdateSidebarWidth(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname ===
        "/api/setting/notebook-native-preview-sidebar-width",
  );
}

/** The sidebar's rendered width, i.e. `$sidebar[0].getBoundingClientRect().width`. */
export async function sidebarWidth(page: Page): Promise<number> {
  return previewSidebar(page).evaluate(
    (element) => element.getBoundingClientRect().width,
  );
}

/**
 * Port of the spec-local `resizeSidebar(amountX, cb)`.
 *
 * The handle belongs to **react-resizable** (`NotebookContainer.tsx` renders a
 * `<ResizableBox resizeHandles={["w"]} handle={<Handle/>}>`), which is
 * react-draggable underneath — NOT dnd-kit, so `support/dnd.ts` is the wrong
 * tool (PORTING: "React-Grid-Layout resize is react-draggable"). react-draggable
 * attaches `mousedown` through React's delegated listener on the handle and then
 * raw `mousemove`/`mouseup` listeners on `document`, so the drag is replayed as
 * synthetic MouseEvents: down on the handle, move + up on document.
 *
 * `amountX` keeps upstream's meaning. cypress-real-events' `realMouseMove(x, y)`
 * is ELEMENT-RELATIVE, not a delta (PORTING, leaflet-draw note): upstream moves
 * to the point `amountX` px right of the handle's top-left corner. Negative
 * `amountX` therefore drags LEFT, which widens a sidebar whose handle is on its
 * left edge — matching upstream's expectation that -500 grows it.
 *
 * Returns [initialWidth, newWidth], the two values upstream hands its callback.
 */
export async function resizeSidebar(
  page: Page,
  amountX: number,
): Promise<[number, number]> {
  const initialWidth = await sidebarWidth(page);

  const handle = page.getByTestId("notebook-native-preview-resize-handle");
  await expect(handle).toBeVisible();

  const updateSidebarWidth = waitForUpdateSidebarWidth(page);
  const sessionProperties = waitForSessionProperties(page);

  await handle.evaluate((element, dx) => {
    const rect = element.getBoundingClientRect();
    // Upstream's realMouseDown has no position -> the element's centre.
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    // realMouseMove(dx, 0) is element-relative: the handle's top-left + dx.
    const endX = rect.left + dx;
    const endY = rect.top;

    const fire = (
      target: EventTarget,
      type: string,
      clientX: number,
      clientY: number,
    ) =>
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: type === "mouseup" ? 0 : 1,
        }),
      );

    fire(element, "mousedown", startX, startY);
    // react-draggable listens for move/up on the OWNER DOCUMENT, not the handle.
    fire(document, "mousemove", endX, endY);
    fire(document, "mouseup", endX, endY);
  }, amountX);

  await updateSidebarWidth;
  await sessionProperties;

  return [initialWidth, await sidebarWidth(page)];
}

/**
 * Scroll the results grid until a `[data-testid=cell-data]` containing `text`
 * is rendered (or the grid is exhausted).
 *
 * WHY this is needed, stated precisely — it is a virtualization accommodation,
 * NOT a semantic change. The assertion afterwards is still upstream's "some
 * RENDERED cell contains X"; this only makes the app render far enough for it
 * to be answerable.
 *
 * The mongo tests assert the converted query returns "Small Marble Shoes".
 * The generated pipeline is `[{$project: …}, {$limit: 1048575}]` with **no
 * `$sort`**, so the row order is MongoDB NATURAL order — a property of the
 * container's documents, not of Metabase. Measured on this box's
 * `mongo-sample`: natural order starts at product id 14, and "Small Marble
 * Shoes" is at position **20** of 200 (probed via `POST /api/dataset`). The
 * results grid after conversion is **196px tall and renders 10 rows**, so
 * upstream's bare assertion cannot be satisfied here — it depends on the target
 * landing inside the first virtualized window.
 *
 * Whether CI's mongo container orders it differently is NOT something this port
 * can determine (running the Cypress original is barred on a shared box, and
 * the local jar is not CI's). Recorded as unexplained-but-bounded rather than
 * blamed on the app: the data is definitely present and definitely correct.
 */
export async function scrollResultsToCell(page: Page, text: string) {
  const cell = page
    .locator("[data-testid=cell-data]")
    .filter({ hasText: new RegExp(escapeRegExp(text)) });

  await expect(page.locator("[data-testid=cell-data]").first()).toBeVisible();
  if ((await cell.count()) > 0) {
    return;
  }

  const grid = page.getByRole("grid").first();
  await grid.hover();
  for (let step = 0; step < 40; step++) {
    // react-virtualized grids ignore a synthetic scrollLeft/scrollTop
    // (PORTING, wave 10) — drive them with a real wheel over the grid.
    await page.mouse.wheel(0, 200);
    if ((await cell.count()) > 0) {
      return;
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Port of the spec-local `convertToSql()`. */
export async function convertToSql(page: Page) {
  await page.getByTestId("qb-header-action-panel").getByTestId("notebook-button").click();
  await page.getByLabel("View SQL", { exact: true }).click();

  const dataset = waitForDataset(page);
  await page
    .getByRole("button", { name: "Convert this question to SQL", exact: true })
    .click();
  await dataset;

  await expect(
    page.locator("[data-testid=native-query-editor] .cm-content"),
  ).toBeVisible();
}
