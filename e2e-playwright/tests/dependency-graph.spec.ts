/**
 * Playwright port of
 * e2e/test/scenarios/dependencies/dependency-graph.cy.spec.ts
 *
 * @external — the whole spec restores the `postgres-writable` snapshot and
 * drives the writable QA postgres DB (H.resetTestTable / resyncDatabase on
 * WRITABLE_DB_ID). That DB and snapshot aren't in the jar harness (nor in CI's
 * `-@external` runs), so the describe is gated on PW_QA_DB_ENABLED. It also
 * needs a pro-self-hosted token (EE dependency-graph + transforms). The port is
 * faithful-by-construction but runtime-unverified here — a green run means
 * "correctly skipped", not "passing".
 *
 * Snowplow helpers are no-op stubs (rule 6): the spike stubs snowplow, and the
 * upstream `dependency_entity_selected` assertion has nothing to assert against.
 *
 * New helpers live in support/dependency-graph.ts (DependencyGraph locators,
 * waitForBackfillComplete, createTransform, runTransformAndWaitForSuccess, the
 * cards-carrying createDocument + createMockCard). Everything else is imported
 * from the shared support modules.
 */
import type { Page } from "@playwright/test";

import { resolveToken, type MetabaseApi } from "../support/api";
import { resetTestTable } from "../support/actions-on-dashboards";
import { pickEntity } from "../support/dashboard";
import {
  DependencyGraph,
  createDocument,
  createMockCard,
  createTransform,
  runTransformAndWaitForSuccess,
  waitForBackfillComplete,
} from "../support/dependency-graph";
import {
  createDashboard as createDashboardFactory,
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { test, expect } from "../support/fixtures";
import { createMeasure } from "../support/metrics-explorer";
import { createSnippet } from "../support/native-extras";
import { entityPickerModal } from "../support/notebook";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { entityPickerModalItem } from "../support/question-new";
import { FIRST_COLLECTION_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, getTableId, resyncDatabase } from "../support/schema-viewer";
import { SECOND_COLLECTION_ID } from "../support/question-new";
import { icon, popover } from "../support/ui";

// TODO: no snowplow-micro container in the spike harness — snowplow is stubbed
// (rule 6). The upstream `dependency_entity_selected` assertion is a no-op here.
const resetSnowplow = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

const BASE_URL = "/data-studio/dependencies";
const TABLE_NAME = "scoreboard_actions";
const TABLE_DISPLAY_NAME = "Scoreboard Actions";
const TRANSFORM_TABLE_NAME = "transform_table";
const TRANSFORM_TABLE_DISPLAY_NAME = "Transform Table";
const TABLE_BASED_QUESTION_NAME = "Table-based question";
const TABLE_BASED_MODEL_NAME = "Table-based model";
const TABLE_BASED_MEASURE_NAME = "Table-based measure";
const TABLE_BASED_METRIC_NAME = "Table-based metric";
const TABLE_BASED_TRANSFORM_NAME = "Table-based transform";
const CARD_BASED_QUESTION_NAME = "Card-based question";
const CARD_BASED_MODEL_NAME = "Card-based model";
const CARD_BASED_METRIC_NAME = "Card-based metric";
const CARD_BASED_TRANSFORM_NAME = "Card-based transform";
const CARD_BASED_SNIPPET_NAME = "Card-based snippet";
const MEASURE_BASED_QUESTION_NAME = "Measure-based question";
const MEASURE_BASED_MODEL_NAME = "Measure-based model";
const MEASURE_BASED_METRIC_NAME = "Measure-based metric";
const MEASURE_BASED_TRANSFORM_NAME = "Measure-based transform";
const MEASURE_BASED_MEASURE_NAME = "Measure-based measure";
const METRIC_BASED_QUESTION_NAME = "Metric-based question";
const METRIC_BASED_MODEL_NAME = "Metric-based model";
const METRIC_BASED_METRIC_NAME = "Metric-based metric";
const METRIC_BASED_TRANSFORM_NAME = "Metric-based transform";
const EMPTY_SNIPPET_NAME = "Empty snippet";
const SNIPPET_BASED_QUESTION_NAME = "Snippet-based question";
const SNIPPET_BASED_MODEL_NAME = "Snippet-based model";
const SNIPPET_BASED_TRANSFORM_NAME = "Snippet-based transform";
const SNIPPET_BASED_SNIPPET_NAME = "Snippet-based snippet";
const TABLE_BASED_SEGMENT_NAME = "Table-based segment";
const SEGMENT_BASED_QUESTION_NAME = "Segment-based question";
const SEGMENT_BASED_MODEL_NAME = "Segment-based model";
const SEGMENT_BASED_MEASURE_NAME = "Segment-based measure";
const SEGMENT_BASED_METRIC_NAME = "Segment-based metric";
const SEGMENT_BASED_SEGMENT_NAME = "Segment-based segment";
const ROOT_COLLECTION_NAME = "Our analytics";
const FIRST_COLLECTION_NAME = "First collection";
const DASHBOARD_NAME = "Dashboard";
const DOCUMENT_NAME = "Document";

test.describe("scenarios > dependencies > dependency graph", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED || !resolveToken("pro-self-hosted"),
    "Requires the writable postgres QA database (set PW_QA_DB_ENABLED) and a pro-self-hosted token",
  );

  let scoreboardTableId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: TABLE_NAME });
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: [TABLE_NAME] });
    scoreboardTableId = await getTableId(mb.api, { name: TABLE_NAME });
    await resetSnowplow();
  });

  test.describe("entity search", () => {
    async function testEntitySearch(
      page: Page,
      {
        itemName,
        itemIcon,
        isRecentItem,
      }: { itemName: string; itemIcon: string; isRecentItem: boolean },
    ) {
      // typeahead search box → real keystrokes (PORTING rule 5).
      await DependencyGraph.entrySearchInput(page).clear();
      await DependencyGraph.entrySearchInput(page).pressSequentially(itemName);
      await popover(page).getByText(itemName, { exact: true }).click();
      await expectUnstructuredSnowplowEvent({
        event: "dependency_entity_selected",
        triggered_from: "dependency-graph",
        event_detail: "table",
      });

      await expect(DependencyGraph.entryButton(page)).toHaveText(itemName);
      await expect(
        icon(DependencyGraph.entryButton(page), itemIcon),
      ).toBeVisible();
      await icon(DependencyGraph.entryButton(page), "close").click();

      if (isRecentItem) {
        await DependencyGraph.entrySearchInput(page).click();
        await expect(
          popover(page).getByText(itemName, { exact: true }),
        ).toBeVisible();
      }
    }

    async function testEntityPicker(
      page: Page,
      { path, itemIcon }: { path: (string | RegExp)[]; itemIcon: string },
    ) {
      const itemName = path[path.length - 1];
      const itemLevel = path.length - 1;

      await DependencyGraph.entrySearchInput(page).click();
      await popover(page).getByText("Browse all", { exact: true }).click();
      await pickEntity(page, { path });
      await expect(DependencyGraph.entryButton(page)).toHaveText(itemName);
      await expect(
        icon(DependencyGraph.entryButton(page), itemIcon),
      ).toBeVisible();

      // verify the item is selected when the picker is re-opened
      await DependencyGraph.entryButton(page).click();
      const modal = entityPickerModal(page);
      await expect(
        entityPickerModalItem(page, itemLevel, itemName),
      ).toHaveAttribute("data-active", "true");
      await modal.getByLabel("Close", { exact: true }).click();
      await icon(DependencyGraph.entryButton(page), "close").click();

      // verify the item can be found via search
      await DependencyGraph.entrySearchInput(page).click();
      await popover(page).getByText("Browse all", { exact: true }).click();
      const modal2 = entityPickerModal(page);
      await modal2
        .getByPlaceholder(/Search/)
        .pressSequentially(itemName as string);
      await expect(modal2.getByText(/results for/)).toBeVisible();
      await modal2
        .getByTestId("search-scope-selector")
        .getByText("Everywhere", { exact: true })
        .click();
      // Search rows repeat the collection name in a location label; take the
      // first exact-text match (the result row itself).
      await modal2
        .getByText(itemName, { exact: typeof itemName === "string" })
        .first()
        .click();
      await expect(DependencyGraph.entryButton(page)).toHaveText(itemName);
      await expect(
        icon(DependencyGraph.entryButton(page), itemIcon),
      ).toBeVisible();
      await icon(DependencyGraph.entryButton(page), "close").click();
    }

    test("should be able to use inline search for all supported entity types", async ({
      page,
      mb,
    }) => {
      await createTableBasedMetric(mb.api, { tableId: scoreboardTableId });
      await createTableBasedTransform(mb.api, { tableName: TABLE_NAME });
      await visitGraph(page);

      await testEntitySearch(page, {
        itemName: "Products",
        itemIcon: "table",
        isRecentItem: true,
      });
      await testEntitySearch(page, {
        itemName: "Orders, Count, Grouped by Created At (year)",
        itemIcon: "line",
        isRecentItem: true,
      });
      await testEntitySearch(page, {
        itemName: "Orders Model",
        itemIcon: "model",
        isRecentItem: true,
      });
      await testEntitySearch(page, {
        itemName: TABLE_BASED_METRIC_NAME,
        itemIcon: "metric",
        isRecentItem: false,
      });
      await testEntitySearch(page, {
        itemName: TABLE_BASED_TRANSFORM_NAME,
        itemIcon: "transform",
        isRecentItem: false,
      });
    });

    test("should be able to use the entity picker for all supported entity types", async ({
      page,
      mb,
    }) => {
      await createTableBasedMetric(mb.api, { tableId: scoreboardTableId });
      await createTableBasedTransform(mb.api, { tableName: TABLE_NAME });

      await visitGraph(page);
      await testEntityPicker(page, {
        path: ["Databases", /Sample Database/, "Products"],
        itemIcon: "table",
      });
      await testEntityPicker(page, {
        path: ["Our analytics", "Orders, Count, Grouped by Created At (year)"],
        itemIcon: "line",
      });
      await testEntityPicker(page, {
        path: ["Our analytics", "Orders Model"],
        itemIcon: "model",
      });
      await testEntityPicker(page, {
        path: ["Our analytics", TABLE_BASED_METRIC_NAME],
        itemIcon: "metric",
      });
      await testEntityPicker(page, {
        path: [/Transforms/, TABLE_BASED_TRANSFORM_NAME],
        itemIcon: "transform",
      });
    });
  });

  test.describe("entity focus", () => {
    test("should be possible to select an entity via search", async ({
      page,
      mb,
    }) => {
      const card = await createTableBasedQuestion(mb.api, {
        tableId: scoreboardTableId,
      });
      await visitGraphForEntity(page, mb.api, card.id, "card");

      await DependencyGraph.selectionButton(page).click();
      await popover(page).getByText(TABLE_DISPLAY_NAME, { exact: true }).click();
      const graph = DependencyGraph.graph(page);
      await expect(
        graph.getByLabel(TABLE_DISPLAY_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        graph.getByLabel(TABLE_BASED_QUESTION_NAME, { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("dependent types", () => {
    async function verifyPanelNavigation(
      page: Page,
      {
        itemTitle,
        groupTitle,
        dependentItemTitle,
        dependentItemLocation,
      }: {
        itemTitle: string;
        groupTitle: string;
        dependentItemTitle: string;
        dependentItemLocation?: string;
      },
    ) {
      await DependencyGraph.graph(page)
        .getByLabel(itemTitle, { exact: true })
        .getByText(groupTitle, { exact: true })
        .click();
      const panelItem = DependencyGraph.dependencyPanel(page).getByLabel(
        dependentItemTitle,
        { exact: true },
      );
      if (dependentItemLocation) {
        await expect(
          panelItem.getByText(dependentItemLocation, { exact: true }),
        ).toBeVisible();
      }
      await expect(
        panelItem.getByText(dependentItemTitle, { exact: true }),
      ).toBeVisible();
      await panelItem.getByText(dependentItemTitle, { exact: true }).click();

      await expect(
        DependencyGraph.entryButton(page).getByText(dependentItemTitle, {
          exact: true,
        }),
      ).toBeVisible();
      await page.goBack();
      await expect(
        DependencyGraph.entryButton(page).getByText(itemTitle, {
          exact: true,
        }),
      ).toBeVisible();
    }

    test("should display dependencies for a table and navigate to them", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      await createTableBasedQuestion(mb.api, { tableId });
      await createTableBasedModel(mb.api, { tableId });
      await createTableBasedMetric(mb.api, { tableId });
      await createTableBasedTransform(mb.api, { tableName: TABLE_NAME });
      await createTableBasedSegment(mb.api, { tableId });
      await createTableBasedMeasure(mb.api, { tableId });
      await visitGraphForEntity(page, mb.api, tableId, "table");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 question",
        dependentItemTitle: TABLE_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 model",
        dependentItemTitle: TABLE_BASED_MODEL_NAME,
        dependentItemLocation: ROOT_COLLECTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: TABLE_BASED_METRIC_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: TABLE_BASED_TRANSFORM_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 segment",
        dependentItemTitle: TABLE_BASED_SEGMENT_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: TABLE_BASED_MEASURE_NAME,
      });
    });

    test("should display dependencies for a segment and navigate to them", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      const segment = await createTableBasedSegment(mb.api, { tableId });
      await createSegmentBasedQuestion(mb.api, { tableId, segmentId: segment.id });
      await createSegmentBasedModel(mb.api, { tableId, segmentId: segment.id });
      await createSegmentBaseMeasure(mb.api, { tableId, segmentId: segment.id });
      await createSegmentBasedMetric(mb.api, { tableId, segmentId: segment.id });
      await createSegmentBasedSegment(mb.api, { tableId, segmentId: segment.id });
      await visitGraphForEntity(page, mb.api, segment.id, "segment");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 question",
        dependentItemTitle: SEGMENT_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 model",
        dependentItemTitle: SEGMENT_BASED_MODEL_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: SEGMENT_BASED_MEASURE_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: SEGMENT_BASED_METRIC_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 segment",
        dependentItemTitle: SEGMENT_BASED_SEGMENT_NAME,
      });
    });

    test("should display dependencies for a question and navigate to them", async ({
      page,
      mb,
    }) => {
      const card = await createTableBasedQuestion(mb.api, {
        tableId: scoreboardTableId,
      });
      await createCardBasedQuestion(mb.api, { cardId: card.id });
      await createCardBasedModel(mb.api, { cardId: card.id });
      await createCardBasedMetric(mb.api, { cardId: card.id });
      await createCardBasedTransform(mb.api, { cardId: card.id });
      await createCardBasedSnippet(mb.api, { cardId: card.id });
      await visitGraphForEntity(page, mb.api, card.id, "card");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 question",
        dependentItemTitle: CARD_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 model",
        dependentItemTitle: CARD_BASED_MODEL_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: CARD_BASED_METRIC_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: CARD_BASED_TRANSFORM_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 snippet",
        dependentItemTitle: CARD_BASED_SNIPPET_NAME,
      });
    });

    // Upstream declares two tests with this exact title (the second targets a
    // model); Playwright treats duplicate titles as a hard load error, so the
    // second is suffixed faithfully.
    test("should display dependencies for a model and navigate to them", async ({
      page,
      mb,
    }) => {
      const card = await createTableBasedModel(mb.api, {
        tableId: scoreboardTableId,
      });
      await createCardBasedQuestion(mb.api, { cardId: card.id });
      await createCardBasedModel(mb.api, { cardId: card.id });
      await createCardBasedMetric(mb.api, { cardId: card.id });
      await createCardBasedTransform(mb.api, { cardId: card.id });
      await createCardBasedSnippet(mb.api, { cardId: card.id });
      await visitGraphForEntity(page, mb.api, card.id, "card");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 question",
        dependentItemTitle: CARD_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 model",
        dependentItemTitle: CARD_BASED_MODEL_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: CARD_BASED_METRIC_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: CARD_BASED_TRANSFORM_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 snippet",
        dependentItemTitle: CARD_BASED_SNIPPET_NAME,
      });
    });

    test("should display dependencies for a measure and navigate to them", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      const measure = await createTableBasedMeasure(mb.api, { tableId });
      await createMeasureBasedQuestion(mb.api, { tableId, measureId: measure.id });
      await createMeasureBasedModel(mb.api, { tableId, measureId: measure.id });
      await createMeasureBasedMetric(mb.api, { tableId, measureId: measure.id });
      await createMeasureBasedTransform(mb.api, { tableId, measureId: measure.id });
      await createMeasureBasedMeasure(mb.api, { tableId, measureId: measure.id });
      await visitGraphForEntity(page, mb.api, measure.id, "measure");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 question",
        dependentItemTitle: MEASURE_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 model",
        dependentItemTitle: MEASURE_BASED_MODEL_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: MEASURE_BASED_METRIC_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: MEASURE_BASED_TRANSFORM_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: MEASURE_BASED_MEASURE_NAME,
      });
    });

    test("should display dependencies for a metric and navigate to them", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      const card = await createTableBasedMetric(mb.api, { tableId });
      await createMetricBasedQuestion(mb.api, { tableId, metricId: card.id });
      await createMetricBasedModel(mb.api, { tableId, metricId: card.id });
      await createMetricBasedMetric(mb.api, { tableId, metricId: card.id });
      await createMetricBasedTransform(mb.api, { tableId, metricId: card.id });
      await visitGraphForEntity(page, mb.api, card.id, "card");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 question",
        dependentItemTitle: METRIC_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 model",
        dependentItemTitle: METRIC_BASED_MODEL_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: METRIC_BASED_METRIC_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: METRIC_BASED_TRANSFORM_NAME,
      });
    });

    test("should display dependencies for a transform and navigate to them", async ({
      page,
      mb,
    }) => {
      const transform = await createTableBasedTransform(mb.api, {
        tableName: TABLE_NAME,
      });
      await runTransformAndWaitForSuccess(mb.api, transform.id);
      await visitGraphForEntity(page, mb.api, transform.id, "transform");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_BASED_TRANSFORM_NAME,
        groupTitle: "1 table",
        dependentItemTitle: TRANSFORM_TABLE_DISPLAY_NAME,
      });
    });

    test("should display dependencies for a snippet and navigate to them", async ({
      page,
      mb,
    }) => {
      const snippet = await createEmptySnippet(mb.api);
      await createSnippetBasedQuestion(mb.api, {
        tableName: TABLE_NAME,
        snippetId: snippet.id,
        snippetName: snippet.name,
      });
      await createSnippetBasedModel(mb.api, {
        tableName: TABLE_NAME,
        snippetId: snippet.id,
        snippetName: snippet.name,
      });
      await createSnippetBasedTransform(mb.api, {
        tableName: TABLE_NAME,
        snippetId: snippet.id,
        snippetName: snippet.name,
      });
      await createSnippetBasedSnippet(mb.api, { snippetName: snippet.name });
      await visitGraphForEntity(page, mb.api, snippet.id, "snippet");

      await verifyPanelNavigation(page, {
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 question",
        dependentItemTitle: SNIPPET_BASED_QUESTION_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 model",
        dependentItemTitle: SNIPPET_BASED_MODEL_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: SNIPPET_BASED_TRANSFORM_NAME,
      });
      await verifyPanelNavigation(page, {
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 snippet",
        dependentItemTitle: SNIPPET_BASED_SNIPPET_NAME,
      });
    });

    test("should display dependencies for a question in the root collection", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      await createTableBasedQuestion(mb.api, { tableId });
      await visitGraphForEntity(page, mb.api, tableId, "table");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 question",
        dependentItemTitle: TABLE_BASED_QUESTION_NAME,
        dependentItemLocation: ROOT_COLLECTION_NAME,
      });
    });

    test("should display dependencies for a question in a non-root collection", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      await createTableBasedQuestion(mb.api, {
        tableId,
        collectionId: FIRST_COLLECTION_ID,
      });
      await visitGraphForEntity(page, mb.api, tableId, "table");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 question",
        dependentItemTitle: TABLE_BASED_QUESTION_NAME,
        dependentItemLocation: FIRST_COLLECTION_NAME,
      });
    });

    test("should display dependencies for a question in a dashboard", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      const dashboard = await createDashboard(mb.api);
      await createTableBasedQuestion(mb.api, { tableId, dashboardId: dashboard.id });
      await visitGraphForEntity(page, mb.api, tableId, "table");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 question",
        dependentItemTitle: TABLE_BASED_QUESTION_NAME,
        dependentItemLocation: DASHBOARD_NAME,
      });
    });

    test("should display dependencies for a question in a document", async ({
      page,
      mb,
    }) => {
      const tableId = scoreboardTableId;
      await createDocumentWithTableBasedQuestion(mb.api, { tableId });
      await visitGraphForEntity(page, mb.api, tableId, "table");

      await verifyPanelNavigation(page, {
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 question",
        dependentItemTitle: TABLE_BASED_QUESTION_NAME,
        dependentItemLocation: DOCUMENT_NAME,
      });
    });
  });

  test.describe("dependent filtering", () => {
    async function toggleFilter(page: Page, { filterName }: { filterName: string }) {
      await icon(DependencyGraph.dependencyPanel(page), "filter").click();
      await popover(page).getByText(filterName, { exact: true }).click();
      await icon(DependencyGraph.dependencyPanel(page), "filter").click();
    }

    async function verifyItems(
      page: Page,
      {
        visibleItems = [],
        hiddenItems = [],
      }: { visibleItems?: string[]; hiddenItems?: string[] },
    ) {
      const panel = DependencyGraph.dependencyPanel(page);
      for (const item of visibleItems) {
        await expect(panel.getByText(item, { exact: true })).toBeVisible();
      }
      for (const item of hiddenItems) {
        await expect(panel.getByText(item, { exact: true })).toHaveCount(0);
      }
    }

    test("should be able to filter questions", async ({ page, mb }) => {
      const tableId = scoreboardTableId;
      const dashboard = await createDashboard(mb.api);
      await createTableBasedQuestion(mb.api, {
        name: "Question in root collection",
        tableId,
      });
      await createTableBasedQuestion(mb.api, {
        name: "Question in first collection",
        tableId,
        collectionId: FIRST_COLLECTION_ID,
      });
      await createTableBasedQuestion(mb.api, {
        name: "Question in second collection",
        tableId,
        collectionId: SECOND_COLLECTION_ID,
      });
      await createTableBasedQuestion(mb.api, {
        name: "Question in personal collection",
        tableId,
        collectionId: ADMIN_PERSONAL_COLLECTION_ID,
      });
      await createTableBasedQuestion(mb.api, {
        name: "Question in dashboard",
        tableId,
        dashboardId: dashboard.id,
      });
      await visitGraphForEntity(page, mb.api, tableId, "table");

      await DependencyGraph.graph(page)
        .getByLabel(TABLE_DISPLAY_NAME, { exact: true })
        .getByText("5 questions", { exact: true })
        .click();

      await verifyItems(page, {
        visibleItems: [
          "Question in dashboard",
          "Question in root collection",
          "Question in first collection",
          "Question in second collection",
          "Question in personal collection",
        ],
      });
      await toggleFilter(page, {
        filterName: "Include items in personal collections",
      });
      await verifyItems(page, {
        visibleItems: [
          "Question in dashboard",
          "Question in root collection",
          "Question in first collection",
          "Question in second collection",
        ],
        hiddenItems: ["Question in personal collection"],
      });
    });
  });
});

// === navigation ===

async function visitGraph(page: Page) {
  await page.goto(BASE_URL);
}

async function visitGraphForEntity(
  page: Page,
  api: MetabaseApi,
  id: number,
  type: string,
) {
  // Wait for async dependency computation to complete before navigating.
  await waitForBackfillComplete(api);
  await page.goto(`${BASE_URL}?id=${id}&type=${type}`);
}

// === content factories (ports of the spec-local create* helpers) ===

function createTableBasedCard(
  api: MetabaseApi,
  {
    name,
    type,
    tableId,
    collectionId,
    dashboardId,
  }: {
    name: string;
    type: string;
    tableId: number;
    collectionId?: number | null;
    dashboardId?: number | null;
  },
) {
  return createQuestion(api, {
    name,
    type,
    database: WRITABLE_DB_ID,
    query: { "source-table": tableId },
    collection_id: collectionId,
    dashboard_id: dashboardId,
  });
}

function createTableBasedQuestion(
  api: MetabaseApi,
  {
    name = TABLE_BASED_QUESTION_NAME,
    tableId,
    collectionId = null,
    dashboardId = null,
  }: {
    name?: string;
    tableId: number;
    collectionId?: number | null;
    dashboardId?: number | null;
  },
) {
  return createTableBasedCard(api, {
    name,
    type: "question",
    tableId,
    collectionId,
    dashboardId,
  });
}

function createTableBasedModel(
  api: MetabaseApi,
  {
    name = TABLE_BASED_MODEL_NAME,
    tableId,
    collectionId,
  }: { name?: string; tableId: number; collectionId?: number | null },
) {
  return createTableBasedCard(api, { name, type: "model", tableId, collectionId });
}

function createCardBasedCard(
  api: MetabaseApi,
  { name, type, cardId }: { name: string; type: string; cardId: number },
) {
  return createQuestion(api, {
    name,
    type,
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${cardId}` },
  });
}

function createCardBasedQuestion(api: MetabaseApi, { cardId }: { cardId: number }) {
  return createCardBasedCard(api, {
    name: CARD_BASED_QUESTION_NAME,
    type: "question",
    cardId,
  });
}

function createCardBasedModel(api: MetabaseApi, { cardId }: { cardId: number }) {
  return createCardBasedCard(api, {
    name: CARD_BASED_MODEL_NAME,
    type: "model",
    cardId,
  });
}

function createMetricBasedCard(
  api: MetabaseApi,
  {
    name,
    type,
    tableId,
    metricId,
  }: { name: string; type: string; tableId: number; metricId: number },
) {
  return createQuestion(api, {
    name,
    type,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createMetricBasedQuestion(
  api: MetabaseApi,
  { tableId, metricId }: { tableId: number; metricId: number },
) {
  return createMetricBasedCard(api, {
    name: METRIC_BASED_QUESTION_NAME,
    type: "question",
    tableId,
    metricId,
  });
}

function createMetricBasedModel(
  api: MetabaseApi,
  { tableId, metricId }: { tableId: number; metricId: number },
) {
  return createMetricBasedCard(api, {
    name: METRIC_BASED_MODEL_NAME,
    type: "model",
    tableId,
    metricId,
  });
}

function createSnippetBasedCard(
  api: MetabaseApi,
  {
    name,
    type,
    tableName,
    snippetId,
    snippetName,
  }: {
    name: string;
    type: string;
    tableName: string;
    snippetId: number;
    snippetName: string;
  },
) {
  return createNativeQuestion(api, {
    name,
    type,
    database: WRITABLE_DB_ID,
    native: {
      query: `SELECT * FROM ${tableName} WHERE {{snippet:${snippetName}}}`,
      "template-tags": {
        [`snippet:${snippetName}`]: {
          id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
          name: `snippet:${snippetName}`,
          "display-name": `snippet:${snippetName}`,
          type: "snippet",
          "snippet-id": snippetId,
          "snippet-name": snippetName,
        },
      },
    },
  });
}

function createSnippetBasedQuestion(
  api: MetabaseApi,
  {
    tableName,
    snippetId,
    snippetName,
  }: { tableName: string; snippetId: number; snippetName: string },
) {
  return createSnippetBasedCard(api, {
    name: SNIPPET_BASED_QUESTION_NAME,
    type: "question",
    tableName,
    snippetId,
    snippetName,
  });
}

function createSnippetBasedModel(
  api: MetabaseApi,
  {
    tableName,
    snippetId,
    snippetName,
  }: { tableName: string; snippetId: number; snippetName: string },
) {
  return createSnippetBasedCard(api, {
    name: SNIPPET_BASED_MODEL_NAME,
    type: "model",
    tableName,
    snippetId,
    snippetName,
  });
}

function createTableBasedMetric(api: MetabaseApi, { tableId }: { tableId: number }) {
  return createQuestion(api, {
    name: TABLE_BASED_METRIC_NAME,
    type: "metric",
    database: WRITABLE_DB_ID,
    query: { "source-table": tableId, aggregation: [["count"]] },
  });
}

function createCardBasedMetric(api: MetabaseApi, { cardId }: { cardId: number }) {
  return createQuestion(api, {
    name: CARD_BASED_METRIC_NAME,
    type: "metric",
    database: WRITABLE_DB_ID,
    query: { "source-table": `card__${cardId}`, aggregation: [["count"]] },
  });
}

function createMetricBasedMetric(
  api: MetabaseApi,
  { tableId, metricId }: { tableId: number; metricId: number },
) {
  return createQuestion(api, {
    name: METRIC_BASED_METRIC_NAME,
    type: "metric",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createTableBasedTransform(
  api: MetabaseApi,
  { tableName }: { tableName: string },
) {
  return createTransform(api, {
    name: TABLE_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: { query: `SELECT * from ${tableName}`, "template-tags": {} },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: TRANSFORM_TABLE_NAME,
    },
  });
}

function createCardBasedTransform(api: MetabaseApi, { cardId }: { cardId: number }) {
  return createTransform(api, {
    name: CARD_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: { "source-table": `card__${cardId}` },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: TRANSFORM_TABLE_NAME,
    },
  });
}

function createMetricBasedTransform(
  api: MetabaseApi,
  { tableId, metricId }: { tableId: number; metricId: number },
) {
  return createTransform(api, {
    name: METRIC_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": tableId,
          aggregation: [["metric", metricId]],
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: TRANSFORM_TABLE_NAME,
    },
  });
}

function createSnippetBasedTransform(
  api: MetabaseApi,
  {
    tableName,
    snippetId,
    snippetName,
  }: { tableName: string; snippetId: number; snippetName: string },
) {
  return createTransform(api, {
    name: SNIPPET_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: `SELECT * FROM ${tableName} WHERE {{snippet:${snippetName}}}`,
          "template-tags": {
            [`snippet:${snippetName}`]: {
              id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
              name: `snippet:${snippetName}`,
              "display-name": `snippet:${snippetName}`,
              type: "snippet",
              "snippet-id": snippetId,
              "snippet-name": snippetName,
            },
          },
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: TRANSFORM_TABLE_NAME,
    },
  });
}

function createEmptySnippet(api: MetabaseApi) {
  return createSnippet(api, { name: EMPTY_SNIPPET_NAME, content: "1 = 1" });
}

function createCardBasedSnippet(api: MetabaseApi, { cardId }: { cardId: number }) {
  return createSnippet(api, {
    name: CARD_BASED_SNIPPET_NAME,
    content: `{{#${cardId}}}`,
  });
}

function createSnippetBasedSnippet(
  api: MetabaseApi,
  { snippetName }: { snippetName: string },
) {
  return createSnippet(api, {
    name: SNIPPET_BASED_SNIPPET_NAME,
    content: `{{snippet:${snippetName}}}`,
  });
}

function createTableBasedSegment(api: MetabaseApi, { tableId }: { tableId: number }) {
  return createSegment(api, {
    name: TABLE_BASED_SEGMENT_NAME,
    description: "Segment description",
    definition: { "source-table": tableId, filter: ["=", 1, 1] },
  });
}

function createSegmentBasedSegment(
  api: MetabaseApi,
  { tableId, segmentId }: { tableId: number; segmentId: number },
) {
  return createSegment(api, {
    name: SEGMENT_BASED_SEGMENT_NAME,
    description: "Segment description",
    definition: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createSegmentBasedCard(
  api: MetabaseApi,
  {
    name,
    type,
    tableId,
    segmentId,
  }: { name: string; type: string; tableId: number; segmentId: number },
) {
  return createQuestion(api, {
    name,
    type,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
      aggregation: [["count"]],
    },
  });
}

function createSegmentBasedQuestion(
  api: MetabaseApi,
  { tableId, segmentId }: { tableId: number; segmentId: number },
) {
  return createSegmentBasedCard(api, {
    name: SEGMENT_BASED_QUESTION_NAME,
    type: "question",
    tableId,
    segmentId,
  });
}

function createSegmentBasedModel(
  api: MetabaseApi,
  { tableId, segmentId }: { tableId: number; segmentId: number },
) {
  return createSegmentBasedCard(api, {
    name: SEGMENT_BASED_MODEL_NAME,
    type: "model",
    tableId,
    segmentId,
  });
}

function createSegmentBasedMetric(
  api: MetabaseApi,
  { tableId, segmentId }: { tableId: number; segmentId: number },
) {
  return createSegmentBasedCard(api, {
    name: SEGMENT_BASED_METRIC_NAME,
    type: "metric",
    tableId,
    segmentId,
  });
}

function createDashboard(api: MetabaseApi) {
  return createDashboardFactory(api, { name: DASHBOARD_NAME });
}

function createDocumentWithTableBasedQuestion(
  api: MetabaseApi,
  { tableId }: { tableId: number },
) {
  return createDocument(api, {
    name: DOCUMENT_NAME,
    document: [],
    cards: {
      "-1": createMockCard({
        id: -1,
        name: TABLE_BASED_QUESTION_NAME,
        dataset_query: {
          database: WRITABLE_DB_ID,
          type: "query",
          query: { "source-table": tableId },
        },
        description: "Table based question",
      }),
    },
  });
}

function createTableBasedMeasure(api: MetabaseApi, { tableId }: { tableId: number }) {
  return createMeasure(api, {
    name: TABLE_BASED_MEASURE_NAME,
    definition: { "source-table": tableId, aggregation: [["count"]] },
  });
}

function createSegmentBaseMeasure(
  api: MetabaseApi,
  { tableId, segmentId }: { tableId: number; segmentId: number },
) {
  return createMeasure(api, {
    name: SEGMENT_BASED_MEASURE_NAME,
    definition: {
      "source-table": tableId,
      aggregation: [["count-where", ["segment", segmentId]]],
    },
  });
}

function createMeasureBasedQuestion(
  api: MetabaseApi,
  { tableId, measureId }: { tableId: number; measureId: number },
) {
  return createQuestion(api, {
    name: MEASURE_BASED_QUESTION_NAME,
    query: {
      "source-table": tableId,
      aggregation: [["measure", measureId]],
    },
  });
}

function createMeasureBasedModel(
  api: MetabaseApi,
  { tableId, measureId }: { tableId: number; measureId: number },
) {
  return createQuestion(api, {
    name: MEASURE_BASED_MODEL_NAME,
    type: "model",
    query: {
      "source-table": tableId,
      aggregation: [["measure", measureId]],
    },
  });
}

function createMeasureBasedMetric(
  api: MetabaseApi,
  { tableId, measureId }: { tableId: number; measureId: number },
) {
  return createQuestion(api, {
    name: MEASURE_BASED_METRIC_NAME,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["measure", measureId]],
    },
  });
}

function createMeasureBasedTransform(
  api: MetabaseApi,
  { tableId, measureId }: { tableId: number; measureId: number },
) {
  return createTransform(api, {
    name: MEASURE_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": tableId,
          aggregation: [["measure", measureId]],
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: TRANSFORM_TABLE_NAME,
    },
  });
}

function createMeasureBasedMeasure(
  api: MetabaseApi,
  { tableId, measureId }: { tableId: number; measureId: number },
) {
  return createMeasure(api, {
    name: MEASURE_BASED_MEASURE_NAME,
    definition: {
      "source-table": tableId,
      aggregation: ["+", 1, ["measure", measureId]],
    },
  });
}
