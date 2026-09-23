/**
 * Playwright port of e2e/test/scenarios/data-model/data-model-shared-4.cy.spec.ts
 *
 * Collision checks (PORTING "same-basename siblings"):
 * - `e2e/test/scenarios/data-model/` holds only `.ts` specs
 *   (`data-model-shared-1..4.cy.spec.ts`) — no `.js`/`.ts` basename pair, and
 *   the three disjoint pairs that exist repo-wide are all already ported.
 * - `grep -rl "data-model-shared-4" tests/ support/` hit nothing; `ls tests/`
 *   had no `data-model-shared-4.spec.ts` and `ls support/` no
 *   `data-model-shared-4.ts`. No uncommitted port of this source existed.
 * - Support module name is the conventional `support/data-model-shared-4.ts`
 *   (no deviation to report).
 *
 * Shape: 2 upstream tests × 2 areas (`admin`, `data studio`) = 4 cases. Both
 * are monolithic "walk every editable surface" tests.
 *
 * Infra tier — checked per describe, not per tag:
 * - BOTH describes are `@external` and BOTH tags are ACCURATE. Each restores
 *   the `postgres-writable` snapshot, reseeds `many_data_types` on the writable
 *   QA postgres (`metabase-e2e-postgres-sample-1`, `writable_db` on :5404) and
 *   resyncs it, because both tests end by driving the JSON-unfolding control on
 *   that table. Gated on `PW_QA_DB_ENABLED`; with the gate off all 4 skip.
 * - The `WRITABLE_DB_ID` red herring does NOT apply. It is the literal `2`,
 *   which is the read-only "QA Postgres12" sample only under the `postgres-12`
 *   snapshot; these describes restore `postgres-writable`, under which database
 *   2 genuinely IS the writable container. So all 4 cases are fully exposed to
 *   FINDINGS #85 contamination — see the accommodation below.
 * - Token: `H.activateToken("pro-self-hosted")`. Gated on the token resolving,
 *   like every EE port. Nothing here touches `transforms-basic`.
 *
 * Snowplow vantage: NONE, and that is the finding. The outer `beforeEach` calls
 * `H.resetSnowplow()`, which is why this spec is queue-gated on snowplow — but
 * the spec asserts NO tracking event anywhere, has no `H.expectNoBadSnowplowEvents`,
 * and `e2e/support/e2e.js` installs no global snowplow `afterEach`. So
 * `resetSnowplow` is dead setup here: neither the browser-boundary capture
 * (`installSnowplowCapture`) nor the per-slot collector would have anything to
 * observe. Dropped rather than stubbed. (Verified by reading the source and by
 * grepping the Cypress support root for a global hook — not assumed from the tag.)
 *
 * Port notes:
 * - Dropped, never-awaited intercepts: this spec registers eleven `cy.intercept`
 *   aliases in its outer `beforeEach` — `schemas`, `metadata`, `schema`,
 *   `dataset`, `fieldValues`, `updateField`(+`updateFieldSpy`),
 *   `updateFieldOrder`, `updateFieldValues`, `updateFieldDimension`,
 *   `updateTables`, `updateTable`, plus per-area `databases` — and then contains
 *   **not one `cy.wait`** and never reads `@updateFieldSpy`. They are pure dead
 *   setup and are dropped. The only live intercepts are the "Error handling"
 *   500 stubs, ported in `stubServerErrors`.
 *   Consequence: there is no `cy.wait` alias QUEUE to reproduce in this spec.
 *   The retrying toast assertions are what gate each step, exactly as upstream.
 * - `verifyAndCloseToast` / `verifyToastAndUndo`: both operate on toasts that
 *   OVERLAP by construction (fourteen consecutive edits, and Undo stacks a
 *   second toast — upstream says so in a comment). `should("contain.text", …)`
 *   on such a multi-element subject is a chai-jquery CONCATENATION, ported as a
 *   join over all toasts, never `.first()` (which would silently STRENGTHEN it).
 *   The shared `data-model.ts:235` `verifyAndCloseToast` is NOT imported — it is
 *   the measured strict-mode + force-click bug.
 * - 🔴 FINDINGS #85 accommodation, declared because it IS a deviation: the
 *   shared writable postgres carries ~29 schemas where a clean container has 1.
 *   Upstream's `visit({ databaseId: WRITABLE_DB_ID })` relies on the picker
 *   AUTO-EXPANDING the sole schema; with 29 it does not, `public` sorts last of
 *   a virtualized ~20-row tree so the node is never in the DOM to click, and
 *   `visitDataModel`'s default `schema` wait (which fires only ON auto-expand)
 *   burns 30s on a correctly-rendered page. The port navigates straight to
 *   `schemaId` (`2:public` — the RAW schema name, not `Public`), reaching the
 *   identical end state. No foreign schema is dropped: sibling slots are live.
 * - `resyncDatabase({ tables })` alone can be satisfied instantly by a stale
 *   `initial_sync_status: "complete"` row (PORTING), so the beforeEach also
 *   anchors on `waitForUnfoldedJsonField` — a field only a FRESH sync could have
 *   produced, matched on `nfc_path` `["json","a"]` (the backend name is
 *   `"json → a"`; `json.a` is the FE's rendering and never appears in the API).
 * - `cy.realPress("Escape")` → `page.keyboard.press("Escape")`.
 * - `moveDnDKitElementByAlias(alias, { vertical })` defaults to POINTER events,
 *   so it ports to `moveDnDKitPointer` (which re-reads the box before each
 *   event, as the Cypress helper re-queries the alias), not to the MouseEvent
 *   variant.
 * - `.blur()` must hit the element Cypress typed into. The table/field name
 *   inputs are addressed through a row whose accessible name CHANGES as you
 *   type, so re-resolving the locator to blur it deadlocks — `blurFocusedElement`
 *   blurs the focused node instead.
 * - Each case walks ~15 editable surfaces plus a cross-database switch, which
 *   overruns the 90s project timeout. Raised per test; this is a harness
 *   accommodation, not a change to what is asserted.
 */
import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import {
  SAMPLE_DB_SCHEMA_ID,
  PreviewSection,
  TablePicker,
  areas,
  replaceValue,
  visitDataModel,
} from "../support/data-model";
import { button, clickCoercionToggle } from "../support/data-model-shared-2";
import {
  blurFocusedElement,
  remappingInputWithAttrValue,
  resetManyDataTypesTable,
  waitForUnfoldedJsonField,
} from "../support/data-model-shared-3";
import {
  FieldSection,
  TableSection,
  clickMiniBarChartToggle,
  fieldOrderOption,
  fieldOrderRadio,
  stubServerErrors,
  typeAppend,
  verifyAndCloseToast,
  verifyToastAndUndo,
} from "../support/data-model-shared-4";
import { moveDnDKitPointer } from "../support/dnd";
import { expect, test } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { modal, popover } from "../support/ui";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const QA_DB_ENABLED = process.env.PW_QA_DB_ENABLED === "1";

/** See the #85 note in the header. The picker renders the RAW schema name. */
const WRITABLE_PUBLIC_SCHEMA_ID = `${WRITABLE_DB_ID}:public`;

for (const area of areas) {
  test.describe(`data model > ${area}`, () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    const visit = (page: Page, options?: Parameters<typeof visitDataModel>[2]) =>
      visitDataModel(page, area, options);

    /**
     * Both upstream describes share this beforeEach body verbatim (restore the
     * writable snapshot, reseed `many_data_types`, sign in, resync). Kept as one
     * function called from each describe rather than hoisted to an outer
     * `beforeEach`, so the two describes stay independently readable — and so
     * the gate skip sits on each describe, as upstream's `@external` tag does.
     */
    const restoreWritable = async (mb: {
      restore: (snapshot?: string) => Promise<void>;
      signInAsAdmin: () => Promise<void>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      api: any;
    }) => {
      await mb.restore("postgres-writable");
      await resetManyDataTypesTable();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await resyncDatabase(mb.api, {
        dbId: WRITABLE_DB_ID,
        tables: ["many_data_types"],
      });
      await waitForUnfoldedJsonField(mb.api, WRITABLE_DB_ID);
    };

    test.describe("Error handling", () => {
      test.skip(
        !QA_DB_ENABLED,
        "@external — needs the writable QA postgres (postgres-sample, " +
          "writable_db on :5404) and the postgres-writable snapshot " +
          "(set PW_QA_DB_ENABLED=1)",
      );

      test.beforeEach(async ({ page, mb }) => {
        await restoreWritable(mb);
        await stubServerErrors(page, area);
      });

      test("shows toast errors and preview errors", async ({ page }) => {
        test.setTimeout(300_000);

        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });

        // table section
        if (area === "data studio") {
          await TableSection.clickDetailsTab(page);
        }

        // name
        await typeAppend(TableSection.getNameInput(page), "a");
        await blurFocusedElement(page);
        await verifyAndCloseToast(page, "Failed to update table name");

        // description
        await typeAppend(TableSection.getDescriptionInput(page), "a");
        await blurFocusedElement(page);
        await verifyAndCloseToast(page, "Failed to update table description");

        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }

        // predefined field order
        await TableSection.getSortButton(page).click();
        await fieldOrderOption(page, "Alphabetical order").click();
        await verifyAndCloseToast(page, "Failed to update field order");

        // custom field order
        await moveDnDKitPointer(TableSection.getSortableField(page, "ID"), {
          vertical: 50,
        });
        await verifyAndCloseToast(page, "Failed to update field order");
        await button(TableSection.get(page), "Done").click();

        if (area === "data studio") {
          await TableSection.clickDetailsTab(page);
        }

        // sync
        if (area === "data studio") {
          await TableSection.getActionsMenuButton(page).click();
          await popover(page).getByText("Re-sync schema", { exact: true }).click();
        } else {
          await TableSection.getSyncOptionsButton(page).click();
          await button(modal(page), "Sync table schema").click();
        }
        await verifyAndCloseToast(page, "Failed to start sync");

        if (area === "data studio") {
          await TableSection.getActionsMenuButton(page).click();
          await popover(page)
            .getByText("Re-scan field values", { exact: true })
            .click();
        } else {
          await button(modal(page), "Re-scan table").click();
        }
        await verifyAndCloseToast(page, "Failed to start scan");

        if (area === "data studio") {
          await TableSection.getActionsMenuButton(page).click();
          await popover(page)
            .getByText("Discard cached field values", { exact: true })
            .click();
        } else {
          await button(modal(page), "Discard cached field values").click();
        }
        await verifyAndCloseToast(page, "Failed to discard values");

        if (area === "admin") {
          await page.keyboard.press("Escape");
        }

        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }

        // field name
        await typeAppend(TableSection.getFieldNameInput(page, "Quantity"), "a");
        await blurFocusedElement(page);
        await verifyAndCloseToast(page, "Failed to update name of Quantity");

        // field description
        await typeAppend(
          TableSection.getFieldDescriptionInput(page, "Quantity"),
          "a",
        );
        await blurFocusedElement(page);
        await verifyAndCloseToast(
          page,
          "Failed to update description of Quantity",
        );

        // field section
        await TableSection.clickField(page, "Quantity");

        // name
        await typeAppend(FieldSection.getNameInput(page), "a");
        await blurFocusedElement(page);
        await verifyAndCloseToast(page, "Failed to update name of Quantity");

        // description
        await typeAppend(FieldSection.getDescriptionInput(page), "a");
        await blurFocusedElement(page);
        await verifyAndCloseToast(
          page,
          "Failed to update description of Quantity",
        );

        // coercion strategy
        await clickCoercionToggle(page);
        await popover(page)
          .getByText("UNIX seconds → Datetime", { exact: true })
          .click();
        await verifyAndCloseToast(page, "Failed to enable casting for Quantity");

        // semantic type
        await FieldSection.getSemanticTypeInput(page).click();
        await popover(page).getByText("Score", { exact: true }).click();
        await verifyAndCloseToast(
          page,
          "Failed to update semantic type of Quantity",
        );

        // visibility
        await FieldSection.getVisibilityInput(page).click();
        await popover(page)
          .getByText("Only in detail views", { exact: true })
          .click();
        await verifyAndCloseToast(
          page,
          "Failed to update visibility of Quantity",
        );

        // filtering
        await FieldSection.getFilteringInput(page).click();
        await popover(page).getByText("Search box", { exact: true }).click();
        await verifyAndCloseToast(page, "Failed to update filtering of Quantity");

        // display values
        await FieldSection.getDisplayValuesInput(page).click();
        await popover(page).getByText("Custom mapping", { exact: true }).click();
        await verifyAndCloseToast(
          page,
          "Failed to update display values of Quantity",
        );

        // JSON unfolding
        // navigating away would cause onChange to be triggered in
        // InputBlurChange and TextareaBlurChange components, so new undos will
        // appear - this makes this test flaky, so we navigate with page reload
        // instead. (#85: pinned to the schema — see the header.)
        await visit(page, {
          databaseId: WRITABLE_DB_ID,
          schemaId: WRITABLE_PUBLIC_SCHEMA_ID,
        });
        await TablePicker.getTable(page, "Many Data Types").click();
        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }
        await TableSection.clickField(page, "Json");
        await FieldSection.getUnfoldJsonInput(page).click();
        await popover(page).getByText("No", { exact: true }).click();
        await verifyAndCloseToast(
          page,
          "Failed to disable JSON unfolding for Json",
        );

        // formatting
        await TablePicker.getDatabase(page, "Sample Database").click();
        await TablePicker.getTable(page, "Orders").click();
        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }
        await TableSection.clickField(page, "Quantity");
        await typeAppend(FieldSection.getPrefixInput(page), "5");
        await blurFocusedElement(page);
        await verifyAndCloseToast(page, "Failed to update formatting of Quantity");

        // preview section

        // table preview
        await FieldSection.getPreviewButton(page).click();
        await PreviewSection.get(page).scrollIntoViewIfNeeded();
        await expect(
          PreviewSection.get(page).getByText("Something went wrong"),
        ).toBeVisible();

        // object detail preview
        await PreviewSection.getPreviewTypeInput(page)
          .getByText("Detail", { exact: true })
          .click();
        await expect(
          PreviewSection.get(page).getByText("Something went wrong"),
        ).toBeVisible();
      });
    });

    test.describe("Undos", () => {
      test.skip(
        !QA_DB_ENABLED,
        "@external — needs the writable QA postgres (postgres-sample, " +
          "writable_db on :5404) and the postgres-writable snapshot " +
          "(set PW_QA_DB_ENABLED=1)",
      );

      test.beforeEach(async ({ mb }) => {
        await restoreWritable(mb);
      });

      test("allows to undo every action", async ({ page }) => {
        test.setTimeout(300_000);

        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });

        // table section
        if (area === "data studio") {
          await TableSection.clickDetailsTab(page);
        }

        // name
        await typeAppend(TableSection.getNameInput(page), "a");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Table name updated");
        await expect(TableSection.getNameInput(page)).toHaveValue("Orders");

        // description
        await typeAppend(TableSection.getDescriptionInput(page), "a");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Table description updated");
        await expect(TableSection.getDescriptionInput(page)).toHaveValue(
          "Confirmed Sample Company orders for a product, from a user.",
        );

        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }

        // predefined field order
        await TableSection.getSortButton(page).click();
        await fieldOrderOption(page, "Alphabetical order").click();
        await verifyToastAndUndo(page, "Field order updated");
        await expect(fieldOrderRadio(page, "database")).toBeChecked();

        // custom field order
        await moveDnDKitPointer(TableSection.getSortableField(page, "ID"), {
          vertical: 50,
        });
        await verifyToastAndUndo(page, "Field order updated");
        await expect(fieldOrderRadio(page, "database")).toBeChecked();
        await button(TableSection.get(page), "Done").click();

        // field name
        await typeAppend(TableSection.getFieldNameInput(page, "Quantity"), "a");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Name of Quantity updated");
        await expect(
          TableSection.getFieldNameInput(page, "Quantity"),
        ).toHaveValue("Quantity");

        // field description
        await typeAppend(
          TableSection.getFieldDescriptionInput(page, "Quantity"),
          "a",
        );
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Description of Quantity updated");
        await expect(
          TableSection.getFieldDescriptionInput(page, "Quantity"),
        ).toHaveValue("Number of products bought.");

        // field section
        await TableSection.clickField(page, "Quantity");

        // name
        await typeAppend(FieldSection.getNameInput(page), "a");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Name of Quantity updated");
        await expect(FieldSection.getNameInput(page)).toHaveValue("Quantity");

        // description
        await typeAppend(FieldSection.getDescriptionInput(page), "a");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Description of Quantity updated");
        await expect(FieldSection.getDescriptionInput(page)).toHaveValue(
          "Number of products bought.",
        );

        // coercion strategy
        await clickCoercionToggle(page);
        await popover(page)
          .getByText("UNIX seconds → Datetime", { exact: true })
          .click();
        await verifyToastAndUndo(page, "Casting enabled for Quantity");
        await expect(FieldSection.getCoercionToggle(page)).not.toBeChecked();

        // semantic type
        await FieldSection.getSemanticTypeInput(page).click();
        await popover(page).getByText("Score", { exact: true }).click();
        await verifyToastAndUndo(page, "Semantic type of Quantity updated");
        await expect(FieldSection.getSemanticTypeInput(page)).toHaveValue(
          "Quantity",
        );

        // visibility
        await FieldSection.getVisibilityInput(page).click();
        await popover(page)
          .getByText("Only in detail views", { exact: true })
          .click();
        await verifyToastAndUndo(page, "Visibility of Quantity updated");
        await expect(FieldSection.getVisibilityInput(page)).toHaveValue(
          "Everywhere",
        );

        // filtering
        await FieldSection.getFilteringInput(page).click();
        await popover(page).getByText("Search box", { exact: true }).click();
        await verifyToastAndUndo(page, "Filtering of Quantity updated");
        await expect(FieldSection.getFilteringInput(page)).toHaveValue(
          "A list of all values",
        );

        // display values
        await FieldSection.getDisplayValuesInput(page).click();
        await popover(page).getByText("Custom mapping", { exact: true }).click();
        // `H.modal().should("be.visible")`. PORTING: a Mantine Modal ROOT
        // reports hidden to Playwright while open; `modal()` here resolves to
        // the inner `[role=dialog][aria-modal=true]` content node, which does
        // report visible — checked, not assumed.
        await expect(modal(page)).toBeVisible();
        await button(modal(page), "Close").click();
        await verifyToastAndUndo(page, "Display values of Quantity updated");
        await expect(FieldSection.getDisplayValuesInput(page)).toHaveValue(
          "Use original value",
        );

        // custom mapping
        await FieldSection.getDisplayValuesInput(page).click();
        await popover(page).getByText("Custom mapping", { exact: true }).click();
        await verifyAndCloseToast(page, "Display values of Quantity updated");
        // `cy.findByDisplayValue("0").clear().type("XYZ").blur()` — resolved to
        // a POSITIONAL locator first: React syncs the `value` attribute, so an
        // attribute-matching locator invalidates itself the instant `clear()`
        // empties the field (the placeholder-trap family, measured on shared-3).
        const mappingInput = await remappingInputWithAttrValue(page, "0");
        await replaceValue(mappingInput, "XYZ");
        await blurFocusedElement(page);
        await button(modal(page), "Save").click();
        await verifyToastAndUndo(page, "Display values of Quantity updated");

        await button(FieldSection.get(page), "Edit mapping").click();
        await expect(await findByDisplayValue(modal(page), "0")).toBeVisible();
        await expectNoDisplayValue(page, "XYZ");
        await button(modal(page), "Close").click();

        // foreign key
        await TableSection.clickField(page, "User ID");
        await FieldSection.getDisplayValuesInput(page).click();
        await popover(page).getByText("Use foreign key", { exact: true }).click();
        await verifyToastAndUndo(page, "Display values of User ID updated");
        await expect(FieldSection.getDisplayValuesInput(page)).toHaveValue(
          "Use original value",
        );

        // JSON unfolding
        // The in-test DB switch via picker races the picker re-render, so the
        // "Error handling" sibling's fresh-visit anchor is used here too.
        // (#85: pinned to the schema — see the header.)
        await visit(page, {
          databaseId: WRITABLE_DB_ID,
          schemaId: WRITABLE_PUBLIC_SCHEMA_ID,
        });
        await TablePicker.getTable(page, "Many Data Types").click();
        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }
        await TableSection.clickField(page, "Json");
        await FieldSection.getUnfoldJsonInput(page).click();
        await popover(page).getByText("No", { exact: true }).click();
        await verifyToastAndUndo(page, "JSON unfolding disabled for Json");
        await expect(FieldSection.getUnfoldJsonInput(page)).toHaveValue("Yes");

        // formatting
        // Same fresh-visit anchor as the Many Data Types switch above.
        await visit(page, { databaseId: SAMPLE_DB_ID });
        await TablePicker.getTable(page, "Orders").click();
        if (area === "data studio") {
          await TableSection.clickFieldsTab(page);
        }
        await TableSection.clickField(page, "Quantity");

        // prefix (ChartSettingInput)
        await typeAppend(FieldSection.getPrefixInput(page), "5");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Formatting of Quantity updated");
        await expect(FieldSection.getPrefixInput(page)).toHaveValue("");

        // multiply by number (ChartSettingInputNumeric)
        await typeAppend(FieldSection.getMultiplyByNumberInput(page), "5");
        await blurFocusedElement(page);
        await verifyToastAndUndo(page, "Formatting of Quantity updated");
        await expect(FieldSection.getMultiplyByNumberInput(page)).toHaveValue("");

        // mini bar chart (ChartSettingToggle)
        await clickMiniBarChartToggle(page);
        await verifyToastAndUndo(page, "Formatting of Quantity updated");
        await expect(FieldSection.getMiniBarChartToggle(page)).not.toBeChecked();
      });
    });
  });
}

/**
 * `cy.findByDisplayValue(v).should("not.exist")` scoped to the open modal.
 * testing-library's `findByDisplayValue` reads the element's *current* value
 * PROPERTY, so this scans properties rather than the `value` attribute — the
 * two diverge exactly where shared-3's placeholder trap lives.
 */
async function expectNoDisplayValue(page: Page, value: string) {
  const controls = modal(page).locator("input, textarea, select");
  await expect
    .poll(async () => {
      const count = await controls.count();
      for (let index = 0; index < count; index++) {
        if ((await controls.nth(index).inputValue()) === value) {
          return true;
        }
      }
      return false;
    })
    .toBe(false);
}
