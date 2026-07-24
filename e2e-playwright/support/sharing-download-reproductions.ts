/**
 * Helpers specific to the sharing-download-reproductions port
 * (e2e/test/scenarios/sharing/downloads/sharing-download-reproductions.cy.spec.js).
 *
 * The download drive-and-assert lives in the shared support/downloads.ts
 * (downloadAndAssert); this file only carries the spec-local dances that the
 * reproductions add on top of it. Nothing here is shared — new helpers per the
 * porting playbook go in a per-spec module and import from the shared ones.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { moveDnDKitPointer } from "./dnd";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE } from "./sample-data";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

/**
 * Port of the repeated
 * `cy.request("POST", "/api/field/${ORDERS.PRODUCT_ID}/dimension", {...})`
 * remap of Orders.Product ID → Products.Title (issues 18440 / 18573).
 */
export async function remapProductIdToProductTitle(api: MetabaseApi) {
  await api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

/**
 * Port of the spec-local `saveAndOverwrite`: click the QB header Save, then
 * confirm Save inside the save-question modal (overwriting the existing card).
 */
export async function saveAndOverwrite(page: Page) {
  await page.getByText("Save", { exact: true }).click();
  await page
    .getByTestId("save-question-modal")
    .getByText("Save", { exact: true })
    .click();
}

/**
 * Port of `cy.contains(/open editor/i).click()` /
 * `cy.findByTestId("query-builder-main").findByText("Open Editor").click()`:
 * expand a saved native question's collapsed SQL editor.
 */
export async function openNativeEditor(page: Page) {
  await page
    .getByTestId("query-builder-main")
    .getByText(/open editor/i)
    .click();
}

/**
 * Port of issue 19889's column-reorder beforeEach: drag the "column a" header
 * to the right past "column b", then click the (plain-text) "Started from"
 * lineage label to let the DOM settle.
 *
 * The Cypress original fired raw `.trigger("mousedown"/"mousemove"/"mouseup")`
 * on the header at element-relative offsets (0,0 → 10,10 → 100,0). The data-grid
 * reorder is driven by dnd-kit's PointerSensor (activation distance 10, the
 * dnd.ts note names sortable column headers as its canonical case), so the
 * faithful equivalent is moveDnDKitPointer, which re-reads the header's box
 * before each event as the drag ghost slides.
 *
 * Cypress's trailing `cy.findByText("Started from").click()` was a "give the DOM
 * time to update" settle; here we instead poll the header order until the drag
 * has actually swapped the columns, which both settles and verifies it landed.
 */
export async function reorderColumnAPastColumnB(page: Page) {
  const tableHeader = page.getByTestId("table-header");
  const columnA = tableHeader.getByText("column a", { exact: true });
  await expect(columnA).toBeVisible();

  await moveDnDKitPointer(columnA, { horizontal: 100 });

  await expect
    .poll(async () => (await tableHeader.innerText()).replace(/\s+/g, " "))
    .toContain("column b column a");
}
