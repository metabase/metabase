/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/measures/measures-data-studio.cy.spec.ts
 *
 * Measures management inside the data-studio data-model surface (@EE): list /
 * empty state, creation (with aggregations and implicit joins), editing,
 * deletion, the unsaved-changes guard, revision history, the dependency graph,
 * and read-only access for data analysts.
 *
 * Port notes:
 * - @EE + pro-self-hosted token: activated in beforeEach; the whole describe is
 *   skipped without it (PORTING rule 7). The jar activates it.
 * - Snowplow assertions → no-op stubs (PORTING rule 6; no snowplow-micro in the
 *   spike harness). The UI flows still run; only the event assertions are
 *   stubbed. TODO: wire snowplow-micro to make these real.
 * - cy.intercept(...).as + cy.wait → page.waitForResponse registered before the
 *   triggering action (PORTING rule 2).
 * - cy.findByText/findByLabelText/findByPlaceholderText string args are EXACT
 *   (PORTING rule 1); should("contain"/"contain.text") is a case-sensitive
 *   substring → toContainText.
 * - findByDisplayValue → the imperative input/textarea scan (getByDisplayValue
 *   is missing from this Playwright install's types) — filters-repros helper.
 * - Toast text assertions use .first() (transient-UI duplicate gotcha).
 * - Name edits on the detail page go through click + End + pressSequentially
 *   (EditableText-style field: fill() does not mark it dirty).
 * - DIVIDEND: upstream's deletion test ends with
 *   `verifyMeasureNotInQueryBuilder("Total Revenue")` — a measure that test
 *   never creates, so the assertion is vacuous. Ported as the real assertion
 *   ("Measure to Delete"). See findings-inbox/measures-data-studio.md.
 * - No external DB / email / webhook needed — fully jar-runnable.
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { openTable } from "../support/ad-hoc-question";
import type { MetabaseApi } from "../support/api";
import { resolveToken } from "../support/api";
import { SAMPLE_DB_SCHEMA_ID } from "../support/data-model";
import { DependencyGraph } from "../support/dependency-graph";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import {
  MeasureEditor,
  MeasureList,
  MeasureRevisionHistory,
  createMeasure,
  expectUnstructuredSnowplowEvent,
  getMeasuresBaseUrl,
  resetSnowplow,
  visitDataModelMeasure,
  visitDataStudioMeasures,
  visitDataStudioTable,
  waitForCreateMeasure,
  waitForMetadata,
  waitForUpdateMeasure,
} from "../support/measures-data-studio";
import { undoToast } from "../support/metrics";
import { getNotebookStep, visualize } from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { modal, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

/** Port of NODATA_USER_ID (cypress_sample_instance_data.js). */
const NODATA_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    ({ email }) => email === "nodata@metabase.test",
  );
  if (!user) {
    throw new Error("nodata user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

const hasToken = Boolean(resolveToken("pro-self-hosted"));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of the spec-local createTestMeasure. Returns the new measure's id
 * (Cypress aliased it as `@measureId`; here we return it directly).
 */
async function createTestMeasure(
  api: MetabaseApi,
  opts: {
    name?: string;
    description?: string;
    tableId?: number;
    aggregation?: unknown[];
  } = {},
): Promise<number> {
  const {
    name = "Test Measure",
    description,
    tableId = ORDERS_ID,
    aggregation = ["sum", ["field", ORDERS.TOTAL, null]],
  } = opts;

  const { id } = await createMeasure(api, {
    name,
    description: description ?? null,
    definition: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": tableId,
        aggregation: [aggregation],
      },
    },
  });
  return id;
}

/** Port of the spec-local verifyMeasureInQueryBuilder. */
async function verifyMeasureInQueryBuilder(
  page: Page,
  measureName: string,
  tableId: number = ORDERS_ID,
) {
  await openTable(page, { table: tableId, mode: "notebook" });

  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Summarize", exact: true })
    .click();
  await popover(page).getByText("Measures", { exact: true }).click();
  await popover(page).getByText(measureName, { exact: true }).click();
  await visualize(page);
  await expect(page.getByTestId("scalar-value")).toBeVisible();
}

/** Port of the spec-local verifyMeasureNotInQueryBuilder. */
async function verifyMeasureNotInQueryBuilder(
  page: Page,
  measureName: string,
  tableId: number = ORDERS_ID,
) {
  await openTable(page, { table: tableId, mode: "notebook" });

  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Summarize", exact: true })
    .click();
  await expect(
    popover(page).getByText(measureName, { exact: true }),
  ).toHaveCount(0);
}

test.describe("scenarios > data studio > data model > measures", () => {
  test.skip(
    !hasToken,
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("Measure list", () => {
    test("should show empty state and navigation when no measures exist", async ({
      page,
    }) => {
      await visitDataStudioMeasures(page, ORDERS_ID);

      // verify empty state
      await MeasureList.getEmptyState(page).scrollIntoViewIfNeeded();
      await expect(MeasureList.getEmptyState(page)).toBeVisible();
      await expect(
        MeasureList.get(page).getByText(
          "Create a measure to define a reusable aggregation for this table.",
          { exact: true },
        ),
      ).toBeVisible();

      // verify new measure link and navigation
      await MeasureList.getNewMeasureLink(page).scrollIntoViewIfNeeded();
      await MeasureList.getNewMeasureLink(page).click();

      // verify measure_create_started event (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "measure_create_started",
        triggered_from: "data_studio_measures_list",
        target_id: ORDERS_ID,
      });

      await expect
        .poll(() => page.url())
        .toContain(`${getMeasuresBaseUrl(ORDERS_ID)}/new`);
    });

    test("should display measures and allow navigation to edit page", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Total Revenue",
        aggregation: ["sum", ["field", ORDERS.TOTAL, null]],
      });
      await visitDataStudioMeasures(page, ORDERS_ID);

      // verify measure in list with aggregation description
      await MeasureList.getMeasure(page, "Total Revenue").scrollIntoViewIfNeeded();
      await expect(MeasureList.getMeasure(page, "Total Revenue")).toBeVisible();
      await expect(
        MeasureList.get(page).getByTestId("list-item-description"),
      ).toContainText("Sum of Total");

      // navigate to edit page
      await MeasureList.getMeasure(page, "Total Revenue").click();
      await expect
        .poll(() => page.url())
        .toContain(`${getMeasuresBaseUrl(ORDERS_ID)}/${measureId}`);
    });

    test("should navigate between Fields and Measures tabs", async ({
      page,
    }) => {
      await visitDataStudioTable(page, ORDERS_ID);

      // verify both tabs visible
      await page.getByRole("tab", { name: /Fields/i }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("tab", { name: /Measures/i })).toBeVisible();

      // navigate to measures tab
      await page.getByRole("tab", { name: /Measures/i }).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures`,
        );
      await MeasureList.getEmptyState(page).scrollIntoViewIfNeeded();
      await expect(MeasureList.getEmptyState(page)).toBeVisible();

      // verify tab selection preserved on refresh
      const metadata = waitForMetadata(page);
      await page.reload();
      await metadata;
      const measuresTab = page.getByRole("tab", { name: /Measures/i });
      await measuresTab.scrollIntoViewIfNeeded();
      await expect(measuresTab).toHaveAttribute("aria-selected", "true");

      // navigate back to fields tab
      await page.getByRole("tab", { name: /Fields/i }).click();
      await expect.poll(() => page.url()).toContain("/field");
    });
  });

  test.describe("Measure creation", () => {
    test("should create a measure with aggregation and verify across features", async ({
      page,
    }) => {
      await visitDataStudioMeasures(page, ORDERS_ID);

      // navigate to new measure page
      await MeasureList.getNewMeasureLink(page).scrollIntoViewIfNeeded();
      await MeasureList.getNewMeasureLink(page).click();

      // verify measure_create_started event (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "measure_create_started",
        triggered_from: "data_studio_measures_list",
        target_id: ORDERS_ID,
      });

      // fill in measure name
      await MeasureEditor.getNameInput(page).fill("Total Revenue");

      // add aggregation
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Sum of ...", { exact: true }).click();
      await popover(page).getByText("Total", { exact: true }).click();

      // verify aggregation was added
      await expect(
        MeasureEditor.get(page).getByText(/Sum of Total/i),
      ).toHaveCount(1);

      // save measure
      const created = waitForCreateMeasure(page);
      await MeasureEditor.getSaveButton(page).click();
      const createdResponse = await created;
      const { id: measureId } = (await createdResponse.json()) as {
        id: number;
      };

      // verify measure_created success event (snowplow stubbed)
      await expectUnstructuredSnowplowEvent({
        event: "measure_created",
        triggered_from: "data_studio_measures",
        result: "success",
        target_id: measureId,
      });

      // verify redirect to edit page and toast
      await expect(undoToast(page).first()).toContainText("Measure created");
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(
          new RegExp(`${escapeRegExp(getMeasuresBaseUrl(ORDERS_ID))}/\\d+$`),
        );

      // verify measure in query builder
      await verifyMeasureInQueryBuilder(page, "Total Revenue");
    });

    test("should add aggregation and show explore in menu", async ({
      page,
    }) => {
      await visitDataStudioMeasures(page, PRODUCTS_ID);

      await MeasureList.getNewMeasureLink(page).scrollIntoViewIfNeeded();
      await MeasureList.getNewMeasureLink(page).click();

      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Average of ...", { exact: true }).click();
      await popover(page).getByText("Price", { exact: true }).click();

      // verify aggregation was added
      await expect(
        MeasureEditor.get(page).getByText(/Average of Price/i),
      ).toHaveCount(1);

      // verify explore is available in menu
      await MeasureEditor.getActionsButton(page).click();
      await expect(
        popover(page).getByText("Explore", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("Measure editing", () => {
    test("should display and update existing measure", async ({ page, mb }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Test Measure",
        description: "Test description",
      });
      await visitDataModelMeasure(page, ORDERS_ID, measureId);

      // verify existing data displayed
      const nameInput = await findByDisplayValue(
        MeasureEditor.get(page),
        "Test Measure",
      );
      await expect(nameInput).toBeVisible();
      await expect(MeasureEditor.getDescriptionInput(page)).toHaveValue(
        "Test description",
      );

      // update measure name (saves immediately on blur/enter)
      const nameUpdated = waitForUpdateMeasure(page);
      await nameInput.click();
      await nameInput.press("End");
      await nameInput.pressSequentially(" Updated");
      await nameInput.press("Enter");
      await nameUpdated;

      // verify toast for name update
      await expect(undoToast(page).first()).toContainText(
        "Measure name updated",
      );

      // update description
      await MeasureEditor.getDescriptionInput(page).fill("Updated description");
      const descUpdated = waitForUpdateMeasure(page);
      await MeasureEditor.getSaveButton(page).click();
      await descUpdated;

      // verify updated measure in query builder
      await verifyMeasureInQueryBuilder(page, "Test Measure Updated");
    });

    test("should navigate back to measures tab via breadcrumb", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Breadcrumb Test Measure",
      });
      await visitDataModelMeasure(page, ORDERS_ID, measureId);

      await MeasureEditor.getBreadcrumb(page, "Orders").click();

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures`,
        );
      const measuresTab = page.getByRole("tab", { name: /Measures/i });
      await measuresTab.scrollIntoViewIfNeeded();
      await expect(measuresTab).toHaveAttribute("aria-selected", "true");
    });
  });

  test.describe("Measure deletion", () => {
    test("should remove measure via more menu", async ({ page, mb }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Measure to Delete",
      });
      await visitDataModelMeasure(page, ORDERS_ID, measureId);

      // delete via more menu
      await MeasureEditor.getActionsButton(page).click();
      await popover(page).getByText("Remove measure", { exact: true }).click();
      const removed = waitForUpdateMeasure(page);
      await modal(page)
        .getByRole("button", { name: "Remove", exact: true })
        .click();
      await removed;

      // verify redirect to list and removal
      await expect(undoToast(page).first()).toContainText("Measure removed");
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toContain(
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures`,
        );
      await expect(
        MeasureList.get(page).getByText("Measure to Delete", { exact: true }),
      ).toHaveCount(0);

      // verify measure removed from query builder. Upstream asserts on
      // "Total Revenue" — a measure this test never creates, so the check is
      // vacuous; ported as the real assertion on the deleted measure.
      await verifyMeasureNotInQueryBuilder(page, "Measure to Delete");
    });
  });

  test.describe("Unsaved changes", () => {
    test("should show leave confirmation with unsaved changes", async ({
      page,
    }) => {
      await visitDataStudioMeasures(page, ORDERS_ID);

      await MeasureList.getNewMeasureLink(page).scrollIntoViewIfNeeded();
      await MeasureList.getNewMeasureLink(page).click();
      await MeasureEditor.getNameInput(page).fill("Unsaved Measure");

      // attempt to navigate away
      await MeasureEditor.getBreadcrumb(page, "Orders").click();

      // verify confirmation modal
      await expect(
        modal(page).getByText("Discard your changes?", { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      // verify still on editor
      await expect(
        MeasureEditor.get(page).getByText("Unsaved Measure", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("Measure with implicit joins", () => {
    test("should create a measure with implicit join aggregation", async ({
      page,
    }) => {
      await visitDataStudioMeasures(page, ORDERS_ID);

      // navigate to new measure page
      await MeasureList.getNewMeasureLink(page).scrollIntoViewIfNeeded();
      await MeasureList.getNewMeasureLink(page).click();

      // fill in measure name
      await MeasureEditor.getNameInput(page).fill("Average Product Price");

      // add aggregation via implicit join
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Average of ...", { exact: true }).click();
      await popover(page).getByText("Product", { exact: true }).click();
      await popover(page).getByText("Price", { exact: true }).click();

      // verify aggregation was added and save
      await expect(
        MeasureEditor.get(page).getByText(/Average of Product → Price/i),
      ).toHaveCount(1);
      const created = waitForCreateMeasure(page);
      await MeasureEditor.getSaveButton(page).click();
      await created;

      // verify redirected to edit page with measure name
      await expect(MeasureEditor.get(page)).toBeVisible();
      const nameInput = await findByDisplayValue(
        MeasureEditor.get(page),
        "Average Product Price",
      );
      await expect(nameInput).toBeVisible();

      // verify measure works in query builder
      await verifyMeasureInQueryBuilder(page, "Average Product Price");
    });
  });

  test.describe("Revision history", () => {
    test("should display revision history with changes to name, description, and aggregation", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Original Name",
        description: "Original description",
        aggregation: ["count"],
      });

      // fetch the measure to get the current MBQL 5 definition
      const measure = (await (
        await mb.api.get(`/api/measure/${measureId}`)
      ).json()) as {
        definition: { stages: Record<string, unknown>[] };
      };
      const currentDefinition = measure.definition;

      // update measure name
      await mb.api.put(`/api/measure/${measureId}`, {
        name: "Updated Name",
        description: "Original description",
        revision_message: "Updated from Data Studio",
        definition: currentDefinition,
      });

      // update measure description
      await mb.api.put(`/api/measure/${measureId}`, {
        name: "Updated Name",
        description: "Updated description",
        revision_message: "Updated from Data Studio",
        definition: currentDefinition,
      });

      // update measure aggregation (in the MBQL 5 definition)
      const updatedDefinition = {
        ...currentDefinition,
        stages: [
          {
            ...currentDefinition.stages[0],
            aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          },
        ],
      };
      await mb.api.put(`/api/measure/${measureId}`, {
        name: "Updated Name",
        description: "Updated description",
        revision_message: "Updated from Data Studio",
        definition: updatedDefinition,
      });

      // upstream cy.wait(1000) — revisions are timestamp-ordered
      await page.waitForTimeout(1000);

      await visitDataModelMeasure(page, ORDERS_ID, measureId);

      // navigate to revision history tab
      await MeasureEditor.getRevisionHistoryTab(page).click();

      // verify URL
      await expect
        .poll(() => page.url())
        .toContain(`${getMeasuresBaseUrl(ORDERS_ID)}/${measureId}/revisions`);

      // verify revision history entries
      const history = MeasureRevisionHistory.get(page);
      for (const pattern of [
        /created this measure/i,
        /renamed the measure/i,
        /changed the aggregation/i,
        /updated the description/i,
      ]) {
        await history.getByText(pattern).scrollIntoViewIfNeeded();
        await expect(history.getByText(pattern)).toBeVisible();
      }
    });
  });

  test.describe("Dependencies", () => {
    test("should display dependency graph for a measure", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Dependencies Test Measure",
      });
      await visitDataModelMeasure(page, ORDERS_ID, measureId);

      // navigate to dependencies tab
      await MeasureEditor.getDependenciesTab(page).click();

      // verify URL and dependency graph display
      await expect
        .poll(() => page.url())
        .toContain(
          `${getMeasuresBaseUrl(ORDERS_ID)}/${measureId}/dependencies`,
        );
      await expect(DependencyGraph.graph(page)).toBeVisible();
      await expect(
        DependencyGraph.graph(page).getByText("Dependencies Test Measure", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("Readonly access for data analysts", () => {
    test("should show measures in list but hide New measure button for non-admin", async ({
      page,
      mb,
    }) => {
      await createTestMeasure(mb.api, { name: "Readonly Test Measure" });

      await mb.api.put(`/api/user/${NODATA_USER_ID}`, {
        is_data_analyst: true,
      });
      await mb.signIn("nodata");

      // verify measure is visible in list
      await visitDataStudioMeasures(page, ORDERS_ID);
      await MeasureList.getMeasure(
        page,
        "Readonly Test Measure",
      ).scrollIntoViewIfNeeded();
      await expect(
        MeasureList.getMeasure(page, "Readonly Test Measure"),
      ).toBeVisible();

      // verify New measure button is not visible
      await expect(
        MeasureList.get(page).getByRole("link", { name: /New measure/i }),
      ).toHaveCount(0);

      // verify direct navigation to new measure page is blocked
      await page.goto(
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/measures/new`,
      );
      await expect.poll(() => page.url()).toContain("/unauthorized");
    });

    test("should display measure detail in readonly mode for non-admin", async ({
      page,
      mb,
    }) => {
      const measureId = await createTestMeasure(mb.api, {
        name: "Readonly Detail Measure",
        description: "Test description for readonly",
      });

      await mb.api.put(`/api/user/${NODATA_USER_ID}`, {
        is_data_analyst: true,
      });
      await mb.signIn("nodata");

      await visitDataModelMeasure(page, ORDERS_ID, measureId);

      // verify measure name input is disabled
      const nameInput = await findByDisplayValue(
        MeasureEditor.get(page),
        "Readonly Detail Measure",
      );
      await expect(nameInput).toBeDisabled();

      // verify description is displayed as plain text
      await expect(
        MeasureEditor.get(page).getByText("Description", { exact: true }),
      ).toBeVisible();
      await expect(
        MeasureEditor.get(page).getByText("Test description for readonly", {
          exact: true,
        }),
      ).toBeVisible();

      // verify Save button is not visible
      await expect(
        MeasureEditor.get(page).getByRole("button", { name: /Save/i }),
      ).toHaveCount(0);

      // verify Remove measure option is hidden in actions menu
      await MeasureEditor.getActionsButton(page).click();
      await expect(
        popover(page).getByText("Explore", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Remove measure", { exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");

      // verify revision history is still accessible
      await MeasureEditor.getRevisionHistoryTab(page).click();
      const history = MeasureRevisionHistory.get(page);
      await history.getByText(/created this measure/i).scrollIntoViewIfNeeded();
      await expect(history.getByText(/created this measure/i)).toBeVisible();
    });
  });
});
