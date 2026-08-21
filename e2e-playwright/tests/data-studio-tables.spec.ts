/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-studio-tables.cy.spec.ts
 *
 * Data Studio > library > tables: the table pane header (rename, "view in
 * query builder", unpublish), the overview page (breadcrumbs, table data,
 * description, the properties sidebar), the fields page (rename a field,
 * close the field/preview panels) and the dependencies graph.
 *
 * Port notes:
 * - The library is an EE token feature; the whole describe skips without
 *   `pro-self-hosted` (PORTING rule 7). Snowplow is not involved anywhere in
 *   this spec — nothing stubbed, nothing captured.
 * - `nameInput()` / `descriptionInput()` / the field name input are all
 *   EditableText **textareas**: `fill()` does not mark them dirty, so the
 *   edits go through click + select-all + `pressSequentially` + `blur()`
 *   (`replaceEditableText`). `blur()` rather than `Tab` — EditableText's root
 *   `onKeyDown` re-focuses on every non-Enter key.
 * - `moreMenuViewTable` strips the menu item's `target` attribute (upstream's
 *   `.invoke("removeAttr", "target")`) so the table opens in this tab.
 * - `cy.icon("repository").should("be.visible")` is an ANY-of-set assertion in
 *   chai-jquery (PORTING rule 3) → `.filter({ visible: true }).first()`.
 * - `should("not.exist")` → `toHaveCount(0)`; these are genuine unmount
 *   assertions (the panels are on screen immediately before), not
 *   absence-inside-a-mount-lag.
 * - `cy.findByText(/question/)` inside the dependency graph is a substring
 *   regex; `.first()` mirrors Cypress's first-match click.
 *
 * Dividends: none — see findings-inbox/data-studio-tables.md.
 */
import { resolveToken } from "../support/api";
import {
  FieldSection,
  PreviewSection,
  TableSection,
} from "../support/data-model";
import {
  dataStudioBreadcrumbs,
  libraryPage,
  tableItem,
  visitLibrary,
} from "../support/data-studio-library";
import {
  allTableItems,
  clickMoreMenuViewTable,
  fieldSectionCloseButton,
  fieldSectionNameInput,
  replaceEditableText,
  tableDependenciesTab,
  tableDescriptionInput,
  tableDescriptionSidebar,
  tableDescriptionText,
  tableFieldsTab,
  tableMoreMenu,
  tableNameInput,
  tableOverviewTab,
  visitTableFieldsPage,
  visitTableOverviewPage,
} from "../support/data-studio-tables";
import {
  DependencyGraph,
  waitForBackfillComplete,
} from "../support/dependency-graph";
import { createQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { tableHeaderColumn } from "../support/notebook";
import { undoToastList } from "../support/organization";
import { queryVisualizationRoot } from "../support/rows";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { icon, modal, popover, queryBuilderHeader } from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;

const hasToken = Boolean(resolveToken("pro-self-hosted"));

test.describe("scenarios > data studio > library > tables", () => {
  test.skip(!hasToken, "requires the pro-self-hosted EE token (library)");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("header", () => {
    test("should be able to change the name", async ({ page, mb }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });

      await visitTableOverviewPage(page, ORDERS_ID);
      await expect(tableNameInput(page)).toHaveValue("Orders");

      await replaceEditableText(tableNameInput(page), "Orders changed");

      await expect(
        undoToastList(page).filter({ hasText: /Table name updated/ }).first(),
      ).toBeVisible();
    });

    test("should be able to view the table in the query builder", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });

      await visitTableOverviewPage(page, ORDERS_ID);
      await tableMoreMenu(page).click();
      await clickMoreMenuViewTable(page, popover(page));

      const header = queryBuilderHeader(page);
      // ANY-of-set visibility (PORTING rule 3).
      await expect(
        icon(header, "repository").filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(header.getByText("Data", { exact: true })).toBeVisible();
      await expect(header.getByText("Orders", { exact: true })).toBeVisible();
    });

    test("should be able to unpublish a table", async ({ page, mb }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });

      await visitLibrary(page);
      await tableItem(page, "Orders").click();
      await tableMoreMenu(page).click();
      await popover(page).getByText("Unpublish", { exact: true }).click();
      await modal(page)
        .getByText("Unpublish this table", { exact: true })
        .click();

      // Cypress's allTableItems() chains off `findByTestId("library-page")`,
      // which fails if the library page is not rendered — keep that implicit
      // assertion, otherwise the count-0 check would pass vacuously on any
      // other route.
      await expect(libraryPage(page)).toBeVisible();
      await expect(allTableItems(page)).toHaveCount(0);
    });
  });

  test.describe("overview", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
      await visitTableOverviewPage(page, ORDERS_ID);
    });

    test("should show page breadcrumbs", async ({ page }) => {
      const breadcrumbs = dataStudioBreadcrumbs(page);
      await expect(
        breadcrumbs.getByRole("link", { name: "Library", exact: true }),
      ).toBeVisible();
      await expect(
        breadcrumbs.getByRole("link", { name: "Data", exact: true }),
      ).toBeVisible();
      await expect(
        breadcrumbs.getByText("Orders", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to view the table data", async ({ page }) => {
      const root = queryVisualizationRoot(page);
      await expect(root.getByText("Subtotal", { exact: true })).toBeVisible();
      await expect(root.getByText("110.93", { exact: true })).toBeVisible();
    });

    test("should be able to change the description", async ({ page }) => {
      await expect(tableDescriptionText(page)).toContainText(
        "orders for a product",
      );
      await tableDescriptionText(page).click();

      await replaceEditableText(
        tableDescriptionInput(page),
        "Description changed",
      );

      await expect(
        undoToastList(page)
          .filter({ hasText: /Table description updated/ })
          .first(),
      ).toBeVisible();
    });

    test("should be able to view additional properties in sidebar", async ({
      page,
    }) => {
      const sidebar = tableDescriptionSidebar(page);

      await expect(
        sidebar.getByText("Entity type", { exact: true }),
      ).toBeVisible();

      await expect(
        sidebar.getByText("Last edited at", { exact: true }),
      ).toBeVisible();

      await expect(sidebar.getByText("Database", { exact: true })).toBeVisible();
      await expect(
        sidebar.getByText("Sample Database", { exact: true }),
      ).toBeVisible();

      await expect(sidebar.getByText("Source", { exact: true })).toBeVisible();
      await expect(
        sidebar.getByPlaceholder("Select a data source", { exact: true }),
      ).toHaveValue("Ingested");

      await expect(sidebar.getByText("Owner", { exact: true })).toBeVisible();
      await expect(
        sidebar.getByPlaceholder("Pick someone, or type an email", {
          exact: true,
        }),
      ).toHaveValue("No owner");

      await expect(sidebar.getByText("Fields", { exact: true })).toBeVisible();

      await expect(
        sidebar.getByText("Dependents", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("fields", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
    });

    test("should be able to rename fields", async ({ page }) => {
      await visitTableOverviewPage(page, ORDERS_ID);
      await expect(tableHeaderColumn(page, "Total")).toBeVisible();

      await tableFieldsTab(page).click();
      await TableSection.clickField(page, "Total");

      await replaceEditableText(fieldSectionNameInput(page), "Total changed");

      await expect(
        undoToast(page).filter({ hasText: /Name of Total updated/ }).first(),
      ).toBeVisible();

      await tableOverviewTab(page).click();
      await expect(tableHeaderColumn(page, "Total changed")).toBeVisible();
    });

    test("should allow you to close field details and preview panels", async ({
      page,
    }) => {
      await visitTableFieldsPage(page, ORDERS_ID);
      await TableSection.clickField(page, "Total");
      await FieldSection.getPreviewButton(page).click();

      // Gate the "not.exist" assertions below on the panels actually being
      // open first — otherwise they would pass on a preview that never
      // rendered. (Control-checked: both are visible here.)
      await expect(FieldSection.get(page)).toBeVisible();
      await expect(PreviewSection.get(page)).toBeVisible();

      await fieldSectionCloseButton(page).click();

      await expect(PreviewSection.get(page)).toHaveCount(0);
      await expect(FieldSection.get(page)).toHaveCount(0);

      await TableSection.clickField(page, "Discount");
      await expect(PreviewSection.get(page)).toHaveCount(0);
      await expect(FieldSection.get(page)).toHaveCount(1);
    });
  });

  test.describe("dependencies", () => {
    test("should be able to view dependencies for a table", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
      await createQuestion(mb.api, {
        name: "Test question",
        query: { "source-table": ORDERS_ID },
      });
      await waitForBackfillComplete(mb.api);

      await visitTableOverviewPage(page, ORDERS_ID);
      await tableDependenciesTab(page).click();

      const graph = DependencyGraph.graph(page);
      await expect(graph.getByText("Orders", { exact: true })).toBeVisible();
      await graph
        .getByText(/question/)
        .first()
        .click();

      await expect(
        DependencyGraph.dependencyPanel(page).getByText("Test question", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });
});
