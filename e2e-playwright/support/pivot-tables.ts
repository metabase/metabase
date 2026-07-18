/**
 * Helpers for the pivot-tables spec port
 * (e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js).
 *
 * Kept in its own module (per the porting rules: parallel agents never edit
 * shared support files). Consolidation candidates flagged inline:
 * - `updatePermissionsGraph` duplicates dashboard-repros.ts / click-behavior.ts.
 * - `findDisplayValue` overlaps dashboard-cards.ts#inputWithValue and
 *   filters-repros.ts#findByDisplayValue (both input-only; this one also scans
 *   <select> for the Mantine value inputs the value-formatting test needs).
 * - `moveDnDKitListElement` is the list-index variant of the by-alias/by-offset
 *   movers in dashboard-cards.ts.
 */
import type { FrameLocator, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { visitQuestionAdhoc } from "./permissions";

/**
 * Thin typed wrappers over the shared api.createQuestion /
 * permissions.visitQuestionAdhoc helpers. Their param types omit
 * `visualization_settings` (which both forward at runtime — createQuestion via
 * `...rest`, visitQuestionAdhoc via the URL-hash JSON), and TypeScript's
 * excess-property check would reject it on the object literals this spec passes.
 * Routing through a wrapper whose param type includes it satisfies the check
 * without editing the shared modules. Consolidation candidate: widen the shared
 * helpers' param types.
 */
type AdhocPivotQuestion = {
  display?: string;
  visualization_settings?: Record<string, unknown>;
  dataset_query: {
    type: "native" | "query";
    database: number;
    native?: { query: string; "template-tags"?: Record<string, unknown> };
    query?: Record<string, unknown>;
  };
};

export function visitPivotAdhoc(page: Page, question: AdhocPivotQuestion) {
  return visitQuestionAdhoc(page, question);
}

type PivotQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  collection_id?: number;
  database?: number;
  query: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
};

export function createPivotQuestion(
  api: MetabaseApi,
  details: PivotQuestionDetails,
) {
  return api.createQuestion(details);
}

/** Mirrors PIVOT_TABLE_BODY_LABEL from
 * frontend/src/metabase/visualizations/visualizations/PivotTable/constants.ts.
 * This package has no path alias into frontend/src, so the value is inlined. */
export const PIVOT_TABLE_BODY_LABEL = "pivot-table-body-grid";

type TextScope = Page | Locator | FrameLocator;

/**
 * Port of the spec's assertOnPivotSettings: the three field options in the
 * pivot-table sidebar, in order (User → Source, Product → Category, Count).
 */
export async function assertOnPivotSettings(page: Page) {
  const fieldOptions = page.getByTestId(/draggable-item/);
  const settings = page.getByTestId("pivot-table-setting");

  await expect(settings.nth(0)).toBeVisible();
  await expect(fieldOptions.nth(0)).toContainText(/Users? → Source/);
  await expect(settings.nth(1)).toBeVisible();
  await expect(fieldOptions.nth(1)).toContainText(/Products? → Category/);
  await expect(settings.nth(2)).toBeVisible();
  await expect(fieldOptions.nth(2)).toContainText("Count");
}

/**
 * Port of the spec's assertOnPivotFields: implicit assertions on the rendered
 * pivot table. `scope` is the page, the query-visualization-root locator, or an
 * embed FrameLocator depending on the caller.
 */
export async function assertOnPivotFields(scope: TextScope) {
  await expect(scope.getByText(/Users? → Source/)).toBeVisible();
  await expect(scope.getByText(/Row totals/i)).toBeVisible();
  await expect(scope.getByText(/Grand totals/i)).toBeVisible();
  await expect(scope.getByText("3,520", { exact: true })).toBeVisible();
  await expect(scope.getByText("4,784", { exact: true })).toBeVisible();
  await expect(scope.getByText("18,760", { exact: true })).toBeVisible();
}

/**
 * Port of the spec's openColumnSettings: the column's ellipsis (settings)
 * button inside its sidebar draggable-item. Hover-independent — the icon is
 * always present; the click is forced like the Cypress original.
 */
export async function openColumnSettings(page: Page, columnName: string) {
  await sidebar(page)
    .getByTestId(`draggable-item-${columnName}`)
    .locator(".Icon-ellipsis")
    .click({ force: true });
}

/** cy.get("main aside") — the settings sidebar. */
function sidebar(page: Page): Locator {
  return page.locator("main aside");
}

/**
 * Port of the spec's sortColumnResults: open the column's settings button, pick
 * the sort direction icon, dismiss the popover, then assert the encoded query
 * in the URL hash carries the direction. The hash assertion is polled
 * (Cypress's cy.location retries).
 */
export async function sortColumnResults(
  page: Page,
  column: string,
  direction: "ascending" | "descending",
) {
  const iconName = direction === "ascending" ? "arrow_up" : "arrow_down";

  await page
    .getByTestId("sidebar-content")
    .getByTestId(`${column}-settings-button`)
    .click();

  await page
    .locator(
      ".popover[data-state~='visible'],[data-element-id=mantine-popover]",
    )
    .filter({ visible: true })
    .locator(`.Icon-${iconName}`)
    .click();

  // Click anywhere to dismiss the popover from the UI.
  await page.mouse.click(5, 5);

  await expect
    .poll(() => {
      const hash = new URL(page.url()).hash.slice(1);
      try {
        return atob(hash);
      } catch {
        return "";
      }
    })
    .toContain(direction);
}

/**
 * Port of the spec's getPivotTableBodyCell: the index-th value cell in the
 * pivot table body grid.
 */
export function getPivotTableBodyCell(page: Page, index: number): Locator {
  return page
    .getByLabel(PIVOT_TABLE_BODY_LABEL)
    .getByTestId("pivot-table-cell")
    .nth(index);
}

/**
 * Port of H.moveDnDKitListElement: drag the list element at `startIndex` onto
 * the position of the element at `dropIndex`. dnd-kit's PointerSensor accepts
 * real mouse input, so this uses the real-mouse sequence (press, exceed the
 * activation threshold, glide to the drop element's center, release) rather
 * than the Cypress synthetic pointer events.
 */
export async function moveDnDKitListElement(
  page: Page,
  {
    testId,
    startIndex,
    dropIndex,
  }: { testId: string; startIndex: number; dropIndex: number },
) {
  const handles = page.getByTestId(new RegExp(testId));
  // Cypress asserts have.length.gt 1 before reading indices.
  await expect(handles.nth(1)).toBeVisible();

  const dragBox = await handles.nth(startIndex).boundingBox();
  const dropBox = await handles.nth(dropIndex).boundingBox();
  if (!dragBox || !dropBox) {
    throw new Error("moveDnDKitListElement: missing bounding boxes");
  }

  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  const endX = dropBox.x + dropBox.width / 2;
  const endY = dropBox.y + dropBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY + 20, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/**
 * Port of H.moveDnDKitElementByAlias for the pivot column-RESIZE handles, which
 * are thin and clipped — real mouse input lands unreliably (a run measured 80
 * then 120 for the same drag). The Cypress helper drives dnd-kit's PointerSensor
 * with synthetic pointer events at element-relative offsets; replicate that
 * exactly (pointerdown at the handle's top-left, a threshold-exceeding move, the
 * offset move, then pointerup on document), which is deterministic.
 */
export async function moveDnDKitPointer(
  handle: Locator,
  { horizontal = 0, vertical = 0 }: { horizontal?: number; vertical?: number },
) {
  const page = handle.page();

  const dispatch = (
    type: string,
    clientX: number,
    clientY: number,
    onDocument = false,
  ) =>
    handle.evaluate(
      (el, args) => {
        const target = args.onDocument ? document : el;
        target.dispatchEvent(
          new PointerEvent(args.type, {
            bubbles: true,
            cancelable: true,
            clientX: args.clientX,
            clientY: args.clientY,
            button: 0,
            buttons: args.type === "pointerup" ? 0 : 1,
            isPrimary: true,
            pointerId: 1,
          }),
        );
      },
      { type, clientX, clientY, onDocument },
    );

  // Re-read the box before each event, like the Cypress helper's getElement().
  // The handle's `left` style is `initialWidth + transform.x`, so it slides as
  // you drag: firing each offset relative to the CURRENT position compounds the
  // move (a nominal +100 offset lands as a +120 delta after the +20 nudge). A
  // fixed-coordinate drag loses that and comes up ~20px short.
  const boxAt = async () => {
    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("moveDnDKitPointer: missing bounding box");
    }
    return box;
  };

  let box = await boxAt();
  await dispatch("pointerdown", box.x, box.y);
  await page.waitForTimeout(200);

  box = await boxAt();
  await dispatch("pointermove", box.x + 20, box.y + 20);
  await page.waitForTimeout(200);

  box = await boxAt();
  const finalX = box.x + horizontal;
  const finalY = box.y + vertical;
  await dispatch("pointermove", finalX, finalY);
  await page.waitForTimeout(200);

  await dispatch("pointerup", finalX, finalY, true);
  await page.waitForTimeout(200);
}

/**
 * jQuery-style .width() (content-box width) of the pivot-table cell wrapping a
 * text element — the spec's getCellWidth = textEl.closest("[data-testid=
 * pivot-table-cell]").width(). clientWidth already excludes borders and any
 * scrollbar; subtracting the horizontal padding yields the content width.
 */
export async function cellContentWidth(textEl: Locator): Promise<number> {
  return textEl.evaluate((el) => {
    const cell = el.closest("[data-testid=pivot-table-cell]");
    if (!(cell instanceof HTMLElement)) {
      throw new Error("no enclosing pivot-table-cell");
    }
    const style = getComputedStyle(cell);
    return (
      cell.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  });
}

/**
 * Port of cy.findByDisplayValue: the form control in `scope` whose current
 * value equals `value`. Scans inputs, textareas AND selects (the value-
 * formatting test targets a Mantine Select rendered as an <input>).
 */
export async function findDisplayValue(
  scope: Page | Locator,
  value: string,
): Promise<Locator> {
  const controls = scope.locator("input, textarea, select");
  await expect(controls.first()).toBeVisible();
  const count = await controls.count();
  for (let i = 0; i < count; i++) {
    if ((await controls.nth(i).inputValue()) === value) {
      return controls.nth(i);
    }
  }
  throw new Error(`No form control with value "${value}" found`);
}

/** Port of cy.updatePermissionsGraph: GET the graph, shallow-merge the given
 * group permissions, PUT it back. Consolidation candidate (see file header). */
export async function updatePermissionsGraph(
  api: MetabaseApi,
  groupsPermissionsObject: Record<string, unknown>,
) {
  const response = await api.get("/api/permissions/graph");
  const { groups, revision } = (await response.json()) as {
    groups: Record<string, unknown>;
    revision: number;
  };
  await api.put("/api/permissions/graph", {
    groups: { ...groups, ...groupsPermissionsObject },
    revision,
  });
}

/**
 * Port of the column-resizing test's H.saveQuestion(undefined, undefined, {
 * path }): save the current ad-hoc question without renaming it, into the
 * collection named by `path`. Anchored on the POST /api/card response.
 */
export async function saveAdhocQuestion(
  page: Page,
  { path }: { path: (string | RegExp)[] },
): Promise<number> {
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );

  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();

  const saveModal = page.getByTestId("save-question-modal");
  await saveModal.getByLabel(/Where do you want to save this/).click();

  const picker = page.getByTestId("nested-item-picker");
  for (const [index, name] of path.entries()) {
    await picker
      .getByTestId(`item-picker-level-${index}`)
      .getByText(name, { exact: typeof name === "string" })
      .click();
  }
  await page.getByTestId("entity-picker-select-button").click();

  await saveModal.getByRole("button", { name: "Save", exact: true }).click();

  const body = (await (await saveResponse).json()) as { id: number };

  await expect(
    page.getByTestId("toast-undo").getByText(/Saved/i),
  ).toBeVisible();

  return body.id;
}
