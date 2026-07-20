/**
 * Playwright port of e2e/test/scenarios/data-model/data-model-shared-2.cy.spec.ts
 *
 * Collision checks (PORTING "same-basename siblings"):
 * - The source directory holds only `.ts` specs (data-model-shared-1..4); there
 *   is no `data-model-shared-2.cy.spec.js` twin.
 * - `tests/` had no `data-model-shared-2.spec.ts`. Its landed relatives —
 *   `data-model-shared-1`, `datamodel-data-studio`, `datamodel-segments`,
 *   `admin-datamodel`, `data-model-permissions` — are all different sources.
 *
 * Infra tier (checked per describe, not per tag — see notes):
 * - 21 of the 23 tests (×2 areas = 42 of 46 cases) run against the Sample
 *   Database only and need NO container.
 * - 2 tests need QA databases and BOTH carry the `@external` tag upstream
 *   (unlike data-model-shared-1, whose mysql-8 test was untagged):
 *     · "should show an error with links to other fields with 'Entity name'
 *        semantic type" → Writable Postgres12 (`postgres-sample` container,
 *        writable_db on :5404) + `many_data_types`.
 *     · "should be able to select and update a field in a database without
 *        schemas" → QA MySQL8 (`mysql-sample` container, :3304).
 *   Both are gated on PW_QA_DB_ENABLED.
 *
 * Port notes:
 * - Snowplow: 4 tests assert real `metadata_edited` events, so PORTING rule 6's
 *   no-op stub would gut them. They use `installSnowplowCapture`
 *   (support/search-snowplow.ts) which captures at the browser boundary — no
 *   container. `H.resetSnowplow` → `capture.reset()`, `H.enableTracking` is
 *   subsumed by the capture's settings override.
 *   GAP: `H.expectNoBadSnowplowEvents` asks snowplow-micro for Iglu *schema
 *   validation* failures; the port degrades it to the structural check
 *   (`expectNoBadSnowplowEvents(capture)`), so "the FE emits a field the schema
 *   rejects" is NOT caught here. Same recorded gap as search-snowplow.
 * - Dropped, never-awaited intercepts: `schemas`, `schema`, `fieldValues`
 *   (as an alias — it IS used as a request *counter*, see below),
 *   `updateFieldOrder`, `updateFieldValues`, `updateFieldDimension`,
 *   `updateTables`, `updateTable`, `updateFieldSpy`, and the per-area
 *   `databases` re-registrations. The awaited ones (`updateField`, `metadata`,
 *   `dataset`) are ported as `waitForResponse` / response counters.
 * - `cy.wait(["@metadata", "@metadata"])` → a retroactive response counter
 *   polled to >= 2 (N concurrent `waitForResponse`s on one predicate all
 *   resolve on the first hit).
 * - `cy.get("@fieldValues.all").should("have.length", 0)` → a passive
 *   `page.on("request")` recorder asserted at the end.
 * - `cy.get(toast).should("contain.text", …)` on a multi-element subject is a
 *   CONCATENATION in chai-jquery, so where upstream leaves an earlier toast on
 *   screen the port joins all toasts (`expectToastsContainText`) rather than
 *   `.first()`, which would silently strengthen it.
 * - `cy.realPress("Escape")` is preceded by parking the mouse: a Playwright
 *   click leaves the real cursor over the button, and a tooltip rendered under
 *   it swallows the first Escape (PORTING wave-9).
 * - QA-DB accommodation, documented because it is a real deviation: the shared
 *   writable postgres container carries ~29 schemas / 34 tables of debris
 *   (FINDINGS #85), so `public` is no longer the DB's only schema and the
 *   picker does not auto-expand it. The Entity-Name test expands "public"
 *   explicitly *when schema nodes are present*; on a clean container (CI) the
 *   single schema renders no node and the branch is skipped, so the test is
 *   unchanged there.
 */
import type { Page } from "@playwright/test";

import { resetTestTable } from "../support/actions-on-dashboards";
import { openOrdersTable, openTable } from "../support/ad-hoc-question";
import { resolveToken } from "../support/api";
import {
  FieldSection as SharedFieldSection,
  PreviewSection,
  SAMPLE_DB_SCHEMA_ID,
  TablePicker,
  TableSection,
  areas,
  verifyObjectDetailPreview,
  verifyTablePreview,
  visitDataModel,
  waitForFieldUpdate,
} from "../support/data-model";
import {
  FieldSection,
  backgroundColor,
  button,
  clickAway,
  clickCoercionToggle,
  clientRect,
  expectToastsContainText,
  fieldValuesRecorder,
  getTriggeredFromArea,
  queryMetadataCounter,
  scrollElementTo,
  verifyAndCloseToast,
} from "../support/data-model-shared-2";
import { icon } from "../support/dashboard-cards";
import { expect, test } from "../support/fixtures";
import { miniPicker, tableHeaderColumn } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { modal, popover } from "../support/ui";

const { ORDERS_ID, ORDERS, FEEDBACK_ID, FEEDBACK, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

const COERCED_DATE = "December 31, 1969, 4:00 PM";

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

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      // installSnowplowCapture must run before the first navigation (the
      // tracker is built during app bootstrap). It also plays the part of
      // H.resetSnowplow + H.enableTracking from the "Field section" beforeEach.
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

      test.describe("Name and description", () => {
        test("should allow changing the field name", async ({ page }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          const nameInput = FieldSection.getNameInput(page);
          const fieldUpdate = waitForFieldUpdate(page);
          await nameInput.click();
          await nameInput.press("ControlOrMeta+A");
          await nameInput.press("Backspace");
          await nameInput.pressSequentially("New tax");
          await nameInput.blur();
          await fieldUpdate;
          await verifyAndCloseToast(page, "Name of Tax updated");
          await expect(
            TableSection.getFieldNameInput(page, "New tax"),
          ).toBeAttached();

          // verify preview
          await TableSection.clickField(page, "New tax");
          await FieldSection.getPreviewButton(page).click();
          await verifyTablePreview(page, {
            column: "New tax",
            values: ["2.07", "6.1", "2.9", "6.01", "7.03"],
          });
          await verifyObjectDetailPreview(page, {
            rowNumber: 4,
            row: ["New tax", "2.07"],
          });

          // verify viz
          await openOrdersTable(page);
          await tableHeaderColumn(page, "New tax").scrollIntoViewIfNeeded();
          await expect(tableHeaderColumn(page, "New tax")).toBeVisible();
          await expect(tableHeaderColumn(page, "Tax")).toHaveCount(0);
        });

        test("should allow changing the field description", async ({ page }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TOTAL,
          });

          const descriptionInput = FieldSection.getDescriptionInput(page);
          const fieldUpdate = waitForFieldUpdate(page);
          await descriptionInput.click();
          await descriptionInput.press("ControlOrMeta+A");
          await descriptionInput.press("Backspace");
          await descriptionInput.pressSequentially("New description");
          await descriptionInput.blur();
          await fieldUpdate;
          await verifyAndCloseToast(page, "Description of Total updated");
          await expect(
            TableSection.getFieldDescriptionInput(page, "Total"),
          ).toHaveValue("New description");

          // verify preview
          await TableSection.clickField(page, "Total");
          await FieldSection.getPreviewButton(page).click();
          await verifyTablePreview(page, {
            column: "Total",
            description: "New description",
            values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
          });

          await page.goto(
            `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
          );
          await expect(page.getByText("Total", { exact: true })).toBeVisible();
          await expect(
            page.getByText("New description", { exact: true }),
          ).toBeVisible();
        });

        test("should remap FK display value from field section", async ({
          page,
        }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });

          const nameInput = FieldSection.getNameInput(page);
          const fieldUpdate = waitForFieldUpdate(page);
          await nameInput.click();
          await nameInput.press("ControlOrMeta+A");
          await nameInput.press("Backspace");
          await nameInput.pressSequentially("Remapped Product ID");
          // upstream commits with cy.realPress("Tab")
          await page.keyboard.press("Tab");
          await fieldUpdate;
          await verifyAndCloseToast(page, "Name of Product ID updated");

          // verify preview
          await FieldSection.getPreviewButton(page).click();
          await verifyTablePreview(page, {
            column: "Remapped Product ID",
            values: ["14", "123", "105", "94", "132"],
          });
          await verifyObjectDetailPreview(page, {
            rowNumber: 2,
            row: ["Remapped Product ID", "14"],
          });

          // verify viz
          await openOrdersTable(page, { limit: 5 });
          await tableHeaderColumn(
            page,
            "Remapped Product ID",
          ).scrollIntoViewIfNeeded();
          await expect(
            tableHeaderColumn(page, "Remapped Product ID"),
          ).toBeVisible();
        });
      });

      test.describe("Field values", () => {
        test("should allow to sync table schema, re-scan table, and discard cached field values", async ({
          page,
        }) => {
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: PRODUCTS_ID,
            fieldId: PRODUCTS.CATEGORY,
          });
          await FieldSection.getFieldValuesButton(page).click();

          // re-scan field
          const dialog = modal(page);
          await button(dialog, "Re-scan field").click();
          await expect(button(dialog, "Re-scan field")).toHaveCount(0);
          await expect(button(dialog, "Scan triggered!")).toBeVisible();
          await expect(button(dialog, "Scan triggered!")).toHaveCount(0);
          await expect(button(dialog, "Re-scan field")).toBeVisible();

          // discard cached field values
          await button(dialog, "Discard cached field values").click();
          await expect(
            button(dialog, "Discard cached field values"),
          ).toHaveCount(0);
          await expect(button(dialog, "Discard triggered!")).toBeVisible();
          await expect(button(dialog, "Discard triggered!")).toHaveCount(0);
          await expect(
            button(dialog, "Discard cached field values"),
          ).toBeVisible();

          // Park the real cursor before Escape — a tooltip rendered under it
          // would swallow the key (PORTING wave-9).
          await page.mouse.move(2, 2);
          await page.keyboard.press("Escape");
          await expect(modal(page)).toHaveCount(0);
        });

        test("should not automatically re-fetch field values when they are discarded unless 'Custom mapping' is used (metabase#62626)", async ({
          page,
        }) => {
          // Port of `cy.get("@fieldValues.all").should("have.length", 0)`:
          // the recorder is installed before the navigation, exactly where the
          // Cypress beforeEach registered the intercept.
          const fieldValues = fieldValuesRecorder(page);

          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: PRODUCTS_ID,
            fieldId: PRODUCTS.CATEGORY,
          });

          await FieldSection.getFieldValuesButton(page).click();
          const dialog = modal(page);
          await button(dialog, "Discard cached field values").click();
          await expect(button(dialog, "Discard triggered!")).toBeVisible();
          await expect(button(dialog, "Discard triggered!")).toHaveCount(0);

          expect(fieldValues.urls).toEqual([]);
        });
      });

      test.describe("Data", () => {
        test.describe("Coercion strategy", () => {
          test("should allow you to cast a field to a data type", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: FEEDBACK_ID,
              fieldId: FEEDBACK.RATING,
            });

            // Ensure that Coercion strategy has been humanized (metabase#44723)
            await FieldSection.getCoercionToggle(page).scrollIntoViewIfNeeded();
            await clickCoercionToggle(page);
            await expect(popover(page)).not.toContainText("Coercion");

            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("UNIX seconds → Datetime", { exact: true })
              .click();
            await fieldUpdate;
            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "type_casting",
              triggered_from: getTriggeredFrom(),
            });
            await verifyAndCloseToast(page, "Casting enabled for Rating");

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Rating",
              values: [
                COERCED_DATE,
                COERCED_DATE,
                COERCED_DATE,
                COERCED_DATE,
                COERCED_DATE,
              ],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 4,
              row: ["Rating", COERCED_DATE],
            });

            // verify viz
            await openTable(page, {
              database: SAMPLE_DB_ID,
              table: FEEDBACK_ID,
            });
            // `cy.findAllByTestId(...).contains(text)` yields the FIRST match,
            // so `have.length.greaterThan 0` is just "at least one exists".
            await expect(
              page
                .getByTestId("cell-data")
                .filter({ hasText: new RegExp(COERCED_DATE) })
                .first(),
            ).toBeAttached();
          });

          test("should allow to enable, change, and disable coercion strategy", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: FEEDBACK_ID,
              fieldId: FEEDBACK.RATING,
            });

            // show error when strategy not chosen after toggling
            await clickCoercionToggle(page);
            await clickAway(page);
            await expect(
              SharedFieldSection.get(page).getByText(
                "To enable casting, please select a data type",
                { exact: true },
              ),
            ).toBeVisible();

            // enable casting
            await FieldSection.getCoercionInput(page).click();
            const enabled = waitForFieldUpdate(page);
            await popover(page)
              .getByText("UNIX nanoseconds → Datetime", { exact: true })
              .click();
            await enabled;
            await verifyAndCloseToast(page, "Casting enabled for Rating");

            // verify preview
            // ideally we should change the formatting to show smaller values
            // and assert those, but we can't set formatting on a coerced field
            // (metabase#60483)
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Rating",
              values: [
                COERCED_DATE,
                COERCED_DATE,
                COERCED_DATE,
                COERCED_DATE,
                COERCED_DATE,
              ],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 4,
              row: ["Rating", COERCED_DATE],
            });

            // change casting
            await FieldSection.getCoercionInput(page).click();
            const changed = waitForFieldUpdate(page);
            await popover(page)
              .getByText("UNIX seconds → Datetime", { exact: true })
              .click();
            await changed;
            await verifyAndCloseToast(page, "Casting updated for Rating");

            // disable casting
            const disabled = waitForFieldUpdate(page);
            await clickCoercionToggle(page);
            await disabled;
            await verifyAndCloseToast(page, "Casting disabled for Rating");

            // enable casting
            await clickCoercionToggle(page);
            const reenabled = waitForFieldUpdate(page);
            await popover(page)
              .getByText("UNIX seconds → Datetime", { exact: true })
              .click();
            await reenabled;
            await verifyAndCloseToast(page, "Casting enabled for Rating");

            await openTable(page, {
              database: SAMPLE_DB_ID,
              table: FEEDBACK_ID,
            });
            await expect(
              page
                .getByTestId("cell-data")
                .filter({ hasText: new RegExp(COERCED_DATE) })
                .first(),
            ).toBeAttached();
          });
        });
      });

      test.describe("Metadata", () => {
        test.describe("Semantic type", () => {
          test("should allow to change the type to 'No semantic type' (metabase#59052)", async ({
            page,
          }) => {
            const metadata = queryMetadataCounter(page);
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.PRODUCT_ID,
            });
            await metadata.waitFor(2);

            const semanticType = FieldSection.getSemanticTypeInput(page);
            await expect(semanticType).toHaveValue("Foreign Key");
            // it should allow to just type to search (metabase#59052).
            // cy.type() clicks its subject first, which is what opens (and
            // clears the search of) the Mantine Select.
            await semanticType.click();
            await semanticType.pressSequentially("no sema");
            await expect(
              popover(page).getByText("No semantic type", { exact: true }),
            ).toBeVisible();

            const fieldUpdate = waitForFieldUpdate(page);
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Enter");
            await fieldUpdate;

            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "semantic_type_change",
              triggered_from: getTriggeredFrom(),
            });
            await expectToastsContainText(
              page,
              "Semantic type of Product ID updated",
            );

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            const cells = PreviewSection.get(page).getByTestId("cell-data");
            await expect(cells).toHaveCount(6);
            // FKs get blueish background
            await expect
              .poll(() => backgroundColor(cells.nth(1)))
              .toBe("rgba(0, 0, 0, 0)");

            metadata.reset();
            await page.reload();
            await metadata.waitFor(1);

            await expect(FieldSection.getSemanticTypeInput(page)).toHaveValue(
              "No semantic type",
            );
          });

          test("should allow to change the type to 'Foreign Key' and choose the target field (metabase#59052)", async ({
            page,
          }) => {
            const metadata = queryMetadataCounter(page);
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.QUANTITY,
            });

            const semanticType = FieldSection.getSemanticTypeInput(page);
            await expect(semanticType).toHaveValue("Quantity");
            await semanticType.click();
            const typeUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Foreign Key", { exact: true })
              .click();
            await typeUpdate;
            await verifyAndCloseToast(page, "Semantic type of Quantity updated");

            // verify preview
            await FieldSection.getPreviewButton(page).click();
            const cells = PreviewSection.get(page).getByTestId("cell-data");
            await expect(cells).toHaveCount(6);
            // FKs get blueish background
            await expect
              .poll(() => backgroundColor(cells.nth(1)))
              .not.toBe("rgba(0, 0, 0, 0)");

            const fkTarget = FieldSection.getSemanticTypeFkTarget(page);
            await expect(fkTarget).toHaveValue("");
            // it should allow to just type to search (metabase#59052)
            await fkTarget.click();
            await fkTarget.pressSequentially("products");
            await expect(
              popover(page).getByText("Products → ID", { exact: true }),
            ).toBeVisible();

            const fkUpdate = waitForFieldUpdate(page);
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Enter");
            await fkUpdate;
            await expectToastsContainText(
              page,
              "Semantic type of Quantity updated",
            );

            // verify preview
            await expect(cells).toHaveCount(6);
            // FKs get blueish background
            await expect
              .poll(() => backgroundColor(cells.nth(1)))
              .not.toBe("rgba(0, 0, 0, 0)");

            metadata.reset();
            await page.reload();
            await metadata.waitFor(2);

            const reloadedFkTarget =
              FieldSection.getSemanticTypeFkTarget(page);
            // This should not be necessary, but CI consistently fails to
            // scroll into view on mount
            await reloadedFkTarget.scrollIntoViewIfNeeded();
            await expect(reloadedFkTarget).toBeVisible();
            await expect(reloadedFkTarget).toHaveValue("Products → ID");
          });

          test("should allow to change the foreign key target", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.USER_ID,
            });

            const fkTarget = FieldSection.getSemanticTypeFkTarget(page);
            await expect(fkTarget).toHaveValue("People → ID");
            await fkTarget.click();
            await expect(
              popover(page).getByText("Reviews → ID", { exact: true }),
            ).toBeVisible();
            const fkUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Products → ID", { exact: true })
              .click();
            await fkUpdate;
            await expectToastsContainText(
              page,
              "Semantic type of User ID updated",
            );
            await expect(FieldSection.getSemanticTypeFkTarget(page)).toHaveValue(
              "Products → ID",
            );

            await openTable(page, {
              database: SAMPLE_DB_ID,
              table: ORDERS_ID,
              mode: "notebook",
            });
            await icon(page, "join_left_outer").click();
            const picker = miniPicker(page);
            await picker
              .getByText("Sample Database", { exact: true })
              .click();
            const products = picker.getByText("Products", { exact: true });
            // Anchor before clicking — the picker list re-renders under a
            // resolved locator and would click the wrong row.
            await expect(products).toBeVisible();
            await products.click();
            await expect(
              page.getByLabel("Left column", { exact: true }),
            ).toContainText("User ID");
          });

          test("should allow to change the type to 'Currency' and choose the currency (metabase#59052)", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.TAX,
            });

            const semanticType = FieldSection.getSemanticTypeInput(page);
            await expect(semanticType).toHaveValue("No semantic type");
            await semanticType.click();
            const typeUpdate = waitForFieldUpdate(page);
            await popover(page).getByText("Currency", { exact: true }).click();
            await typeUpdate;
            await verifyAndCloseToast(page, "Semantic type of Tax updated");

            // verify preview
            await TableSection.clickField(page, "Tax");
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Tax ($)",
              values: ["2.07", "6.10", "2.90", "6.01", "7.03"],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 4,
              row: ["Tax ($)", "2.07"],
            });

            // change currency
            const currency = FieldSection.getSemanticTypeCurrencyInput(page);
            await currency.scrollIntoViewIfNeeded();
            await expect(currency).toBeVisible();
            await expect(currency).toHaveValue("US Dollar");
            // it should allow to just type to search (metabase#59052)
            await currency.click();
            await currency.pressSequentially("canadian");
            await expect(
              popover(page).getByText("Canadian Dollar", { exact: true }),
            ).toBeVisible();
            const currencyUpdate = waitForFieldUpdate(page);
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Enter");
            await currencyUpdate;
            await verifyAndCloseToast(page, "Semantic type of Tax updated");

            // verify preview
            await verifyTablePreview(page, {
              column: "Tax (CA$)",
              values: ["2.07", "6.10", "2.90", "6.01", "7.03"],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 4,
              row: ["Tax (CA$)", "2.07"],
            });

            // verify viz
            await openOrdersTable(page);
            await expect(
              page.getByText("Tax (CA$)", { exact: true }),
            ).toBeVisible();
          });

          test("should correctly filter out options in Foreign Key picker (metabase#56839)", async ({
            page,
          }) => {
            const metadata = queryMetadataCounter(page);
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.PRODUCT_ID,
            });
            await metadata.waitFor(2);

            const fkTarget = FieldSection.getSemanticTypeFkTarget(page);
            // .focus().clear() — clear() types {selectall}{del}, and cy.type
            // clicks first, which is what opens the dropdown.
            await fkTarget.click();
            await fkTarget.press("ControlOrMeta+A");
            await fkTarget.press("Backspace");
            await expect(popover(page)).toContainText("Orders → ID");
            await expect(popover(page)).toContainText("People → ID");
            await expect(popover(page)).toContainText("Products → ID");
            await expect(popover(page)).toContainText("Reviews → ID");

            // should case-insensitive match field display name.
            // The dropdown is already open and the input focused, so type
            // without re-clicking (a second click would toggle it shut).
            await fkTarget.pressSequentially("id");
            await expect(popover(page)).toContainText("Orders → ID");
            await expect(popover(page)).toContainText("People → ID");
            await expect(popover(page)).toContainText("Products → ID");
            await expect(popover(page)).toContainText("Reviews → ID");

            // should case-insensitive match field description
            await fkTarget.press("ControlOrMeta+A");
            await fkTarget.press("Backspace");
            await fkTarget.pressSequentially("EXT");
            await expect(popover(page)).not.toContainText("Orders → ID");
            await expect(popover(page)).not.toContainText("People → ID");
            await expect(popover(page)).toContainText("Products → ID");
            await expect(popover(page)).toContainText("Reviews → ID");
          });

          test("should not let you change the type to 'Number' (metabase#16781)", async ({
            page,
          }) => {
            const metadata = queryMetadataCounter(page);
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.PRODUCT_ID,
            });
            await metadata.waitFor(2);

            await FieldSection.getSemanticTypeInput(page).click();
            await expect(popover(page)).toContainText("Foreign Key");
            await expect(popover(page)).not.toContainText("Number");
          });

          test("should not overflow the screen on smaller viewports (metabase#56442)", async ({
            page,
          }) => {
            const viewportHeight = 400;

            await page.setViewportSize({
              width: 1280,
              height: viewportHeight,
            });
            await visit(page, { databaseId: SAMPLE_DB_ID });
            const reviews = TablePicker.getTable(page, "Reviews");
            await reviews.scrollIntoViewIfNeeded();
            await reviews.click();
            if (area === "data studio") {
              await TableSection.clickFieldsTab(page);
            }
            await TableSection.clickField(page, "ID");
            await FieldSection.getSemanticTypeInput(page).click();

            await scrollElementTo(popover(page), "top");
            await expect
              .poll(async () =>
                (
                  await clientRect(
                    popover(page).getByText("Entity Key", { exact: true }),
                  )
                ).top,
              )
              .toBeGreaterThan(0);

            await scrollElementTo(popover(page), "bottom");
            await expect
              .poll(async () =>
                (
                  await clientRect(
                    popover(page).getByText("No semantic type", {
                      exact: true,
                    }),
                  )
                ).bottom,
              )
              .toBeLessThan(viewportHeight);
          });

          test(
            "should show an error with links to other fields with 'Entity name' semantic type",
            { tag: "@external" },
            async ({ page, mb }) => {
              test.skip(
                !process.env.PW_QA_DB_ENABLED,
                "Requires the writable postgres QA database (set PW_QA_DB_ENABLED)",
              );

              await mb.restore("postgres-writable");
              await resetTestTable({
                type: "postgres",
                table: "many_data_types",
              });
              await mb.signInAsAdmin();
              await resyncDatabase(mb.api, {
                dbId: WRITABLE_DB_ID,
                tables: ["many_data_types"],
              });

              // `waitFor` overrides the helper's default
              // ["databases","schemas","schema"]: the `schema` fetch only
              // fires when a schema auto-expands, which needs the DB to have
              // exactly ONE schema. The shared writable container has 29
              // (FINDINGS #85), so that wait times out. Both waits below fire
              // on a clean container too, so this is safe in CI.
              await visit(page, {
                databaseId: WRITABLE_DB_ID,
                waitFor: ["databases", "schemas"],
              });

              // FINDINGS #85 accommodation: on the shared (contaminated)
              // writable container `public` is not the only schema, so the
              // picker does not auto-expand it. On a clean container no schema
              // node renders at all and this is a no-op.
              const schemas = TablePicker.getSchemas(page);
              if ((await schemas.count()) > 0) {
                // The tree renders the RAW schema name (`label: schemaName`
                // in useTableLoader.ts) — lowercase "public", not "Public".
                const publicSchema = TablePicker.getSchema(page, "public");
                await publicSchema.scrollIntoViewIfNeeded();
                await publicSchema.click();
              }

              await TablePicker.getTable(page, "Many Data Types").click();
              if (area === "data studio") {
                await TableSection.clickFieldsTab(page);
              }
              await TableSection.clickField(page, "Json → D");
              await FieldSection.getSemanticTypeInput(page).click();
              await popover(page)
                .getByText("Entity Name", { exact: true })
                .click();

              await TableSection.clickField(page, "Text");
              await FieldSection.getSemanticTypeInput(page).click();
              await popover(page)
                .getByText("Entity Name", { exact: true })
                .click();

              const fieldSection = SharedFieldSection.get(page);
              await expect(fieldSection).toContainText(
                "There are other fields with this semantic type: Json: Json → D",
              );
              const jsonLink = fieldSection.getByRole("link", {
                name: "Json: Json → D",
                exact: true,
              });
              await expect(jsonLink).toBeVisible();
              await jsonLink.click();

              await expect(FieldSection.getNameInput(page)).toHaveValue(
                "Json → D",
              );

              await expect(fieldSection).toContainText(
                "There are other fields with this semantic type: Text",
              );
              const textLink = fieldSection.getByRole("link", {
                name: "Text",
                exact: true,
              });
              await expect(textLink).toBeVisible();
              await textLink.click();

              await expect(FieldSection.getNameInput(page)).toHaveValue("Text");
            },
          );
        });
      });

      test.describe("Behavior", () => {
        test.describe("Visibility", () => {
          test("should let you change field visibility to 'Everywhere'", async ({
            page,
            mb,
          }) => {
            await mb.api.put(`/api/field/${ORDERS.TAX}`, {
              visibility_type: "sensitive",
            });
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.TAX,
            });

            const visibility = FieldSection.getVisibilityInput(page);
            await expect(visibility).toHaveValue("Do not include");
            await visibility.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Everywhere", { exact: true })
              .click();
            await fieldUpdate;
            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "visibility_change",
              triggered_from: getTriggeredFrom(),
            });
            await verifyAndCloseToast(page, "Visibility of Tax updated");
            await expect(FieldSection.getVisibilityInput(page)).toHaveValue(
              "Everywhere",
            );

            // verify preview
            await TableSection.clickField(page, "Tax");
            await FieldSection.getPreviewButton(page).click();
            await verifyTablePreview(page, {
              column: "Tax",
              values: ["2.07", "6.1", "2.9", "6.01", "7.03"],
            });
            await verifyObjectDetailPreview(page, {
              rowNumber: 4,
              row: ["Tax", "2.07"],
            });

            // table viz
            await openOrdersTable(page);
            await expect(tableHeaderColumn(page, "Total")).toBeVisible();
            await tableHeaderColumn(page, "Tax").scrollIntoViewIfNeeded();
            await expect(tableHeaderColumn(page, "Tax")).toBeVisible();

            // object detail viz
            await page
              .getByTestId("table-body")
              .getByTestId("cell-data")
              .nth(0)
              .click();
            await expect(
              modal(page).getByText("Tax", { exact: true }),
            ).toBeVisible();
            await expect(
              modal(page).getByText("2.07", { exact: true }),
            ).toBeVisible();
          });

          test("should let you change field visibility to 'Do not include'", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.TAX,
            });

            const visibility = FieldSection.getVisibilityInput(page);
            await expect(visibility).toHaveValue("Everywhere");
            await visibility.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Do not include", { exact: true })
              .click();
            await fieldUpdate;
            await verifyAndCloseToast(page, "Visibility of Tax updated");
            await expect(FieldSection.getVisibilityInput(page)).toHaveValue(
              "Do not include",
            );

            // verify preview. The `cy.get("@dataset.all").should("have.length",
            // 0)` assertion is ported as a passive request recorder installed
            // just before the preview is opened — the hidden field must not
            // run a query.
            const datasets: string[] = [];
            const recordDataset = (request: {
              method(): string;
              url(): string;
            }) => {
              if (
                request.method() === "POST" &&
                new URL(request.url()).pathname === "/api/dataset"
              ) {
                datasets.push(request.url());
              }
            };
            page.on("request", recordDataset);

            await TableSection.clickField(page, "Tax");
            await FieldSection.getPreviewButton(page).click();
            await expect(
              PreviewSection.get(page).getByText("This field is hidden", {
                exact: true,
              }),
            ).toBeAttached();
            expect(datasets).toEqual([]);
            page.off("request", recordDataset);

            await PreviewSection.getPreviewTypeInput(page)
              .getByText("Detail", { exact: true })
              .click();
            await expect(
              PreviewSection.get(page).getByText("Tax", { exact: true }),
            ).toHaveCount(0);

            // table viz
            await openOrdersTable(page);
            await expect(tableHeaderColumn(page, "Total")).toBeVisible();
            await expect(tableHeaderColumn(page, "Tax")).toHaveCount(0);

            // object detail viz
            await page
              .getByTestId("table-body")
              .getByTestId("cell-data")
              .nth(0)
              .click();
            await expect(
              modal(page).getByText("Tax", { exact: true }),
            ).toHaveCount(0);
            await expect(
              modal(page).getByText("2.07", { exact: true }),
            ).toHaveCount(0);
          });

          test("should let you change field visibility to 'Do not include' even if Preview is opened (metabase#61806)", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.TAX,
            });

            await TableSection.clickField(page, "Tax");
            await FieldSection.getPreviewButton(page).click();
            await PreviewSection.get(page)
              .getByText("Filtering", { exact: true })
              .click();
            await expect(
              PreviewSection.get(page).getByTestId("number-filter-picker"),
            ).toBeVisible();

            const visibility = FieldSection.getVisibilityInput(page);
            await expect(visibility).toHaveValue("Everywhere");
            await visibility.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Do not include", { exact: true })
              .click();
            await fieldUpdate;

            await expect(
              PreviewSection.get(page).getByText("This field is hidden", {
                exact: true,
              }),
            ).toBeAttached();
          });

          test("should let you change field visibility to 'Only in detail views'", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.TAX,
            });

            const visibility = FieldSection.getVisibilityInput(page);
            await expect(visibility).toHaveValue("Everywhere");
            await visibility.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Only in detail views", { exact: true })
              .click();
            await fieldUpdate;
            await verifyAndCloseToast(page, "Visibility of Tax updated");
            await expect(FieldSection.getVisibilityInput(page)).toHaveValue(
              "Only in detail views",
            );

            // verify preview
            const datasets: string[] = [];
            const recordDataset = (request: {
              method(): string;
              url(): string;
            }) => {
              if (
                request.method() === "POST" &&
                new URL(request.url()).pathname === "/api/dataset"
              ) {
                datasets.push(request.url());
              }
            };
            page.on("request", recordDataset);

            await TableSection.clickField(page, "Tax");
            await FieldSection.getPreviewButton(page).click();
            await expect(
              PreviewSection.get(page).getByText("This field is hidden", {
                exact: true,
              }),
            ).toBeAttached();
            expect(datasets).toEqual([]);
            page.off("request", recordDataset);

            await verifyObjectDetailPreview(page, {
              rowNumber: 4,
              row: ["Tax", "2.07"],
            });

            // table viz
            await openOrdersTable(page);
            await expect(tableHeaderColumn(page, "Total")).toBeVisible();
            await expect(tableHeaderColumn(page, "Tax")).toHaveCount(0);

            // object detail viz
            await page
              .getByTestId("table-body")
              .getByTestId("cell-data")
              .nth(0)
              .click();
            await expect(
              modal(page).getByText("Tax", { exact: true }),
            ).toBeVisible();
            await expect(
              modal(page).getByText("2.07", { exact: true }),
            ).toBeVisible();
          });

          test(
            "should be able to select and update a field in a database without schemas",
            { tag: "@external" },
            async ({ page, mb }) => {
              test.skip(
                !process.env.PW_QA_DB_ENABLED,
                "Requires the QA MySQL8 database (set PW_QA_DB_ENABLED)",
              );

              await mb.restore("mysql-8");
              await visit(page, {
                databaseId: MYSQL_DB_ID,
                schemaId: MYSQL_DB_SCHEMA_ID,
                tableId: ORDERS_ID,
              });

              if (area === "data studio") {
                await TableSection.clickFieldsTab(page);
              }
              await TableSection.clickField(page, "Tax");
              await FieldSection.getVisibilityInput(page).click();
              const fieldUpdate = waitForFieldUpdate(page);
              await popover(page)
                .getByText("Do not include", { exact: true })
                .click();
              await fieldUpdate;
              await verifyAndCloseToast(page, "Visibility of Tax updated");
              await expect(FieldSection.getVisibilityInput(page)).toHaveValue(
                "Do not include",
              );
            },
          );
        });

        test.describe("Filtering", () => {
          test("should let you change filtering to 'Search box'", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.QUANTITY,
            });

            const filtering = FieldSection.getFilteringInput(page);
            await expect(filtering).toHaveValue("A list of all values");
            await filtering.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Search box", { exact: true })
              .click();
            await fieldUpdate;
            await expectUnstructuredSnowplowEvent(capture, {
              event: "metadata_edited",
              event_detail: "filtering_change",
              triggered_from: getTriggeredFrom(),
            });
            await verifyAndCloseToast(page, "Filtering of Quantity updated");

            // verify preview
            await TableSection.clickField(page, "Quantity");
            await FieldSection.getPreviewButton(page).click();
            await PreviewSection.getPreviewTypeInput(page)
              .getByText("Filtering", { exact: true })
              .click();
            await expect(
              PreviewSection.get(page).getByPlaceholder("Enter a number"),
            ).toBeVisible();
            await expect(
              button(PreviewSection.get(page), /Add filter/),
            ).toHaveCount(0);

            await page.reload();
            const reloaded = FieldSection.getFilteringInput(page);
            await reloaded.scrollIntoViewIfNeeded();
            await expect(reloaded).toBeVisible();
            await expect(reloaded).toHaveValue("Search box");
          });

          test("should let you change filtering to 'Plain input box'", async ({
            page,
          }) => {
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.QUANTITY,
            });

            const filtering = FieldSection.getFilteringInput(page);
            await expect(filtering).toHaveValue("A list of all values");
            await filtering.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("Plain input box", { exact: true })
              .click();
            await fieldUpdate;
            await verifyAndCloseToast(page, "Filtering of Quantity updated");

            // verify preview
            await TableSection.clickField(page, "Quantity");
            await FieldSection.getPreviewButton(page).click();
            await PreviewSection.getPreviewTypeInput(page)
              .getByText("Filtering", { exact: true })
              .click();
            await expect(
              PreviewSection.get(page).getByPlaceholder("Min"),
            ).toBeVisible();
            await expect(
              PreviewSection.get(page).getByPlaceholder("Max"),
            ).toBeVisible();
            await expect(
              button(PreviewSection.get(page), /Add filter/),
            ).toHaveCount(0);

            await page.reload();
            const reloaded = FieldSection.getFilteringInput(page);
            await reloaded.scrollIntoViewIfNeeded();
            await expect(reloaded).toBeVisible();
            await expect(reloaded).toHaveValue("Plain input box");
          });

          test("should let you change filtering to 'A list of all values'", async ({
            page,
            mb,
          }) => {
            await mb.api.put(`/api/field/${ORDERS.QUANTITY}`, {
              has_field_values: "none",
            });
            await visit(page, {
              databaseId: SAMPLE_DB_ID,
              schemaId: SAMPLE_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
              fieldId: ORDERS.QUANTITY,
            });

            const filtering = FieldSection.getFilteringInput(page);
            await expect(filtering).toHaveValue("Plain input box");
            await filtering.click();
            const fieldUpdate = waitForFieldUpdate(page);
            await popover(page)
              .getByText("A list of all values", { exact: true })
              .click();
            await fieldUpdate;
            await verifyAndCloseToast(page, "Filtering of Quantity updated");

            // verify preview
            await TableSection.clickField(page, "Quantity");
            await FieldSection.getPreviewButton(page).click();
            await PreviewSection.getPreviewTypeInput(page)
              .getByText("Filtering", { exact: true })
              .click();
            await expect(
              PreviewSection.get(page).getByPlaceholder("Search the list"),
            ).toBeVisible();
            await expect(
              button(PreviewSection.get(page), /Add filter/),
            ).toHaveCount(0);

            await page.reload();
            const reloaded = FieldSection.getFilteringInput(page);
            await reloaded.scrollIntoViewIfNeeded();
            await expect(reloaded).toBeVisible();
            await expect(reloaded).toHaveValue("A list of all values");
          });
        });
      });
    });
  });
}
