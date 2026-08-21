/**
 * Playwright port of e2e/test/scenarios/data-model/data-model-shared-3.cy.spec.ts
 *
 * Collision checks (PORTING "same-basename siblings"):
 * - The source directory holds only `.ts` specs (data-model-shared-1..4); there
 *   is no `data-model-shared-3.cy.spec.js` twin. `e2e/test-component/` holds
 *   only `embedding-sdk/`, so no basename pair there either.
 * - `tests/` had no `data-model-shared-3.spec.ts`. Its landed relatives
 *   (`data-model-shared-1`, `data-model-shared-2`, `data-model-permissions`,
 *   `admin-datamodel`, `datamodel-data-studio`) are all different sources.
 * - Support module name is the conventional `support/data-model-shared-3.ts`
 *   (no deviation).
 *
 * Inherited work: a cancelled agent left `support/data-model-shared-3.ts` with
 * no spec. Every getter in it was re-derived from
 * e2e/support/helpers/e2e-datamodel-helpers.ts lines 441-527 before adoption
 * and all seven matched. Two real gaps were found and closed: it had NO
 * `verifyAndCloseToast` replacement (the spec calls it 6×, and the shared
 * `data-model.ts:235` one is the measured strict-mode + force-click bug), and
 * no `many_data_types` fixture for the `@external` describe. Its
 * `expandPublicSchemaIfPresent` was dropped — see the #85 note below for why
 * a click-based expand cannot work against a virtualized 29-schema tree.
 *
 * Infra tier (checked per describe, not per tag):
 * - "Display values" (7 tests) and "Formatting" (4 tests) run against the
 *   Sample Database and need NO container. One of them
 *   ("should allow 'Custom mapping' null values") adds a SQLite database, which
 *   is a built-in driver reading the repo-root `resources/sqlite-fixture.db` —
 *   local fixture, correctly untagged upstream, no infra gate.
 * - "Unfold JSON" (3 tests) is `@external` and the tag is ACCURATE: it restores
 *   the `postgres-writable` snapshot and drives `many_data_types` on the
 *   writable QA postgres (`postgres-sample` container, writable_db on :5404).
 *   Gated on PW_QA_DB_ENABLED.
 *   Note the `WRITABLE_DB_ID` red herring does NOT apply here: it is the
 *   literal `2`, which is the read-only "QA Postgres12" sample only under the
 *   `postgres-12` snapshot. This describe restores `postgres-writable`, under
 *   which database 2 genuinely IS the writable container — so these tests are
 *   fully exposed to FINDINGS #85 contamination.
 * - 14 tests × 2 areas (`admin`, `data studio`) = 28 cases; 22 execute,
 *   6 gate-skip with PW_QA_DB_ENABLED unset.
 *
 * Port notes:
 * - Snowplow: 4 tests assert real `metadata_edited` events, so PORTING rule 6's
 *   no-op stub would gut them. `installSnowplowCapture` captures at the browser
 *   boundary — no container. `H.resetSnowplow` → `capture.reset()`;
 *   `H.enableTracking` is subsumed by the capture's settings override.
 *   GAP: `H.expectNoBadSnowplowEvents` asks snowplow-micro for Iglu *schema
 *   validation* failures; this degrades to the structural check, so "the FE
 *   emits a field the schema rejects" is NOT caught here.
 * - Dropped, never-awaited intercepts: `schemas`, `schema`, `dataset`,
 *   `fieldValues`, `updateFieldOrder`, `updateTables`, `updateTable`, and the
 *   per-area `databases` re-registrations. The awaited ones (`metadata`,
 *   `updateField`, `sync_schema`) are ported as `waitForResponse` registered
 *   before the triggering action. `updateFieldValues` / `updateFieldDimension`
 *   are ported as `responseQueue` POPS, not waits: `cy.wait("@alias")` consumes
 *   responses that already fired, and selecting "Custom mapping" fires the
 *   dimension POST at SELECTION time, so upstream's post-Save
 *   `cy.wait("@updateFieldDimension")` is satisfied retroactively. A literal
 *   `waitForResponse` there deadlocked 30s (measured, run 1).
 *   `updateFieldSpy` is ported as a passive `page.on("request")` recorder.
 * - `H.undoToast()` is multi-element whenever two edits land together, so
 *   `should("contain.text", …)` is a chai-jquery CONCATENATION — ported as a
 *   join over all toasts (`expectToastsContainText`), never `.first()`, which
 *   would silently strengthen it.
 * - `click({ force: true })` on the disabled combobox option → `dispatchEvent`.
 *   The option carries `pointer-events: none` (upstream says so in a comment),
 *   so Playwright's force-click would move the real mouse and hit whatever is
 *   topmost there. Cypress's `{force:true}` dispatches at the resolved element.
 *   Same reasoning for the two "it's behind a modal" toast closes.
 * - 🔴 FINDINGS #85 accommodation, documented because it IS a deviation: the
 *   shared writable postgres carries 29 schemas (measured: `Domestic`, `Wild`,
 *   `Schema A`..`Schema Z`, `public`) where a clean container has 1. Upstream's
 *   `visit({ databaseId })` relies on the picker AUTO-EXPANDING the sole
 *   schema; with 29 it does not, and `public` sorts last so the virtualized
 *   tree never renders it — a click-based expand cannot reach a node that is
 *   not in the DOM. The port navigates straight to `schemaId` instead, which
 *   reaches the identical end state upstream's auto-expand produces on a clean
 *   container. It also sidesteps the second #85 mechanism: `visitDataModel`'s
 *   default `schema` wait gates on `GET /api/database/:id/schema/:name`, which
 *   only fires ON auto-expand, so the databaseId-only form burns 30s on a
 *   correctly-rendered page.
 * - `resyncDatabase({ tables })` is not sufficient on its own (PORTING): a
 *   stale `initial_sync_status: "complete"` row satisfies it instantly.
 *   `waitForUnfoldedJsonField` anchors on a field the FRESH sync must have
 *   produced, matched on `nfc_path` `["json","a"]` — the backend field NAME is
 *   `"json → a"`, probed against the running backend. (`json.a` is the FE's
 *   rendering, which the spec asserts but which never appears in the API.)
 * - Date-asserting test ("map FK to date fields") pins sample-DB values with a
 *   -07:00 offset — run with TZ=US/Pacific to match CI.
 */
import type { Page } from "@playwright/test";

import { openOrdersTable, openReviewsTable, openTable } from "../support/ad-hoc-question";
import { resolveToken } from "../support/api";
import {
  SAMPLE_DB_SCHEMA_ID,
  TablePicker,
  TableSection,
  areas,
  replaceValue,
  verifyObjectDetailPreview,
  verifyTablePreview,
  visitDataModel,
  waitForFieldUpdate,
} from "../support/data-model";
import { button, getTriggeredFromArea } from "../support/data-model-shared-2";
import {
  FieldSection,
  expectNoToast,
  expectNoTooltip,
  expectToastsContainText,
  expectTooltipContainsText,
  expectTooltipHasText,
  expectTooltipVisible,
  fieldDimensionQueue,
  fieldPutRecorder,
  fieldValuesQueue,
  getDatabaseSchemas,
  getDatabaseTableIds,
  namePrefix,
  remappingInputWithAttrValue,
  resetManyDataTypesTable,
  type ResponseQueue,
  verifyAndCloseToast,
  waitForSyncSchema,
  waitForUnfoldedJsonField,
} from "../support/data-model-shared-3";
import { assertIsEllipsified, assertIsNotEllipsified } from "../support/dashboard-card-repros";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { addSqliteDatabase, getDatabaseFields } from "../support/homepage";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { icon, modal, popover, visitQuestion } from "../support/ui";
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

const { ORDERS_ID, ORDERS, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

/** Resolved, never guessed (PORTING: "NEVER guess a fixture id"). */
function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (candidate) => candidate.name === name,
  );
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

const ORDERS_QUESTION_ID = findQuestionId("Orders");

const QA_DB_ENABLED = process.env.PW_QA_DB_ENABLED === "1";

/** See the #85 note in the header. */
const WRITABLE_PUBLIC_SCHEMA_ID = `${WRITABLE_DB_ID}:public`;

const FK_TOOLTIP =
  'You can only use foreign key mapping for fields with the semantic type set to "Foreign Key"';
const CUSTOM_MAPPING_TOOLTIP =
  'You can only use custom mapping for numerical fields with filtering set to "A list of all values"';
const REMAP_NAME_HINT =
  "You might want to update the field name to make sure it still makes sense based on your remapping choices.";

for (const area of areas) {
  test.describe(`data model > ${area}`, () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    const getTriggeredFrom = getTriggeredFromArea(area);
    const visit = (page: Page, options?: Parameters<typeof visitDataModel>[2]) =>
      visitDataModel(page, area, options);

    let capture: SnowplowCapture;
    // Cypress registers these intercepts in the beforeEach and every
    // `cy.wait("@alias")` pops one — including responses that already fired.
    // Register the queues at the same point (see `responseQueue`).
    let dimensions: ResponseQueue;
    let fieldValues: ResponseQueue;

    test.beforeEach(async ({ page, mb }) => {
      dimensions = fieldDimensionQueue(page);
      fieldValues = fieldValuesQueue(page);
      await mb.restore();
      // Must run before the first navigation (the tracker is built during app
      // bootstrap). Also plays the part of the "Field section" beforeEach's
      // H.resetSnowplow + H.enableTracking.
      capture = await installSnowplowCapture(page, mb.baseUrl);
      capture.reset();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test.describe("Field section", () => {
      test.afterEach(() => {
        // Structural stand-in for H.expectNoBadSnowplowEvents (see header).
        expectNoBadSnowplowEvents(capture);
      });

      test.describe("Behavior", () => {
        test.describe("Display values", () => {
          test("should show tooltips explaining why remapping options are disabled", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: PRODUCTS_ID,
              fieldId: PRODUCTS.TITLE,
            });

            await FieldSection.getDisplayValuesInput(page).click();

            // foreign key mapping
            const fkOption = popover(page).getByRole("option", {
              name: /Use foreign key/,
            });
            await expect(fkOption).toHaveAttribute(
              "data-combobox-disabled",
              "true",
            );
            await icon(fkOption, "info").hover();
            await expectTooltipContainsText(page, FK_TOOLTIP);

            // custom mapping
            const customOption = popover(page).getByRole("option", {
              name: /Custom mapping/,
            });
            await expect(customOption).toHaveAttribute(
              "data-combobox-disabled",
              "true",
            );
            await icon(customOption, "info").hover();
            await expectTooltipContainsText(page, CUSTOM_MAPPING_TOOLTIP);

            // clicking disabled option does not change the value.
            // Upstream: `.click({ force: true })` "try to click it despite
            // pointer-events: none" — dispatchEvent is the faithful port
            // (a Playwright force-click would hit whatever is topmost).
            await page
              .getByRole("option", { name: /Custom mapping/ })
              .dispatchEvent("click");
            await expect(FieldSection.getDisplayValuesInput(page)).toHaveValue(
              "Use original value",
            );
          });

          test("should let you change to 'Use foreign key' and change the target for field with fk", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.PRODUCT_ID,
            });

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Product ID",
              values: ["14", "123", "105", "94", "132"],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 2,
              row: ["Product ID", "14"],
            });

            await FieldSection.getDisplayValuesInput(page).click();
            await popover(page).getByText("Use foreign key", { exact: true }).click();
            await popover(page).getByText("Title", { exact: true }).click();
            await dimensions.pop();
            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "display_values",
              triggered_from: getTriggeredFrom(),
            });
            await expectToastsContainText(
              page,
              "Display values of Product ID updated",
            );

            // verify preview
            await verifyObjectDetailPreview(page, {
              rowNumber: 2,
              row: ["Product ID", "Awesome Concrete Shoes"],
            });
            await verifyTablePreview(page, {
              column: "Product ID",
              values: [
                "Awesome Concrete Shoes",
                "Mediocre Wooden Bench",
                "Fantastic Wool Shirt",
                "Awesome Bronze Plate",
                "Sleek Steel Table",
              ],
            });

            await page.reload();
            const displayValues = FieldSection.getDisplayValuesInput(page);
            await displayValues.scrollIntoViewIfNeeded();
            await expect(displayValues).toBeVisible();
            await expect(displayValues).toHaveValue("Use foreign key");

            const fkTarget = FieldSection.getDisplayValuesFkTargetInput(page);
            await expect(fkTarget).toBeVisible();
            await expect(fkTarget).toHaveValue("Title");
          });

          test("should allow 'Custom mapping' null values", async ({
            page,
            mb,
          }) => {
            const remappedNullValue = "nothin";

            const databaseId = await addSqliteDatabase(mb.api);
            const fields = await getDatabaseFields(mb.api, databaseId);
            const tableIds = await getDatabaseTableIds(mb.api, databaseId);
            const NUM = fields.NUMBER_WITH_NULLS?.NUM;
            const NUMBER_WITH_NULLS_ID = tableIds.NUMBER_WITH_NULLS;
            expect(NUM, "NUMBER_WITH_NULLS.NUM field id").toBeDefined();
            expect(
              NUMBER_WITH_NULLS_ID,
              "NUMBER_WITH_NULLS table id",
            ).toBeDefined();

            const [schemaName] = await getDatabaseSchemas(mb.api, databaseId);

            await visit(page, {
              databaseId,
              schemaId: `${databaseId}:${schemaName}`,
              tableId: NUMBER_WITH_NULLS_ID,
              fieldId: NUM,
            });

            // Change `null` to custom mapping
            const displayValues = FieldSection.getDisplayValuesInput(page);
            await displayValues.scrollIntoViewIfNeeded();
            await displayValues.click();
            await popover(page).getByText("Custom mapping", { exact: true }).click();
            await fieldValues.pop();
            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "display_values",
              triggered_from: getTriggeredFrom(),
            });
            await verifyAndCloseToast(page, "Display values of Num updated");

            await expect(modal(page)).toBeVisible();
            const nullInput = await remappingInputWithAttrValue(page, "null");
            await replaceValue(nullInput, remappedNullValue);
            await button(modal(page), "Save").click();
            await fieldValues.pop();
            await expectToastsContainText(page, "Display values of Num updated");

            // Make sure custom mapping appears in QB
            await openTable(page, {
              database: databaseId,
              table: NUMBER_WITH_NULLS_ID,
            });
            // `findAllByRole(...).should("be.visible")` is an ANY-OF assertion
            // in chai-jquery (PORTING rule 3), not a first-match one.
            await expect(
              page
                .getByRole("gridcell", { name: remappedNullValue, exact: true })
                .filter({ visible: true })
                .first(),
            ).toBeVisible();
          });

          test("should correctly show remapped column value", async ({
            page,
          }) => {
            await visit(page, { databaseId: SAMPLE_DB_ID });

            // edit "Product ID" column in "Orders" table
            await TablePicker.getTable(page, "Orders").click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }
            await TableSection.clickField(page, "Product ID");

            // remap its original value to use foreign key
            await FieldSection.getDisplayValuesInput(page).click();
            await popover(page).getByText("Use foreign key", { exact: true }).click();
            await popover(page).getByText("Title", { exact: true }).click();
            await dimensions.pop();
            await expectToastsContainText(
              page,
              "Display values of Product ID updated",
            );

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            await verifyObjectDetailPreview(page, {
              rowNumber: 2,
              row: ["Product ID", "Awesome Concrete Shoes"],
            });
            await verifyTablePreview(page, {
              column: "Product ID",
              values: [
                "Awesome Concrete Shoes",
                "Mediocre Wooden Bench",
                "Fantastic Wool Shirt",
                "Awesome Bronze Plate",
                "Sleek Steel Table",
              ],
            });

            const hint = FieldSection.get(page).getByText(REMAP_NAME_HINT, {
              exact: true,
            });
            await hint.scrollIntoViewIfNeeded();
            await expect(hint).toBeVisible();

            // Name of the product should be displayed instead of its ID
            await openOrdersTable(page);
            await expect(
              page.getByRole("gridcell", {
                name: "Awesome Concrete Shoes",
                exact: true,
              }),
            ).toBeVisible();
          });

          test("should correctly apply and display custom remapping for numeric values", async ({
            page,
          }) => {
            // this test also indirectly reproduces metabase#12771
            const customMap: Record<string, string> = {
              1: "Awful",
              2: "Unpleasant",
              3: "Meh",
              4: "Enjoyable",
              5: "Perfecto",
            };

            await visit(page, { databaseId: SAMPLE_DB_ID });
            // edit "Rating" values in "Reviews" table
            await TablePicker.getTable(page, "Reviews").click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }
            await TableSection.clickField(page, "Rating");

            // apply custom remapping for "Rating" values 1-5
            await FieldSection.getDisplayValuesInput(page).click();
            await popover(page).getByText("Custom mapping", { exact: true }).click();
            await fieldValues.pop();
            await verifyAndCloseToast(page, "Display values of Rating updated");

            const dialog = modal(page);
            await expect(
              dialog.getByText(REMAP_NAME_HINT, { exact: true }),
            ).toBeVisible();

            for (const [key, value] of Object.entries(customMap)) {
              // findByDisplayValue scoped to the modal (PORTING: page-wide use
              // resolves a stale nth() index when the page re-renders).
              const input = await findByDisplayValue(dialog, key);
              await replaceValue(input, value);
            }

            await button(dialog, "Save").click();
            await fieldValues.pop();
            await dimensions.pop();
            await expectToastsContainText(
              page,
              "Display values of Rating updated",
            );

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Rating",
              values: [
                "Perfecto",
                "Enjoyable",
                "Perfecto",
                "Enjoyable",
                "Perfecto",
              ],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 3,
              row: ["Rating", "Perfecto"],
            });

            // Numeric ratings should be remapped to custom strings
            await openReviewsTable(page);
            for (const rating of Object.values(customMap)) {
              const cell = page.getByText(rating, { exact: true }).first();
              await cell.scrollIntoViewIfNeeded();
              await expect(cell).toBeVisible();
            }
          });

          test("should allow 'Custom mapping' option only for 'Search box' filtering type (metabase#16322)", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: REVIEWS_ID,
              fieldId: REVIEWS.RATING,
            });

            let fieldUpdate = waitForFieldUpdate(page);
            await FieldSection.getFilteringInput(page).click();
            await popover(page).getByText("Search box", { exact: true }).click();
            await fieldUpdate;
            await verifyAndCloseToast(page, "Filtering of Rating updated");

            await FieldSection.getDisplayValuesInput(page).click();
            const customOption = popover(page).getByRole("option", {
              name: /Custom mapping/,
            });
            await expect(customOption).toHaveAttribute(
              "data-combobox-disabled",
              "true",
            );
            await icon(customOption, "info").hover();
            await expectTooltipVisible(page);
            await expectTooltipHasText(page, CUSTOM_MAPPING_TOOLTIP);

            // close popover by clicking on element inside panel
            await FieldSection.get(page)
              .getByText("Field settings", { exact: true })
              .click();

            // open popover
            fieldUpdate = waitForFieldUpdate(page);
            await FieldSection.getFilteringInput(page).click();
            await popover(page)
              .getByText("A list of all values", { exact: true })
              .click();
            await fieldUpdate;
            await verifyAndCloseToast(page, "Filtering of Rating updated");

            await FieldSection.getDisplayValuesInput(page).click();
            await expect(
              popover(page).getByRole("option", { name: /Custom mapping/ }),
            ).not.toHaveAttribute("data-combobox-disabled");
          });

          test("should allow to map FK to date fields (metabase#7108)", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.USER_ID,
            });

            await FieldSection.getDisplayValuesInput(page).click();
            await popover(page).getByText("Use foreign key", { exact: true }).click();
            await dimensions.pop();
            await verifyAndCloseToast(page, "Display values of User ID updated");

            await FieldSection.getDisplayValuesFkTargetInput(page).click();

            const birthDate = popover(page).getByText("Birth Date", {
              exact: true,
            });
            await birthDate.scrollIntoViewIfNeeded();
            await expect(birthDate).toBeVisible();

            const createdAt = popover(page).getByText("Created At", {
              exact: true,
            });
            await createdAt.scrollIntoViewIfNeeded();
            await expect(createdAt).toBeVisible();
            await createdAt.click();
            await dimensions.pop();
            await expectToastsContainText(
              page,
              "Display values of User ID updated",
            );

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "User ID",
              values: [
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
                "2026-10-07T01:34:35.462-07:00",
              ],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 1,
              row: ["User ID", "2026-10-07T01:34:35.462-07:00"],
            });

            await visitQuestion(page, ORDERS_QUESTION_ID);
            await expect(
              // 1st data row, 2nd column (User ID)
              page.getByTestId("cell-data").nth(10),
            ).toHaveText("2026-10-07T01:34:35.462-07:00");
          });
        });

        test.describe("Unfold JSON", () => {
          test.skip(
            !QA_DB_ENABLED,
            "@external — needs the writable QA postgres (postgres-sample, " +
              "writable_db on :5404) and the postgres-writable snapshot " +
              "(set PW_QA_DB_ENABLED=1)",
          );

          test.beforeEach(async ({ mb }) => {
            await mb.restore("postgres-writable");
            await resetManyDataTypesTable();
            await mb.signInAsAdmin();
            await resyncDatabase(mb.api, {
              dbId: WRITABLE_DB_ID,
              tables: ["many_data_types"],
            });
            // `tables` alone can be satisfied instantly by a stale
            // initial_sync_status row (PORTING) — anchor on a field only the
            // fresh sync could have produced.
            await waitForUnfoldedJsonField(mb.api, WRITABLE_DB_ID);
          });

          test("should let you enable/disable 'Unfold JSON' for JSON columns", async ({
            page,
            mb,
          }) => {
            await visit(page, {
              databaseId: WRITABLE_DB_ID,
              schemaId: WRITABLE_PUBLIC_SCHEMA_ID,
            });
            await TablePicker.getTable(page, "Many Data Types").click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }

            // json is unfolded initially and shows prefix
            const jsonA = TableSection.getField(page, "Json → A");
            await jsonA.scrollIntoViewIfNeeded();
            await expect(jsonA).toBeVisible();
            const jsonAPrefix = namePrefix(jsonA);
            await jsonAPrefix.scrollIntoViewIfNeeded();
            await expect(jsonAPrefix).toBeVisible();
            await expect(jsonAPrefix).toHaveText("Json:");

            // shows prefix in field section
            await TableSection.clickField(page, "Json → A");
            const sectionPrefix = namePrefix(FieldSection.get(page));
            await sectionPrefix.scrollIntoViewIfNeeded();
            await expect(sectionPrefix).toBeVisible();
            await expect(sectionPrefix).toHaveText("Json:");

            const rawName = FieldSection.getRawName(page);
            await rawName.scrollIntoViewIfNeeded();
            await expect(rawName).toBeVisible();
            await expect(rawName).toHaveText("json.a");

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Json → A",
              values: ["10", "10"],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 1,
              row: ["Json → A", "10"],
            });

            // show prefix in table section when sorting
            await TableSection.getSortButton(page).click();
            const sortingPrefix = namePrefix(
              TableSection.getField(page, "Json → A"),
            );
            await expect(sortingPrefix).toBeVisible();
            await expect(sortingPrefix).toHaveText("Json:");
            await button(TableSection.get(page), "Done").click();
            await TableSection.clickField(page, "Json");

            const unfoldInput = FieldSection.getUnfoldJsonInput(page);
            await expect(unfoldInput).toHaveValue("Yes");
            const fieldUpdate = waitForFieldUpdate(page);
            await unfoldInput.click();
            await popover(page).getByText("No", { exact: true }).click();
            await fieldUpdate;
            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "json_unfolding",
              triggered_from: getTriggeredFrom(),
            });
            await expectToastsContainText(
              page,
              "JSON unfolding disabled for Json",
            );

            // Check setting has persisted
            await page.reload();
            await expect(FieldSection.getUnfoldJsonInput(page)).toHaveValue("No");

            // Sync database
            const syncSchema = waitForSyncSchema(page, WRITABLE_DB_ID);
            await page.goto(`/admin/databases/${WRITABLE_DB_ID}`);
            await button(page, "Sync database schema").click();
            await syncSchema;
            await expect(
              page.getByRole("button", { name: /Sync triggered!/ }),
            ).toBeVisible();

            // The sync is asynchronous; wait until the app DB actually shows
            // json.a gone before reading the picker, or the assertion below
            // would be satisfied by a not-yet-rendered list either way.
            await waitForUnfoldedJsonField(mb.api, WRITABLE_DB_ID, {
              present: false,
            });

            // Check json field is not unfolded
            await visit(page, {
              databaseId: WRITABLE_DB_ID,
              schemaId: WRITABLE_PUBLIC_SCHEMA_ID,
            });
            await TablePicker.getTable(page, "Many Data Types").click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }
            // Anchor on the loaded field list before asserting absence
            // (PORTING: an absence check inside a mount-lag window is vacuous).
            await expect(TableSection.getField(page, "Json")).toBeVisible();
            await expect(TableSection.getField(page, "Json → A")).toHaveCount(0);
          });

          test("should let you change the name of JSON-unfolded columns (metabase#55563)", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: WRITABLE_DB_ID,
              schemaId: WRITABLE_PUBLIC_SCHEMA_ID,
            });
            await TablePicker.getTable(page, "Many Data Types").click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }
            await TableSection.clickField(page, "Json → A");

            const nameInput = TableSection.getFieldNameInput(page, "Json → A");
            const fieldUpdate = waitForFieldUpdate(page);
            // Capture the element before typing: the row's accessible name
            // changes as you type, so re-resolving it to blur deadlocks.
            await replaceValue(nameInput, "A");
            await nameInput.blur();
            await fieldUpdate;

            await FieldSection.getPreviewButton(page).click();

            await expect(FieldSection.getNameInput(page)).toHaveValue("A");
            const sectionPrefix = namePrefix(FieldSection.get(page));
            await sectionPrefix.scrollIntoViewIfNeeded();
            await expect(sectionPrefix).toBeVisible();
            await expect(sectionPrefix).toHaveText("Json:");
            await verifyTablePreview(page, {
              column: "A",
              values: ["10", "10"],
            });
          });

          test("should smartly truncate prefix name", async ({ page }) => {
            const shortPrefix = "Short prefix";
            const longPrefix = "Legendarily long column prefix";

            await visit(page, {
              databaseId: WRITABLE_DB_ID,
              schemaId: WRITABLE_PUBLIC_SCHEMA_ID,
            });
            await TablePicker.getTable(page, "Many Data Types").click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }
            await TableSection.clickField(page, "Json → A");

            // should not truncate short prefixes
            let nameInput = TableSection.getFieldNameInput(page, "Json");
            let fieldUpdate = waitForFieldUpdate(page);
            await replaceValue(nameInput, shortPrefix);
            await nameInput.blur();
            await fieldUpdate;

            // in field section
            let sectionPrefix = namePrefix(FieldSection.get(page));
            await expect(sectionPrefix).toHaveText(`${shortPrefix}:`);
            await assertIsNotEllipsified(sectionPrefix);
            await sectionPrefix.hover();
            await expectNoTooltip(page);

            // in table section
            let jsonDPrefix = namePrefix(TableSection.getField(page, "Json → D"));
            await expect(jsonDPrefix).toHaveText(`${shortPrefix}:`);
            await assertIsNotEllipsified(jsonDPrefix);
            await jsonDPrefix.hover();
            await expectNoTooltip(page);

            // should truncate long prefixes
            nameInput = TableSection.getFieldNameInput(page, shortPrefix);
            fieldUpdate = waitForFieldUpdate(page);
            await replaceValue(nameInput, longPrefix);
            await nameInput.blur();
            await fieldUpdate;

            // in field section
            sectionPrefix = namePrefix(FieldSection.get(page));
            await expect(sectionPrefix).toHaveText(`${longPrefix}:`);
            await assertIsEllipsified(sectionPrefix);
            await sectionPrefix.scrollIntoViewIfNeeded();
            await sectionPrefix.hover();
            await expectTooltipVisible(page);
            await expectTooltipHasText(page, longPrefix);

            // hide tooltip
            await FieldSection.getDescriptionInput(page).hover();
            await expectNoTooltip(page);

            // in table section
            jsonDPrefix = namePrefix(TableSection.getField(page, "Json → D"));
            await jsonDPrefix.scrollIntoViewIfNeeded();
            await expect(jsonDPrefix).toHaveText(`${longPrefix}:`);
            await jsonDPrefix.hover();
            await expectTooltipVisible(page);
            await expectTooltipHasText(page, longPrefix);
          });
        });
      });

      test.describe("Formatting", () => {
        test("should let you to change field formatting", async ({ page }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          const fieldUpdate = waitForFieldUpdate(page);
          await FieldSection.getStyleInput(page).click();
          await popover(page).getByText("Percent", { exact: true }).click();
          await fieldUpdate;
          await expectUnstructuredSnowplowEvent(capture, {
            event: "metadata_edited",
            event_detail: "formatting",
            triggered_from: getTriggeredFrom(),
          });
          await verifyAndCloseToast(page, "Formatting of Quantity updated");

          // verify preview
          await FieldSection.getPreviewButton(page).click();
          await verifyTablePreview(page, {
            column: "Quantity",
            values: ["200%", "300%", "200%", "600%", "500%"],
          });
          await verifyObjectDetailPreview(page, {
            rowNumber: 8,
            row: ["Quantity", "200%"],
          });
        });

        test("should only show currency formatting options for currency fields", async ({
          page,
        }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.DISCOUNT,
          });

          let columnSettings = page.getByTestId("column-settings");
          await columnSettings.scrollIntoViewIfNeeded();
          await expect(
            columnSettings.getByText("Unit of currency", { exact: true }),
          ).toBeVisible();
          await expect(
            columnSettings.getByText("Currency label style", { exact: true }),
          ).toBeVisible();

          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          columnSettings = page.getByTestId("column-settings");
          await columnSettings.scrollIntoViewIfNeeded();

          // shouldn't show currency settings by default for quantity field.
          // `cy.findByText(...)` carries an implicit EXISTENCE requirement that
          // a bare toBeHidden() would drop (PORTING), so assert both.
          const unitOfCurrency = columnSettings.getByText("Unit of currency", {
            exact: true,
          });
          const labelStyle = columnSettings.getByText("Currency label style", {
            exact: true,
          });
          await expect(unitOfCurrency).toHaveCount(1);
          await expect(unitOfCurrency).toBeHidden();
          await expect(labelStyle).toHaveCount(1);
          await expect(labelStyle).toBeHidden();

          const fieldUpdate = waitForFieldUpdate(page);
          await columnSettings.locator("#number_style").click();

          // if you change the style to currency, currency settings should appear
          await popover(page).getByText("Currency", { exact: true }).click();
          await fieldUpdate;
          await verifyAndCloseToast(page, "Formatting of Quantity updated");

          columnSettings = page.getByTestId("column-settings");
          await expect(
            columnSettings.getByText("Unit of currency", { exact: true }),
          ).toBeVisible();
          await expect(
            columnSettings.getByText("Currency label style", { exact: true }),
          ).toBeVisible();
        });

        test("should save and obey field prefix formatting settings", async ({
          page,
        }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          const prefix = FieldSection.getPrefixInput(page);
          await prefix.scrollIntoViewIfNeeded();
          const fieldUpdate = waitForFieldUpdate(page);
          // cy.type() clicks its subject first, then types (PORTING).
          await prefix.click();
          await prefix.pressSequentially("about ");
          await prefix.blur();
          await fieldUpdate;
          await verifyAndCloseToast(page, "Formatting of Quantity updated");

          // verify preview
          await FieldSection.getPreviewButton(page).click();
          await verifyTablePreview(page, {
            column: "Quantity",
            values: ["about 2", "about 3", "about 2", "about 6", "about 5"],
          });
          await verifyObjectDetailPreview(page, {
            rowNumber: 8,
            row: ["Quantity", "about 2"],
          });

          // verify viz
          await visitQuestionAdhoc(page, {
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["sum", ["field", ORDERS.QUANTITY, null]]],
              },
              type: "query",
            },
          });
          await expect(
            page
              .getByTestId("visualization-root")
              .getByText("about 69,540", { exact: true }),
          ).toBeVisible();
        });

        test("should not call PUT field endpoint when prefix or suffix has not been changed (SEM-359)", async ({
          page,
        }) => {
          // Port of cy.intercept("PUT", "/api/field/*", cy.spy()) — install
          // before the navigation, matching where Cypress registers it.
          const fieldPuts = fieldPutRecorder(page);

          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          await FieldSection.getPrefixInput(page).focus();
          await FieldSection.getPrefixInput(page).blur();
          expect(fieldPuts.urls).toEqual([]);
          await expectNoToast(page);

          await FieldSection.getSuffixInput(page).focus();
          await FieldSection.getSuffixInput(page).blur();
          expect(fieldPuts.urls).toEqual([]);
          await expectNoToast(page);
        });
      });
    });
  });
}
