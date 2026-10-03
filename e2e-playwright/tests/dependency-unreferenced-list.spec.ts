/**
 * Playwright port of
 * e2e/test/scenarios/dependencies/dependency-unreferenced-list.cy.spec.ts
 *
 * @external — the whole spec restores the `postgres-writable` snapshot and
 * seeds a writable QA postgres table (H.resetTestTable / resyncDatabase on
 * WRITABLE_DB_ID) for its one table entity; the models/segments/metrics/snippets
 * live on the sample DB, but the beforeEach can't run without the writable
 * snapshot + DB. Neither is in the jar harness (nor in CI's `-@external` runs),
 * so the describe is gated on PW_QA_DB_ENABLED. It also needs a pro-self-hosted
 * token (EE dependency diagnostics). The port is faithful-by-construction but
 * runtime-unverified here — a green run on the jar means "correctly skipped",
 * not "passing". Mirrors the dependency-graph.spec.ts precedent.
 *
 * Snowplow helpers run real assertions, backed by the per-slot collector via
 * ../support/snowplow: the upstream reset / expectNoBadSnowplowEvents /
 * expectUnstructuredSnowplowEvent assertions assert for real.
 *
 * New helpers live in support/dependency-unreferenced-list.ts
 * (DependencyDiagnostics locators, waitForUnreferencedEntities). Shared helpers
 * — waitForBackfillComplete (support/dependency-graph.ts) and the create*
 * factories — are imported read-only.
 */
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { resetTestTable } from "../support/actions-on-dashboards";
import { resolveToken, type MetabaseApi } from "../support/api";
import { updateDashboardCards } from "../support/dashboard-core";
import { waitForBackfillComplete } from "../support/dependency-graph";
import {
  DependencyDiagnostics,
  getNodeName,
  waitForUnreferencedEntities,
} from "../support/dependency-unreferenced-list";
import {
  createDashboard,
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { test, expect } from "../support/fixtures";
import { createSnippet } from "../support/native-extras";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { FIRST_COLLECTION_ID, SAMPLE_DATABASE, USERS } from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  getTableId,
  resyncDatabase,
} from "../support/schema-viewer";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { popover } from "../support/ui";

const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

// Port of ADMIN_USER_ID (cypress_sample_instance_data.js) — the admin user's id.
// Not exported by support/sample-data.ts; derived here the same way that file
// derives its own instance ids.
const ADMIN_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    (u) => u.email === "admin@metabase.test",
  );
  if (!user) {
    throw new Error("admin@metabase.test not found in cypress_sample_instance_data");
  }
  return Number(user.id);
})();

// The Playwright USERS map carries only email/password; the admin's full name
// ("Bobby Tables") is a snapshot constant the spec elsewhere hardcodes as
// `createdBy`. Kept here so the table-owner assertion reads the same value the
// Cypress `${USERS.admin.first_name} ${USERS.admin.last_name}` produced.
const ADMIN_FULL_NAME = "Bobby Tables";

// Silence unused-import lints when the describe is gated-skipped: USERS is only
// referenced for parity documentation above.
void USERS;

const DATABASE_NAME = "Writable Postgres12";
const TABLE_NAME = "many_data_types";
const TABLE_DISPLAY_NAME = "Many Data Types";
const TABLE_DESCRIPTION = "This is a table with many data types";
const MODEL_FOR_QUESTION_DATA_SOURCE = "Model for question data source";
const MODEL_FOR_MODEL_DATA_SOURCE = "Model for model data source";
const MODEL_FOR_METRIC_DATA_SOURCE = "Model for metric data source";
const MODEL_FOR_NATIVE_QUESTION_CARD_TAG = "Model for native question card tag";
const MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE =
  "Model for native question parameter source";
const MODEL_FOR_DASHBOARD_CARD = "Model for dashboard card";
const MODEL_FOR_DASHBOARD_PARAMETER_SOURCE =
  "Model for dashboard parameter source";
const SEGMENT_FOR_QUESTION_FILTER = "Segment for question filter";
const SEGMENT_FOR_MODEL_FILTER = "Segment for model filter";
const SEGMENT_FOR_SEGMENT_FILTER = "Segment for segment filter";
const SEGMENT_FOR_METRIC_FILTER = "Segment for metric filter";
const METRIC_FOR_QUESTION_AGGREGATION = "Metric for question aggregation";
const METRIC_FOR_MODEL_AGGREGATION = "Metric for model aggregation";
const METRIC_FOR_METRIC_AGGREGATION = "Metric for metric aggregation";
const METRIC_FOR_DASHBOARD_CARD = "Metric for dashboard card";
const SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG =
  "Snippet for native question card tag";
const SNIPPET_FOR_SNIPPET_TAG = "Snippet for snippet tag";

const TABLE_NAMES = [TABLE_DISPLAY_NAME];

const MODEL_NAMES = [
  MODEL_FOR_QUESTION_DATA_SOURCE,
  MODEL_FOR_MODEL_DATA_SOURCE,
  MODEL_FOR_METRIC_DATA_SOURCE,
  MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
  MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
  MODEL_FOR_DASHBOARD_CARD,
  MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
];

const SEGMENT_NAMES = [
  SEGMENT_FOR_QUESTION_FILTER,
  SEGMENT_FOR_MODEL_FILTER,
  SEGMENT_FOR_SEGMENT_FILTER,
  SEGMENT_FOR_METRIC_FILTER,
];

const METRIC_NAMES = [
  METRIC_FOR_QUESTION_AGGREGATION,
  METRIC_FOR_MODEL_AGGREGATION,
  METRIC_FOR_METRIC_AGGREGATION,
  METRIC_FOR_DASHBOARD_CARD,
];

const SNIPPET_NAMES = [
  SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
  SNIPPET_FOR_SNIPPET_TAG,
];

const ENTITY_NAMES = [
  ...TABLE_NAMES,
  ...MODEL_NAMES,
  ...SEGMENT_NAMES,
  ...METRIC_NAMES,
  ...SNIPPET_NAMES,
];

// The unreferenced list also contains inactive tables of the shared writable DB
// (tables dropped by other specs stay visible on purpose — see #77714), so the
// full list can exceed one page. Tests that need to see all of the entities
// created by this spec at once narrow the list down with this search term,
// which matches every entity name above except the table's.
const ENTITY_SEARCH_TERM = "for";
const SEARCHABLE_ENTITY_NAMES = [
  ...MODEL_NAMES,
  ...SEGMENT_NAMES,
  ...METRIC_NAMES,
  ...SNIPPET_NAMES,
];

const MODELS_SORTED_BY_NAME = [
  MODEL_FOR_DASHBOARD_CARD,
  MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
  MODEL_FOR_METRIC_DATA_SOURCE,
  MODEL_FOR_MODEL_DATA_SOURCE,
  MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
  MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
  MODEL_FOR_QUESTION_DATA_SOURCE,
];

const MODELS_SORTED_BY_LOCATION = [
  MODEL_FOR_METRIC_DATA_SOURCE,
  MODEL_FOR_MODEL_DATA_SOURCE,
  MODEL_FOR_QUESTION_DATA_SOURCE,
  MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
  MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
  MODEL_FOR_DASHBOARD_CARD,
  MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
];

test.describe("scenarios > dependencies > unreferenced list", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED || !resolveToken("pro-self-hosted"),
    "Requires the writable postgres QA database (set PW_QA_DB_ENABLED) and a pro-self-hosted token",
  );

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore("postgres-writable");
    await resetTestTable({ type: "postgres", table: TABLE_NAME });
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: [TABLE_NAME] });
    await page.setViewportSize({ width: 1600, height: 1400 });
    await resetSnowplow(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test.describe("analysis", () => {
    test("should show unreferenced entities", async ({ page, mb }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await checkList(page, { visibleEntities: [TABLE_DISPLAY_NAME] });
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        ENTITY_SEARCH_TERM,
      );
      await checkList(page, { visibleEntities: SEARCHABLE_ENTITY_NAMES });
    });

    test("should not show referenced entities", async ({ page, mb }) => {
      await setupEntities(mb.api, { withReferences: true });
      // These entities are referenced, so they should never appear in the
      // unreferenced list — we can't poll for their presence. Wait for the
      // global backfill so the analysis has run before asserting their absence.
      await waitForBackfillComplete(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      const list = DependencyDiagnostics.list(page);
      for (const name of ENTITY_NAMES) {
        await expect(list.getByText(name, { exact: true })).toHaveCount(0);
      }
    });
  });

  test.describe("search", () => {
    test("should search for entities", async ({ page, mb }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        MODEL_FOR_QUESTION_DATA_SOURCE,
      );
      await checkList(page, {
        visibleEntities: [MODEL_FOR_QUESTION_DATA_SOURCE],
        hiddenEntities: [MODEL_FOR_MODEL_DATA_SOURCE],
      });
    });

    test("should search for entities with type filters", async ({
      page,
      mb,
    }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially("tag");
      await checkList(page, {
        visibleEntities: [
          MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
          SNIPPET_FOR_SNIPPET_TAG,
        ],
        hiddenEntities: [MODEL_FOR_QUESTION_DATA_SOURCE],
      });

      await DependencyDiagnostics.filterButton(page).click();
      await popover(page).getByText("Snippet", { exact: true }).click();
      await checkList(page, {
        visibleEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG],
        hiddenEntities: [SNIPPET_FOR_SNIPPET_TAG],
      });
    });
  });

  test.describe("filters", () => {
    test("should filter entities by type", async ({ page, mb }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        ENTITY_SEARCH_TERM,
      );
      await checkList(page, { visibleEntities: SEARCHABLE_ENTITY_NAMES });

      await DependencyDiagnostics.filterButton(page).click();
      await popover(page).getByText("Model", { exact: true }).click();
      await checkList(page, {
        hiddenEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG],
      });

      await popover(page).getByText("Segment", { exact: true }).click();
      await checkList(page, {
        hiddenEntities: [
          MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
          SEGMENT_FOR_QUESTION_FILTER,
        ],
      });

      await popover(page).getByText("Metric", { exact: true }).click();
      await checkList(page, {
        hiddenEntities: [
          MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
          SEGMENT_FOR_QUESTION_FILTER,
          METRIC_FOR_QUESTION_AGGREGATION,
        ],
      });

      await popover(page).getByText("Model", { exact: true }).click();
      await checkList(page, {
        visibleEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG],
      });
    });

    test("should persist filter changes after page reload", async ({
      page,
      mb,
    }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await checkList(page, { visibleEntities: MODEL_NAMES });

      await DependencyDiagnostics.filterButton(page).click();
      await popover(page).getByText("Model", { exact: true }).click();
      await checkList(page, { hiddenEntities: MODEL_NAMES });

      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await checkList(page, {
        visibleEntities: METRIC_NAMES,
        hiddenEntities: MODEL_NAMES,
      });
    });

    test("should filter by location", async ({ page, mb }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        ENTITY_SEARCH_TERM,
      );
      await checkList(page, {
        visibleEntities: [
          MODEL_FOR_MODEL_DATA_SOURCE,
          MODEL_FOR_METRIC_DATA_SOURCE,
          SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        ],
      });

      await DependencyDiagnostics.filterButton(page).click();
      await popover(page)
        .getByText("Include items in personal collections", { exact: true })
        .click();
      await checkList(page, {
        visibleEntities: [
          MODEL_FOR_MODEL_DATA_SOURCE,
          SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        ],
        hiddenEntities: [MODEL_FOR_METRIC_DATA_SOURCE],
      });

      await popover(page)
        .getByText("Include items in personal collections", { exact: true })
        .click();
      await checkList(page, {
        visibleEntities: [
          MODEL_FOR_MODEL_DATA_SOURCE,
          MODEL_FOR_METRIC_DATA_SOURCE,
          SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        ],
      });
    });
  });

  test.describe("sorting", () => {
    test("should sort by name", async ({ page, mb }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        "Model for",
      );

      // sorted by name by default
      await checkListSorting(page, { visibleEntities: MODELS_SORTED_BY_NAME });

      // sorted by name ascending
      await DependencyDiagnostics.list(page)
        .getByText("Name", { exact: true })
        .click();
      await checkListSorting(page, { visibleEntities: MODELS_SORTED_BY_NAME });

      // sorted by name descending
      await DependencyDiagnostics.list(page)
        .getByText("Name", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: [...MODELS_SORTED_BY_NAME].reverse(),
      });
    });

    test("should sort by location", async ({ page, mb }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        "Model for",
      );

      // sorted by location ascending
      await DependencyDiagnostics.list(page)
        .getByText("Location", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: MODELS_SORTED_BY_LOCATION,
      });

      // sorted by location descending
      await DependencyDiagnostics.list(page)
        .getByText("Location", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: [...MODELS_SORTED_BY_LOCATION].reverse(),
      });
    });

    test("should persist sorting changes after page reload", async ({
      page,
      mb,
    }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        "Model for",
      );

      await DependencyDiagnostics.list(page)
        .getByText("Location", { exact: true })
        .click();
      await checkListSorting(page, {
        visibleEntities: MODELS_SORTED_BY_LOCATION,
      });

      await DependencyDiagnostics.visitUnreferencedEntities(page);
      await DependencyDiagnostics.searchInput(page).pressSequentially(
        "Model for",
      );
      await checkListSorting(page, {
        visibleEntities: MODELS_SORTED_BY_LOCATION,
      });
    });
  });

  test.describe("selecting entities", () => {
    test("should show the sidebar for supported entities and trigger snowplow event", async ({
      page,
      mb,
    }) => {
      await setupEntities(mb.api);
      await waitForUnreferencedAnalysis(mb.api);
      await DependencyDiagnostics.visitUnreferencedEntities(page);

      await DependencyDiagnostics.list(page)
        .getByText(TABLE_DISPLAY_NAME, { exact: true })
        .click();
      await expectUnstructuredSnowplowEvent(mb, {
        event: "dependency_diagnostics_entity_selected",
        triggered_from: "unreferenced",
        event_detail: "table",
      });
      await checkSidebar(page, {
        title: TABLE_DISPLAY_NAME,
        location: DATABASE_NAME,
        description: TABLE_DESCRIPTION,
        owner: ADMIN_FULL_NAME,
        fields: ["ID", "UUID"],
      });

      await DependencyDiagnostics.searchInput(page).pressSequentially(
        ENTITY_SEARCH_TERM,
      );
      await DependencyDiagnostics.list(page)
        .getByText(MODEL_FOR_QUESTION_DATA_SOURCE, { exact: true })
        .click();
      await checkSidebar(page, {
        title: MODEL_FOR_QUESTION_DATA_SOURCE,
        location: "Our analytics",
        createdBy: "Bobby Tables",
        fields: ["User ID"],
      });

      await DependencyDiagnostics.list(page)
        .getByText(MODEL_FOR_MODEL_DATA_SOURCE, { exact: true })
        .click();
      await checkSidebar(page, {
        title: MODEL_FOR_MODEL_DATA_SOURCE,
        location: "First collection",
        createdBy: "Bobby Tables",
      });

      await DependencyDiagnostics.list(page)
        .getByText(SEGMENT_FOR_QUESTION_FILTER, { exact: true })
        .click();
      await checkSidebar(page, {
        title: SEGMENT_FOR_QUESTION_FILTER,
        location: "Orders",
        createdBy: "Bobby Tables",
      });

      await DependencyDiagnostics.list(page)
        .getByText(METRIC_FOR_QUESTION_AGGREGATION, { exact: true })
        .click();
      await checkSidebar(page, {
        title: METRIC_FOR_QUESTION_AGGREGATION,
        location: "Our analytics",
        createdBy: "Bobby Tables",
      });

      await DependencyDiagnostics.list(page)
        .getByText(METRIC_FOR_MODEL_AGGREGATION, { exact: true })
        .click();
      await checkSidebar(page, {
        title: METRIC_FOR_MODEL_AGGREGATION,
        location: "First collection",
        createdBy: "Bobby Tables",
      });

      await DependencyDiagnostics.list(page)
        .getByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG, { exact: true })
        .click();
      await checkSidebar(page, {
        title: SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
        location: "SQL snippets",
        createdBy: "Bobby Tables",
      });

      // snowplow event when dependency graph link is clicked
      await page
        .getByRole("link", { name: "View in dependency graph", exact: true })
        .click();
      await expectUnstructuredSnowplowEvent(mb, {
        event: "dependency_entity_selected",
        triggered_from: "diagnostics-unreferenced-list",
        event_detail: "snippet",
      });
    });
  });
});

// === entity setup (ports of the spec-local setup* + create* helpers) ===

async function setupEntities(
  api: MetabaseApi,
  { withReferences = false }: { withReferences?: boolean } = {},
) {
  await setupTableContent(api, { withReferences });
  await setupModelContent(api, { withReferences });
  await setupSegmentContent(api, { withReferences });
  await setupMetricContent(api, { withReferences });
  await setupSnippetContent(api, { withReferences });
}

async function setupTableContent(
  api: MetabaseApi,
  { withReferences = false }: { withReferences?: boolean },
) {
  const tableId = await getTableId(api, { name: TABLE_NAME });
  await api.put(`/api/table/${tableId}`, {
    display_name: TABLE_DISPLAY_NAME,
    description: TABLE_DESCRIPTION,
    owner_user_id: ADMIN_USER_ID,
  });
  if (withReferences) {
    await createQuestionWithTableDataSource(api, {
      name: `${TABLE_DISPLAY_NAME} -> Question`,
      tableId,
    });
  }
}

async function setupModelContent(
  api: MetabaseApi,
  { withReferences = false }: { withReferences?: boolean },
) {
  const model1 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_QUESTION_DATA_SOURCE,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createQuestionWithModelDataSource(api, {
      name: `${MODEL_FOR_QUESTION_DATA_SOURCE} -> Question`,
      modelId: model1.id,
    });
  }

  const model2 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_MODEL_DATA_SOURCE,
    tableId: ORDERS_ID,
    collectionId: FIRST_COLLECTION_ID,
  });
  if (withReferences) {
    await createModelWithModelDataSource(api, {
      name: `${MODEL_FOR_MODEL_DATA_SOURCE} -> Model`,
      modelId: model2.id,
    });
  }

  const model3 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_METRIC_DATA_SOURCE,
    tableId: ORDERS_ID,
    collectionId: ADMIN_PERSONAL_COLLECTION_ID,
  });
  if (withReferences) {
    await createMetricWithModelDataSource(api, {
      name: `${MODEL_FOR_METRIC_DATA_SOURCE} -> Metric`,
      modelId: model3.id,
    });
  }

  const model4 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createNativeQuestionWithCardTag(api, {
      name: `${MODEL_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
      cardId: model4.id,
    });
  }

  const model5 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
    tableId: PRODUCTS_ID,
  });
  if (withReferences) {
    await createNativeQuestionWithParameterWithCardSource(api, {
      name: `${MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE} -> Question`,
      tableName: "PRODUCTS",
      tableFieldId: PRODUCTS.CATEGORY,
      cardId: model5.id,
      cardFieldName: "CATEGORY",
    });
  }

  const model6 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_DASHBOARD_CARD,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createDashboardWithCard(api, {
      name: `${MODEL_FOR_DASHBOARD_CARD} -> Dashboard Card`,
      cardId: model6.id,
    });
  }

  const model7 = await createModelWithTableDataSource(api, {
    name: MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
    tableId: PRODUCTS_ID,
  });
  if (withReferences) {
    await createDashboardWithParameterWithCardSource(api, {
      name: `${MODEL_FOR_DASHBOARD_PARAMETER_SOURCE} -> Dashboard`,
      cardId: model7.id,
      cardFieldName: "CATEGORY",
    });
  }
}

async function setupSegmentContent(
  api: MetabaseApi,
  { withReferences = false }: { withReferences?: boolean },
) {
  const segment1 = await createSegmentWithTableDataSource(api, {
    name: SEGMENT_FOR_QUESTION_FILTER,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createQuestionWithSegmentClause(api, {
      name: `${SEGMENT_FOR_QUESTION_FILTER} -> Question`,
      tableId: ORDERS_ID,
      segmentId: segment1.id,
    });
  }

  const segment2 = await createSegmentWithTableDataSource(api, {
    name: SEGMENT_FOR_MODEL_FILTER,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createModelWithSegmentClause(api, {
      name: `${SEGMENT_FOR_MODEL_FILTER} -> Model`,
      tableId: ORDERS_ID,
      segmentId: segment2.id,
    });
  }

  const segment3 = await createSegmentWithTableDataSource(api, {
    name: SEGMENT_FOR_SEGMENT_FILTER,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createSegmentWithSegmentClause(api, {
      name: `${SEGMENT_FOR_SEGMENT_FILTER} -> Segment`,
      tableId: ORDERS_ID,
      segmentId: segment3.id,
    });
  }

  const segment4 = await createSegmentWithTableDataSource(api, {
    name: SEGMENT_FOR_METRIC_FILTER,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createMetricWithSegmentClause(api, {
      name: `${SEGMENT_FOR_METRIC_FILTER} -> Metric`,
      tableId: ORDERS_ID,
      segmentId: segment4.id,
    });
  }
}

async function setupMetricContent(
  api: MetabaseApi,
  { withReferences = false }: { withReferences?: boolean },
) {
  const metric1 = await createMetricWithTableDataSource(api, {
    name: METRIC_FOR_QUESTION_AGGREGATION,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createQuestionWithMetricClause(api, {
      name: `${METRIC_FOR_QUESTION_AGGREGATION} -> Question`,
      tableId: ORDERS_ID,
      metricId: metric1.id,
    });
  }

  const metric2 = await createMetricWithTableDataSource(api, {
    name: METRIC_FOR_MODEL_AGGREGATION,
    tableId: ORDERS_ID,
    collectionId: FIRST_COLLECTION_ID,
  });
  if (withReferences) {
    await createModelWithMetricClause(api, {
      name: `${METRIC_FOR_MODEL_AGGREGATION} -> Model`,
      tableId: ORDERS_ID,
      metricId: metric2.id,
    });
  }

  const metric3 = await createMetricWithTableDataSource(api, {
    name: METRIC_FOR_METRIC_AGGREGATION,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createMetricWithMetricClause(api, {
      name: `${METRIC_FOR_METRIC_AGGREGATION} -> Metric`,
      tableId: ORDERS_ID,
      metricId: metric3.id,
    });
  }

  const metric4 = await createMetricWithTableDataSource(api, {
    name: METRIC_FOR_DASHBOARD_CARD,
    tableId: ORDERS_ID,
  });
  if (withReferences) {
    await createDashboardWithCard(api, {
      name: `${METRIC_FOR_DASHBOARD_CARD} -> Dashboard Card`,
      cardId: metric4.id,
    });
  }
}

async function setupSnippetContent(
  api: MetabaseApi,
  { withReferences = false }: { withReferences?: boolean },
) {
  const snippet1 = await createSnippetWithBasicFilter(api, {
    name: SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
  });
  if (withReferences) {
    await createNativeQuestionWithSnippetTag(api, {
      name: `${SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
      tableName: "ORDERS",
      snippetId: snippet1.id,
      snippetName: snippet1.name,
    });
  }

  const snippet2 = await createSnippetWithBasicFilter(api, {
    name: SNIPPET_FOR_SNIPPET_TAG,
  });
  if (withReferences) {
    await createSnippetWithSnippetTag(api, {
      name: `${SNIPPET_FOR_SNIPPET_TAG} -> Snippet`,
      snippetName: snippet2.name,
    });
  }
}

function createQuestionWithModelDataSource(
  api: MetabaseApi,
  { name, modelId }: { name: string; modelId: number },
) {
  return createQuestion(api, {
    name,
    type: "question",
    query: { "source-table": `card__${modelId}` },
  });
}

function createQuestionWithTableDataSource(
  api: MetabaseApi,
  { name, tableId }: { name: string; tableId: number },
) {
  return createQuestion(api, {
    name,
    type: "question",
    query: { "source-table": tableId },
  });
}

function createQuestionWithSegmentClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    segmentId,
  }: { name: string; tableId: number; segmentId: number },
) {
  return createQuestion(api, {
    name,
    type: "question",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createQuestionWithMetricClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    metricId,
  }: { name: string; tableId: number; metricId: number },
) {
  return createQuestion(api, {
    name,
    type: "question",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createNativeQuestionWithCardTag(
  api: MetabaseApi,
  { name, cardId }: { name: string; cardId: number },
) {
  const tagName = `#${cardId}`;

  return createNativeQuestion(api, {
    name,
    type: "question",
    native: {
      query: `select * from {{${tagName}}}`,
      "template-tags": {
        [tagName]: {
          id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
          type: "card",
          name: tagName,
          "display-name": tagName,
          "card-id": cardId,
        },
      },
    },
  });
}

function createNativeQuestionWithParameterWithCardSource(
  api: MetabaseApi,
  {
    name,
    tableName,
    tableFieldId,
    cardId,
    cardFieldName,
  }: {
    name: string;
    tableName: string;
    tableFieldId: number;
    cardId: number;
    cardFieldName: string;
  },
) {
  return createNativeQuestion(api, {
    name,
    native: {
      query: `select * from ${tableName} where {{filter}}`,
      "template-tags": {
        filter: {
          id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
          type: "dimension",
          name: "filter",
          "display-name": "Filter",
          dimension: ["field", tableFieldId, null],
          "widget-type": "string/=",
        },
      },
    },
    parameters: [
      mockParameter({
        id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
        name: "Filter",
        slug: "filter",
        type: "string/=",
        target: ["dimension", ["template-tag", "filter"]],
        values_source_type: "card",
        values_source_config: {
          card_id: cardId,
          value_field: ["field", cardFieldName, { "base-type": "type/Text" }],
        },
      }),
    ],
  });
}

function createNativeQuestionWithSnippetTag(
  api: MetabaseApi,
  {
    name,
    tableName,
    snippetId,
    snippetName,
  }: {
    name: string;
    tableName: string;
    snippetId: number;
    snippetName: string;
  },
) {
  const tagName = `snippet: ${snippetName}`;

  return createNativeQuestion(api, {
    name,
    type: "question",
    native: {
      query: `select * from ${tableName} where {{${tagName}}}`,
      "template-tags": {
        [tagName]: {
          id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
          type: "snippet",
          name: tagName,
          "display-name": snippetName,
          "snippet-id": snippetId,
          "snippet-name": snippetName,
        },
      },
    },
  });
}

function createModelWithTableDataSource(
  api: MetabaseApi,
  {
    name,
    tableId,
    collectionId,
  }: { name: string; tableId: number; collectionId?: number },
) {
  return createQuestion(api, {
    name,
    type: "model",
    query: { "source-table": tableId },
    collection_id: collectionId,
  });
}

function createModelWithModelDataSource(
  api: MetabaseApi,
  { name, modelId }: { name: string; modelId: number },
) {
  return createQuestion(api, {
    name,
    type: "model",
    query: { "source-table": `card__${modelId}` },
  });
}

function createModelWithSegmentClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    segmentId,
  }: { name: string; tableId: number; segmentId: number },
) {
  return createQuestion(api, {
    name,
    type: "model",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createModelWithMetricClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    metricId,
  }: { name: string; tableId: number; metricId: number },
) {
  return createQuestion(api, {
    name,
    type: "model",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createSegmentWithTableDataSource(
  api: MetabaseApi,
  { name, tableId }: { name: string; tableId: number },
) {
  return createSegment(api, {
    name,
    definition: {
      "source-table": tableId,
      filter: [["=", "A", "A"]],
    },
  });
}

function createSegmentWithSegmentClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    segmentId,
  }: { name: string; tableId: number; segmentId: number },
) {
  return createSegment(api, {
    name,
    definition: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createMetricWithTableDataSource(
  api: MetabaseApi,
  {
    name,
    tableId,
    collectionId,
  }: { name: string; tableId: number; collectionId?: number },
) {
  return createQuestion(api, {
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
    collection_id: collectionId,
  });
}

function createMetricWithModelDataSource(
  api: MetabaseApi,
  { name, modelId }: { name: string; modelId: number },
) {
  return createQuestion(api, {
    name,
    type: "metric",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [["count"]],
    },
  });
}

function createMetricWithSegmentClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    segmentId,
  }: { name: string; tableId: number; segmentId: number },
) {
  return createQuestion(api, {
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
      aggregation: [["count"]],
    },
  });
}

function createMetricWithMetricClause(
  api: MetabaseApi,
  {
    name,
    tableId,
    metricId,
  }: { name: string; tableId: number; metricId: number },
) {
  return createQuestion(api, {
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createSnippetWithBasicFilter(
  api: MetabaseApi,
  { name }: { name: string },
) {
  return createSnippet(api, { name, content: "1 = 1" });
}

function createSnippetWithSnippetTag(
  api: MetabaseApi,
  { name, snippetName }: { name: string; snippetName: string },
) {
  return createSnippet(api, {
    name,
    content: `{{snippet: ${snippetName}}}`,
  });
}

async function createDashboardWithCard(
  api: MetabaseApi,
  { name, cardId }: { name: string; cardId: number },
) {
  const dashboard = await createDashboard(api, { name });
  await updateDashboardCards(api, {
    dashboard_id: dashboard.id,
    cards: [{ card_id: cardId }],
  });
}

function createDashboardWithParameterWithCardSource(
  api: MetabaseApi,
  {
    name,
    cardId,
    cardFieldName,
  }: { name: string; cardId: number; cardFieldName: string },
) {
  return createDashboard(api, {
    name,
    parameters: [
      mockParameter({
        id: "10422a0f",
        name: "Filter",
        slug: "filter",
        type: "string/=",
        values_source_type: "card",
        values_source_config: {
          card_id: cardId,
          value_field: ["field", cardFieldName, { "base-type": "type/Text" }],
        },
      }),
    ],
  });
}

// Port of createMockParameter (metabase-types/api/mocks/parameters.ts): fill the
// four defaults (id/name/type/slug) the spec always overrides anyway.
function mockParameter(
  opts: Record<string, unknown>,
): Record<string, unknown> {
  return { id: "1", name: "text", type: "string/=", slug: "text", ...opts };
}

// === analysis wait (port of the spec-local waitForUnreferencedAnalysis) ===

// The dependency graph is recomputed asynchronously when entities are created or
// updated (metabase#71037). waitForBackfillComplete only reports the global
// one-time backfill flag — it does NOT guarantee the entities setupEntities()
// just created have been classified into the unreferenced graph. Poll the
// unreferenced endpoint until every expected entity is present before visiting.
async function waitForUnreferencedAnalysis(
  api: MetabaseApi,
  expectedNames: string[] = ENTITY_NAMES,
) {
  await waitForBackfillComplete(api);
  await waitForUnreferencedEntities(api, (nodes) => {
    const presentNames = new Set(nodes.map(getNodeName));
    return expectedNames.every((name) => presentNames.has(name));
  });
}

// === assertions (ports of the spec-local check* helpers) ===

async function checkList(
  page: Page,
  {
    visibleEntities = [],
    hiddenEntities = [],
  }: { visibleEntities?: string[]; hiddenEntities?: string[] },
) {
  const list = DependencyDiagnostics.list(page);
  for (const name of visibleEntities) {
    const item = list.getByText(name, { exact: true });
    await item.scrollIntoViewIfNeeded();
    await expect(item).toBeVisible();
  }
  for (const name of hiddenEntities) {
    await expect(list.getByText(name, { exact: true })).toHaveCount(0);
  }
}

async function checkListSorting(
  page: Page,
  { visibleEntities }: { visibleEntities: string[] },
) {
  const list = DependencyDiagnostics.list(page);
  for (let index = 0; index < visibleEntities.length; index++) {
    const name = visibleEntities[index];
    // Port of `cy.findByText(name).parents("[data-index]")` — the virtualized
    // row wrapper carrying the position; assert it sits at the expected index.
    const row = list
      .locator("[data-index]")
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toHaveAttribute("data-index", index.toString());
  }
}

async function checkSidebar(
  page: Page,
  {
    title,
    location,
    description,
    owner,
    createdBy,
    fields = [],
  }: {
    title: string;
    location?: string;
    description?: string;
    owner?: string;
    createdBy?: string;
    fields?: string[];
  },
) {
  const Sidebar = DependencyDiagnostics.Sidebar;
  const sidebar = DependencyDiagnostics.sidebar(page);
  await expect(sidebar).toBeVisible();

  await expect(
    Sidebar.header(page).getByText(title, { exact: true }),
  ).toBeVisible();
  if (location) {
    const locationText = Sidebar.locationSection(page).getByText(location, {
      exact: true,
    });
    await locationText.scrollIntoViewIfNeeded();
    await expect(locationText).toBeVisible();
  }
  if (description) {
    await expect(Sidebar.infoSection(page)).toContainText(description);
  }
  if (owner) {
    await expect(Sidebar.infoSection(page)).toContainText(owner);
  }
  if (createdBy) {
    await expect(Sidebar.infoSection(page)).toContainText(createdBy);
  }
  if (fields.length > 0) {
    const fieldsSection = Sidebar.fieldsSection(page);
    for (const field of fields) {
      const fieldText = fieldsSection.getByText(field, { exact: true });
      await fieldText.scrollIntoViewIfNeeded();
      await expect(fieldText).toBeVisible();
    }
  }
}
