import { SAMPLE_DB_ID, USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ADMIN_USER_ID,
  FIRST_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  CollectionId,
  DependencyDiagnosticsUserParams,
  DependencyNode,
  DependencySortColumn,
  FieldId,
  ListUnreferencedGraphNodesResponse,
  NativeQuerySnippetId,
  SegmentId,
  SortDirection,
  TableId,
  TransformId,
} from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { H } = cy;
const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const TRANSFORM_TABLE_NAME = "test_transform_table";
const TRANSFORM_TABLE_DISPLAY_NAME = "Test Transform Table";
const TABLE_TRANSFORM = "Test Transform";
const TABLE_BASED_QUESTION_BROKEN_FIELD =
  "Test Table-based question with broken field";
const TABLE_BASED_QUESTION_BROKEN_EXPRESSION =
  "Test Table-based question with broken expression";
const TABLE_BASED_QUESTION_BROKEN_FILTER =
  "Test Table-based question with broken filter";
const TABLE_BASED_QUESTION_BROKEN_BREAKOUT =
  "Test Table-based question with broken breakout";
const TABLE_BASED_QUESTION_BROKEN_AGGREGATION =
  "Test Table-based question with broken aggregation";
const TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN =
  "Test Table-based question with broken explicit join";
const TABLE_BASED_QUESTION = "Test Table-based question";
const QUESTION_BASED_QUESTION_BROKEN_FILTER =
  "Test Question-based question with broken filter";
const TABLE_BASED_MODEL = "Test Table-based model";
const MODEL_BASED_MODEL_BROKEN_AGGREGATION =
  "Test Model-based model with broken aggregation";
const MODEL_BASED_QUESTION_BROKEN_FILTER =
  "Test Model-based question with broken filter";

const BROKEN_TABLE_DEPENDENCIES = [TRANSFORM_TABLE_DISPLAY_NAME];
const BROKEN_TABLE_DEPENDENTS = [
  // NOTE: TABLE_BASED_QUESTION_BROKEN_FIELD is *not* listed here because it's only broken in the `:fields` ref.
  // These are considered "soft" refs that don't break the query, since the QP will quietly drop a bad ref from a
  // `:fields` clause and the query will run successfully.
  TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
  TABLE_BASED_QUESTION_BROKEN_FILTER,
  TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
  TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
  TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
];
const BROKEN_QUESTION_DEPENDENCIES = [TABLE_BASED_QUESTION];
const BROKEN_QUESTION_DEPENDENTS = [QUESTION_BASED_QUESTION_BROKEN_FILTER];
const BROKEN_MODEL_DEPENDENCIES = [TABLE_BASED_MODEL];
const BROKEN_MODEL_DEPENDENTS = [
  MODEL_BASED_MODEL_BROKEN_AGGREGATION,
  MODEL_BASED_QUESTION_BROKEN_FILTER,
];

const BROKEN_DEPENDENCIES = [
  ...BROKEN_TABLE_DEPENDENCIES,
  ...BROKEN_QUESTION_DEPENDENCIES,
  ...BROKEN_MODEL_DEPENDENCIES,
];

const BROKEN_DEPENDENCIES_SORTED_BY_NAME = [
  TABLE_BASED_MODEL,
  TABLE_BASED_QUESTION,
  TRANSFORM_TABLE_DISPLAY_NAME,
];

const BROKEN_DEPENDENCIES_SORTED_BY_LOCATION = [
  TABLE_BASED_QUESTION, // Bobby Tables's personal collection
  TABLE_BASED_MODEL, // Our analytics
  TRANSFORM_TABLE_DISPLAY_NAME, // Writable Postgres
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS = [
  TRANSFORM_TABLE_DISPLAY_NAME, // 1 error: SCORE. The analysis does not count STATUS in a `:fields` list or a join condition.
  TABLE_BASED_QUESTION, // 3 errors: PRICE, TAX, DISCOUNT
  TABLE_BASED_MODEL, // 4 errors: AMOUNT, QUANTITY, SUBTOTAL, TOTAL
];

const BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS = [
  TABLE_BASED_QUESTION, // 1 question
  TABLE_BASED_MODEL, // 1 model, 1 question
  TRANSFORM_TABLE_DISPLAY_NAME, // 5 questions
];

const BROKEN_DEPENDENTS = [
  ...BROKEN_TABLE_DEPENDENTS,
  ...BROKEN_QUESTION_DEPENDENTS,
  ...BROKEN_MODEL_DEPENDENTS,
];

const DATABASE_NAME = "Writable Postgres12";
const MANY_DATA_TYPES_TABLE_NAME = "many_data_types";
const MANY_DATA_TYPES_TABLE_DISPLAY_NAME = "Many Data Types";
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

const TABLE_NAMES = [MANY_DATA_TYPES_TABLE_DISPLAY_NAME];

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

// Entities that `setupEntities({ withReferences: true })` creates to reference
// the entities above. Nothing references them, so they are unreferenced.
// Dashboards are not in the unreferenced list.
const TABLE_REFERENCING_ENTITY_NAME = `${MANY_DATA_TYPES_TABLE_DISPLAY_NAME} -> Question`;
const SEARCHABLE_REFERENCING_ENTITY_NAMES = [
  `${MODEL_FOR_QUESTION_DATA_SOURCE} -> Question`,
  `${MODEL_FOR_MODEL_DATA_SOURCE} -> Model`,
  `${MODEL_FOR_METRIC_DATA_SOURCE} -> Metric`,
  `${MODEL_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
  `${MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE} -> Question`,
  `${SEGMENT_FOR_QUESTION_FILTER} -> Question`,
  `${SEGMENT_FOR_MODEL_FILTER} -> Model`,
  `${SEGMENT_FOR_SEGMENT_FILTER} -> Segment`,
  `${SEGMENT_FOR_METRIC_FILTER} -> Metric`,
  `${METRIC_FOR_QUESTION_AGGREGATION} -> Question`,
  `${METRIC_FOR_MODEL_AGGREGATION} -> Model`,
  `${METRIC_FOR_METRIC_AGGREGATION} -> Metric`,
  `${SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
  `${SNIPPET_FOR_SNIPPET_TAG} -> Snippet`,
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

describe(
  "scenarios > dependencies > dependency diagnostics",
  { viewportWidth: 1600, viewportHeight: 1400 },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.updateSetting("transforms-enabled", true);
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("broken list", () => {
      beforeEach(() => {
        createContent();
        H.resetSnowplow();
      });

      afterEach(() => {
        dropTransformTable();
      });

      it("should list, search, sort, and filter broken dependencies and show the sidebar for broken dependents", () => {
        H.DependencyDiagnostics.visitBrokenDependencies();
        checkList({
          visibleEntities: BROKEN_DEPENDENCIES,
          hiddenEntities: BROKEN_DEPENDENTS,
        });

        cy.log("table dependents");
        H.DependencyDiagnostics.list()
          .findByText(TRANSFORM_TABLE_DISPLAY_NAME)
          .click();
        checkBrokenSidebar({
          title: TRANSFORM_TABLE_DISPLAY_NAME,
          transform: TABLE_TRANSFORM,
          missingColumns: ["score"],
          brokenDependents: BROKEN_TABLE_DEPENDENTS,
        });
        H.DependencyDiagnostics.Sidebar.brokenDependentsSection()
          .findByText(TABLE_BASED_QUESTION_BROKEN_FIELD)
          .should("not.exist");
        H.expectUnstructuredSnowplowEvent({
          event: "dependency_diagnostics_entity_selected",
          triggered_from: "broken",
          event_detail: "table",
        });

        cy.log("question dependents");
        H.DependencyDiagnostics.list().findByText(TABLE_BASED_QUESTION).click();
        checkBrokenSidebar({
          title: TABLE_BASED_QUESTION,
          missingColumns: ["PRICE", "TAX", "DISCOUNT"],
          brokenDependents: BROKEN_QUESTION_DEPENDENTS,
        });

        cy.log("model dependents");
        H.DependencyDiagnostics.list().findByText(TABLE_BASED_MODEL).click();
        checkBrokenSidebar({
          title: TABLE_BASED_MODEL,
          missingColumns: ["AMOUNT", "QUANTITY", "SUBTOTAL", "TOTAL"],
          brokenDependents: BROKEN_MODEL_DEPENDENTS,
        });

        cy.log("search");
        H.DependencyDiagnostics.searchInput().type(
          TRANSFORM_TABLE_DISPLAY_NAME,
        );
        checkList({
          visibleEntities: [TRANSFORM_TABLE_DISPLAY_NAME],
          hiddenEntities: [TABLE_BASED_QUESTION, TABLE_BASED_MODEL],
        });

        cy.log("sorting");
        H.DependencyDiagnostics.visitBrokenDependencies();
        H.DependencyDiagnostics.searchInput().type("test");

        cy.log("sorted by name by default");
        checkListSorting({
          visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
        });

        cy.log("sorted by name ascending");
        sortList({ header: "Dependency", column: "name", direction: "asc" });
        checkListSorting({
          visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_NAME,
        });

        cy.log("sorted by name descending");
        sortList({ header: "Dependency", column: "name", direction: "desc" });
        checkListSorting({
          visibleEntities: [...BROKEN_DEPENDENCIES_SORTED_BY_NAME].reverse(),
        });

        cy.log("sorted by location ascending");
        sortList({ header: "Location", column: "location", direction: "asc" });
        checkListSorting({
          visibleEntities: BROKEN_DEPENDENCIES_SORTED_BY_LOCATION,
        });

        cy.log("sorted by location descending");
        sortList({ header: "Location", column: "location", direction: "desc" });
        checkListSorting({
          visibleEntities: [
            ...BROKEN_DEPENDENCIES_SORTED_BY_LOCATION,
          ].reverse(),
        });

        cy.log("sorted by dependents errors descending");
        sortList({
          header: "Problems",
          column: "dependents-errors",
          direction: "desc",
        });
        checkListSorting({
          visibleEntities: [
            ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
          ].reverse(),
        });

        cy.log("sorted by dependents errors ascending");
        sortList({
          header: "Problems",
          column: "dependents-errors",
          direction: "asc",
        });
        checkListSorting({
          visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_ERRORS,
        });

        cy.log("sorted by dependents with errors descending");
        sortList({
          header: "Broken dependents",
          column: "dependents-with-errors",
          direction: "desc",
        });
        checkListSorting({
          visibleEntities: [
            ...BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
          ].reverse(),
        });

        cy.log("sorted by dependents with errors ascending");
        sortList({
          header: "Broken dependents",
          column: "dependents-with-errors",
          direction: "asc",
        });
        checkListSorting({
          visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
        });
        waitForSavedListParams({
          mode: "broken",
          isSaved: (params) =>
            params.sort_column === "dependents-with-errors" &&
            params.sort_direction === "asc",
        });

        cy.log("sorting persisted after page reload");
        H.DependencyDiagnostics.visitBrokenDependencies();
        checkListUrlSort({
          column: "dependents-with-errors",
          direction: "asc",
        });
        H.DependencyDiagnostics.searchInput().type("test");
        checkListSorting({
          visibleEntities: BROKEN_DEPENDENTS_SORTED_BY_DEPENDENTS_WITH_ERRORS,
        });

        cy.log("filtering");
        H.DependencyDiagnostics.filterButton().click();
        H.popover().within(() => {
          cy.findByText("Table").click();
          cy.findByText("Question").click();
          cy.findByText("Model").click();
        });

        cy.log("only tables");
        H.popover().findByText("Table").click();
        checkList({
          visibleEntities: BROKEN_TABLE_DEPENDENCIES,
          hiddenEntities: [
            ...BROKEN_QUESTION_DEPENDENCIES,
            ...BROKEN_MODEL_DEPENDENCIES,
          ],
        });

        cy.log("only questions");
        H.popover().within(() => {
          cy.findByText("Table").click();
          cy.findByText("Question").click();
        });
        checkList({
          visibleEntities: BROKEN_QUESTION_DEPENDENCIES,
          hiddenEntities: [
            ...BROKEN_TABLE_DEPENDENCIES,
            ...BROKEN_MODEL_DEPENDENCIES,
          ],
        });

        cy.log("only models");
        H.popover().within(() => {
          cy.findByText("Question").click();
          cy.findByText("Model").click();
        });
        checkList({
          visibleEntities: BROKEN_MODEL_DEPENDENCIES,
          hiddenEntities: [
            ...BROKEN_TABLE_DEPENDENCIES,
            ...BROKEN_QUESTION_DEPENDENCIES,
          ],
        });

        cy.log("all types");
        H.popover().within(() => {
          cy.findByText("Table").click();
          cy.findByText("Question").click();
        });
        checkList({ visibleEntities: BROKEN_DEPENDENCIES });

        cy.log("without items in personal collections");
        H.popover().findByText("Include items in personal collections").click();
        checkList({
          visibleEntities: [
            ...BROKEN_TABLE_DEPENDENCIES,
            ...BROKEN_MODEL_DEPENDENCIES,
          ],
          hiddenEntities: BROKEN_QUESTION_DEPENDENCIES,
        });
        waitForSavedListParams({
          mode: "broken",
          isSaved: (params) => params.include_personal_collections === false,
        });

        cy.log("filters persisted after page reload");
        H.DependencyDiagnostics.visitBrokenDependencies();
        checkList({
          visibleEntities: [
            ...BROKEN_TABLE_DEPENDENCIES,
            ...BROKEN_MODEL_DEPENDENCIES,
          ],
          hiddenEntities: BROKEN_QUESTION_DEPENDENCIES,
        });
        H.DependencyDiagnostics.filterButton().click();
        H.popover().within(() => {
          cy.findByRole("checkbox", { name: "Table" }).should("be.checked");
          cy.findByRole("checkbox", { name: "Question" }).should("be.checked");
          cy.findByRole("checkbox", { name: "Model" }).should("be.checked");
          cy.findByRole("checkbox", {
            name: "Include items in personal collections",
          }).should("not.be.checked");
        });

        H.DependencyDiagnostics.filterButton().click();

        cy.log("snowplow event when dependency graph link is clicked");
        H.DependencyDiagnostics.list().findByText(TABLE_BASED_MODEL).click();
        cy.findByRole("link", { name: "View in dependency graph" }).click();
        H.expectUnstructuredSnowplowEvent({
          event: "dependency_entity_selected",
          triggered_from: "diagnostics-broken-list",
          event_detail: "card",
        });
      });
    });

    describe("unreferenced list", () => {
      beforeEach(() => {
        H.resetTestTable({
          type: "postgres",
          table: MANY_DATA_TYPES_TABLE_NAME,
        });
        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
          tableName: MANY_DATA_TYPES_TABLE_NAME,
        });
        H.resetSnowplow();
      });

      describe("analysis", () => {
        it("should not show referenced entities", () => {
          setupEntities({ withReferences: true });
          H.waitForBackfillComplete();
          waitForSearchedUnreferencedAnalysis({
            query: ENTITY_SEARCH_TERM,
            expectedNames: SEARCHABLE_REFERENCING_ENTITY_NAMES,
          });
          waitForSearchedUnreferencedAnalysis({
            query: MANY_DATA_TYPES_TABLE_DISPLAY_NAME,
            expectedNames: [TABLE_REFERENCING_ENTITY_NAME],
          });
          H.DependencyDiagnostics.visitUnreferencedEntities();

          H.DependencyDiagnostics.searchInput().type(ENTITY_SEARCH_TERM);
          checkList({
            visibleEntities: SEARCHABLE_REFERENCING_ENTITY_NAMES,
            hiddenEntities: SEARCHABLE_ENTITY_NAMES,
          });

          H.DependencyDiagnostics.searchInput()
            .clear()
            .type(MANY_DATA_TYPES_TABLE_DISPLAY_NAME);
          checkList({
            visibleEntities: [TABLE_REFERENCING_ENTITY_NAME],
            hiddenEntities: [MANY_DATA_TYPES_TABLE_DISPLAY_NAME],
          });
        });
      });

      it("should show the sidebar, sort, search, and filter unreferenced entities and persist list changes after page reload", () => {
        setupEntities();
        waitForUnreferencedAnalysis();
        H.DependencyDiagnostics.visitUnreferencedEntities();

        cy.log("sidebar");
        H.DependencyDiagnostics.list()
          .findByText(MANY_DATA_TYPES_TABLE_DISPLAY_NAME)
          .click();
        H.expectUnstructuredSnowplowEvent({
          event: "dependency_diagnostics_entity_selected",
          triggered_from: "unreferenced",
          event_detail: "table",
        });
        checkUnreferencedSidebar({
          title: MANY_DATA_TYPES_TABLE_DISPLAY_NAME,
          location: DATABASE_NAME,
          description: TABLE_DESCRIPTION,
          owner: `${USERS.admin.first_name} ${USERS.admin.last_name}`,
          fields: ["ID", "UUID"],
        });

        H.DependencyDiagnostics.searchInput().type(ENTITY_SEARCH_TERM);
        H.DependencyDiagnostics.list()
          .findByText(MODEL_FOR_QUESTION_DATA_SOURCE)
          .click();
        checkUnreferencedSidebar({
          title: MODEL_FOR_QUESTION_DATA_SOURCE,
          location: "Our analytics",
          createdBy: "Bobby Tables",
          fields: ["User ID"],
        });

        H.DependencyDiagnostics.list()
          .findByText(MODEL_FOR_MODEL_DATA_SOURCE)
          .click();
        checkUnreferencedSidebar({
          title: MODEL_FOR_MODEL_DATA_SOURCE,
          location: "First collection",
          createdBy: "Bobby Tables",
        });

        H.DependencyDiagnostics.list()
          .findByText(SEGMENT_FOR_QUESTION_FILTER)
          .click();
        checkUnreferencedSidebar({
          title: SEGMENT_FOR_QUESTION_FILTER,
          location: "Orders",
          createdBy: "Bobby Tables",
        });

        H.DependencyDiagnostics.list()
          .findByText(METRIC_FOR_QUESTION_AGGREGATION)
          .click();
        checkUnreferencedSidebar({
          title: METRIC_FOR_QUESTION_AGGREGATION,
          location: "Our analytics",
          createdBy: "Bobby Tables",
        });

        H.DependencyDiagnostics.list()
          .findByText(METRIC_FOR_MODEL_AGGREGATION)
          .click();
        checkUnreferencedSidebar({
          title: METRIC_FOR_MODEL_AGGREGATION,
          location: "First collection",
          createdBy: "Bobby Tables",
        });

        H.DependencyDiagnostics.list()
          .findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG)
          .click();
        checkUnreferencedSidebar({
          title: SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
          location: "SQL snippets",
          createdBy: "Bobby Tables",
        });

        cy.log("sorting");
        H.DependencyDiagnostics.visitUnreferencedEntities();
        H.DependencyDiagnostics.searchInput().type("Model for");

        cy.log("sorted by name by default");
        checkListSorting({
          visibleEntities: MODELS_SORTED_BY_NAME,
        });

        cy.log("sorted by location ascending");
        H.DependencyDiagnostics.list().findByText("Location").click();
        checkListSorting({
          visibleEntities: MODELS_SORTED_BY_LOCATION,
        });

        cy.log("sorted by location descending");
        H.DependencyDiagnostics.list().findByText("Location").click();
        checkListSorting({
          visibleEntities: [...MODELS_SORTED_BY_LOCATION].reverse(),
        });

        cy.log("sorted by name ascending");
        H.DependencyDiagnostics.list().findByText("Name").click();
        checkListSorting({
          visibleEntities: MODELS_SORTED_BY_NAME,
        });

        cy.log("sorted by name descending");
        H.DependencyDiagnostics.list().findByText("Name").click();
        checkListSorting({
          visibleEntities: [...MODELS_SORTED_BY_NAME].reverse(),
        });
        waitForSavedListParams({
          mode: "unreferenced",
          isSaved: (params) =>
            params.sort_column === "name" && params.sort_direction === "desc",
        });

        cy.log("sorting persisted after page reload");
        H.DependencyDiagnostics.visitUnreferencedEntities();
        H.DependencyDiagnostics.searchInput().type("Model for");
        checkListSorting({
          visibleEntities: [...MODELS_SORTED_BY_NAME].reverse(),
        });

        cy.log("search with type filters");
        H.DependencyDiagnostics.searchInput().clear().type("tag");
        checkList({
          visibleEntities: [
            MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
            SNIPPET_FOR_SNIPPET_TAG,
          ],
          hiddenEntities: [MODEL_FOR_QUESTION_DATA_SOURCE],
        });

        H.DependencyDiagnostics.filterButton().click();
        H.popover().findByText("SQL snippet").click();
        checkList({
          visibleEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG],
          hiddenEntities: [SNIPPET_FOR_SNIPPET_TAG],
        });
        waitForSavedListParams({
          mode: "unreferenced",
          isSaved: (params) =>
            params.group_types != null &&
            !params.group_types.includes("snippet"),
        });

        cy.log("filters persisted from the search step");
        H.DependencyDiagnostics.visitUnreferencedEntities();
        H.DependencyDiagnostics.searchInput().type(ENTITY_SEARCH_TERM);
        checkList({
          visibleEntities: [...MODEL_NAMES, ...SEGMENT_NAMES, ...METRIC_NAMES],
          hiddenEntities: SNIPPET_NAMES,
        });

        cy.log("type");
        H.DependencyDiagnostics.filterButton().click();
        H.popover().findByText("SQL snippet").click();
        checkList({ visibleEntities: SEARCHABLE_ENTITY_NAMES });

        H.popover().findByText("Model").click();
        checkList({ hiddenEntities: MODEL_NAMES });

        H.popover().findByText("Segment").click();
        checkList({
          hiddenEntities: [
            MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
            SEGMENT_FOR_QUESTION_FILTER,
          ],
        });

        H.popover().findByText("Metric").click();
        checkList({
          hiddenEntities: [
            MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
            SEGMENT_FOR_QUESTION_FILTER,
            METRIC_FOR_QUESTION_AGGREGATION,
          ],
        });

        H.popover().findByText("Model").click();
        checkList({
          visibleEntities: [
            MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
            MODEL_FOR_MODEL_DATA_SOURCE,
            MODEL_FOR_METRIC_DATA_SOURCE,
            SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
          ],
        });

        cy.log("location");
        H.popover().findByText("Include items in personal collections").click();
        checkList({
          visibleEntities: [
            MODEL_FOR_MODEL_DATA_SOURCE,
            SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
          ],
          hiddenEntities: [MODEL_FOR_METRIC_DATA_SOURCE],
        });

        H.popover().findByText("Include items in personal collections").click();
        checkList({
          visibleEntities: [
            MODEL_FOR_MODEL_DATA_SOURCE,
            MODEL_FOR_METRIC_DATA_SOURCE,
            SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
          ],
        });
        waitForSavedListParams({
          mode: "unreferenced",
          isSaved: (params) =>
            params.include_personal_collections !== false &&
            params.group_types != null &&
            params.group_types.includes("model") &&
            !params.group_types.includes("segment") &&
            !params.group_types.includes("metric"),
        });

        cy.log("filters persisted after page reload");
        H.DependencyDiagnostics.visitUnreferencedEntities();
        H.DependencyDiagnostics.filterButton().click();
        H.popover().within(() => {
          cy.findByRole("checkbox", { name: "Model" }).should("be.checked");
          cy.findByRole("checkbox", { name: "Segment" }).should(
            "not.be.checked",
          );
          cy.findByRole("checkbox", { name: "Metric" }).should(
            "not.be.checked",
          );
        });
        H.DependencyDiagnostics.searchInput().type(ENTITY_SEARCH_TERM);
        checkList({
          visibleEntities: [MODEL_FOR_NATIVE_QUESTION_CARD_TAG],
          hiddenEntities: [...SEGMENT_NAMES, ...METRIC_NAMES],
        });

        cy.log("snowplow event when dependency graph link is clicked");
        H.DependencyDiagnostics.list()
          .findByText(SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG)
          .click();
        cy.findByRole("link", { name: "View in dependency graph" }).click();
        H.expectUnstructuredSnowplowEvent({
          event: "dependency_entity_selected",
          triggered_from: "diagnostics-unreferenced-list",
          event_detail: "snippet",
        });
      });
    });
  },
);

function createContent() {
  createTransform();
  createTableContent();
  createQuestionContent();
  createModelContent();
  breakTransform();
  waitForBreakingDependencies();
}

function dropTransformTable() {
  cy.get<TransformId>("@transformId").then((transformId) => {
    cy.request("DELETE", `/api/transform/${transformId}/table`);
  });
}

function createTransform() {
  H.createTransform(
    {
      name: TABLE_TRANSFORM,
      source: {
        type: "query",
        query: {
          type: "native",
          database: WRITABLE_DB_ID,
          native: {
            query: "SELECT 1 as score, 'active' as status",
          },
        },
      },
      target: {
        type: "table",
        database: WRITABLE_DB_ID,
        schema: "public",
        name: TRANSFORM_TABLE_NAME,
      },
    },
    { wrapId: true },
  );
  cy.get<TransformId>("@transformId").then((transformId) => {
    H.runTransform(transformId);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TRANSFORM_TABLE_NAME });
    H.waitForTransformRuns(
      (runs) =>
        runs.length === 1 && runs.every((run) => run.status === "succeeded"),
    );
  });
}

function breakTransform() {
  cy.get<TransformId>("@transformId").then((transformId) => {
    cy.request("PUT", `/api/transform/${transformId}`, {
      source: {
        type: "query",
        query: {
          type: "native",
          database: WRITABLE_DB_ID,
          native: {
            query: "SELECT 1 as score_new, 'active' as status_new",
          },
        },
      },
    });
    H.runTransform(transformId);
    H.waitForTransformRuns(
      (runs) =>
        runs.length === 2 && runs.every((run) => run.status === "succeeded"),
    );
  });
}

function createTableContent() {
  H.getTableId({ name: TRANSFORM_TABLE_NAME }).then((tableId) => {
    cy.wrap(tableId).as("tableId");

    H.getFieldId({ tableId, name: "score" }).then((scoreFieldId) => {
      H.getFieldId({ tableId, name: "status" }).then((statusFieldId) => {
        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_FIELD,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            fields: [["field", statusFieldId, null]],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_EXPRESSION,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            expressions: {
              Expression: ["+", ["field", scoreFieldId, null], 0],
            },
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_FILTER,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            filter: ["=", ["field", scoreFieldId, null], 0],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_BREAKOUT,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            breakout: [["field", scoreFieldId, null]],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_AGGREGATION,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            aggregation: [["avg", ["field", scoreFieldId, null]]],
          },
        });

        H.createQuestion({
          name: TABLE_BASED_QUESTION_BROKEN_EXPLICIT_JOIN,
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            joins: [
              {
                "source-table": tableId,
                alias: TRANSFORM_TABLE_DISPLAY_NAME,
                condition: [
                  "=",
                  ["field", statusFieldId, null],
                  [
                    "field",
                    statusFieldId,
                    { "join-alias": TRANSFORM_TABLE_DISPLAY_NAME },
                  ],
                ],
              },
            ],
            aggregation: [
              [
                "max",
                [
                  "field",
                  scoreFieldId,
                  { "join-alias": TRANSFORM_TABLE_DISPLAY_NAME },
                ],
              ],
            ],
          },
        });
      });
    });
  });
}

function createQuestionContent() {
  H.getTableId({ name: TRANSFORM_TABLE_NAME }).then((tableId) => {
    H.createQuestion({
      name: TABLE_BASED_QUESTION,
      database: WRITABLE_DB_ID,
      query: {
        "source-table": tableId,
      },
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    }).then(({ body: card }) => {
      cy.wrap(card.id).as("questionId");
      H.createQuestion({
        name: QUESTION_BASED_QUESTION_BROKEN_FILTER,
        query: {
          "source-table": `card__${card.id}`,
          filter: [
            "and",
            [">", ["field", "PRICE", { "base-type": "type/Float" }], 10],
            ["=", ["field", "TAX", { "base-type": "type/Float" }], 0],
            ["=", ["field", "DISCOUNT", { "base-type": "type/Float" }], 0],
          ],
        },
      });
    });
  });
}

function createModelContent() {
  H.getTableId({ name: TRANSFORM_TABLE_NAME }).then((tableId) => {
    H.createQuestion({
      name: TABLE_BASED_MODEL,
      type: "model",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": tableId,
      },
    }).then(({ body: card }) => {
      cy.wrap(card.id).as("modelId");
      H.createQuestion({
        name: MODEL_BASED_QUESTION_BROKEN_FILTER,
        query: {
          "source-table": `card__${card.id}`,
          filter: [
            "=",
            ["field", "AMOUNT", { "base-type": "type/Integer" }],
            0,
          ],
        },
      });
      H.createQuestion({
        name: MODEL_BASED_MODEL_BROKEN_AGGREGATION,
        type: "model",
        query: {
          "source-table": `card__${card.id}`,
          filter: [
            "and",
            ["=", ["field", "QUANTITY", { "base-type": "type/Integer" }], 0],
            ["=", ["field", "SUBTOTAL", { "base-type": "type/Integer" }], 0],
            ["=", ["field", "TOTAL", { "base-type": "type/Integer" }], 0],
          ],
          aggregation: [
            ["distinct", ["field", "AMOUNT", { "base-type": "type/Integer" }]],
          ],
        },
      });
    });
  });
}

function waitForBreakingDependencies() {
  // The instance already has unrelated (Usage Analytics) breaking dependencies,
  // so a bare count check can pass before the test's own entities are analyzed.
  // Wait until every expected entity is present by name instead.
  H.waitForBreakingDependencies((nodes) =>
    BROKEN_DEPENDENCIES.every((name) =>
      nodes.some((node) => getNodeName(node) === name),
    ),
  );
}

function checkBrokenSidebar({
  title,
  transform,
  missingColumns,
  brokenDependents,
}: {
  title: string;
  transform?: string;
  missingColumns?: string[];
  brokenDependents?: string[];
}) {
  H.DependencyDiagnostics.sidebar().within(() => {
    H.DependencyDiagnostics.Sidebar.header()
      .findByText(title)
      .should("be.visible");
    if (transform) {
      H.DependencyDiagnostics.Sidebar.infoSection()
        .findByText(transform)
        .should("exist");
    }
    if (missingColumns) {
      H.DependencyDiagnostics.Sidebar.missingColumnsSection().within(() => {
        missingColumns.forEach((column) => {
          cy.findByText(column).should("exist");
        });
      });
    }
    if (brokenDependents) {
      H.DependencyDiagnostics.Sidebar.brokenDependentsSection().within(() => {
        brokenDependents.forEach((dependent) => {
          cy.findByText(dependent).should("exist");
        });
      });
    }
  });
}

function sortList({
  header,
  column,
  direction,
}: {
  header: string;
  column: DependencySortColumn;
  direction: SortDirection;
}) {
  H.DependencyDiagnostics.list().findByText(header).click();
  checkListUrlSort({ column, direction });
}

function checkListUrlSort({
  column,
  direction,
}: {
  column: DependencySortColumn;
  direction: SortDirection;
}) {
  cy.location("search")
    .should("include", `sort-column=${column}`)
    .and("include", `sort-direction=${direction}`);
}

function setupEntities({
  withReferences = false,
}: { withReferences?: boolean } = {}) {
  setupTableContent({ withReferences });
  setupModelContent({ withReferences });
  setupSegmentContent({ withReferences });
  setupMetricContent({ withReferences });
  setupSnippetContent({ withReferences });
}

function setupTableContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  H.getTableId({ name: MANY_DATA_TYPES_TABLE_NAME }).then((tableId) => {
    cy.request("PUT", `/api/table/${tableId}`, {
      display_name: MANY_DATA_TYPES_TABLE_DISPLAY_NAME,
      description: TABLE_DESCRIPTION,
      owner_user_id: ADMIN_USER_ID,
    }).then(() => {
      if (withReferences) {
        createQuestionWithTableDataSource({
          name: `${MANY_DATA_TYPES_TABLE_DISPLAY_NAME} -> Question`,
          tableId,
        });
      }
    });
  });
}

function setupModelContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createModelWithTableDataSource({
    name: MODEL_FOR_QUESTION_DATA_SOURCE,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createQuestionWithModelDataSource({
        name: `${MODEL_FOR_QUESTION_DATA_SOURCE} -> Question`,
        modelId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_MODEL_DATA_SOURCE,
    tableId: ORDERS_ID,
    collectionId: FIRST_COLLECTION_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createModelWithModelDataSource({
        name: `${MODEL_FOR_MODEL_DATA_SOURCE} -> Model`,
        modelId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_METRIC_DATA_SOURCE,
    tableId: ORDERS_ID,
    collectionId: ADMIN_PERSONAL_COLLECTION_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createMetricWithModelDataSource({
        name: `${MODEL_FOR_METRIC_DATA_SOURCE} -> Metric`,
        modelId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_NATIVE_QUESTION_CARD_TAG,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createNativeQuestionWithCardTag({
        name: `${MODEL_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
        cardId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE,
    tableId: PRODUCTS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createNativeQuestionWithParameterWithCardSource({
        name: `${MODEL_FOR_NATIVE_QUESTION_PARAMETER_SOURCE} -> Question`,
        tableName: "PRODUCTS",
        tableFieldId: PRODUCTS.CATEGORY,
        cardId: model.id,
        cardFieldName: "CATEGORY",
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_DASHBOARD_CARD,
    tableId: ORDERS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createDashboardWithCard({
        name: `${MODEL_FOR_DASHBOARD_CARD} -> Dashboard Card`,
        cardId: model.id,
      });
    }
  });

  createModelWithTableDataSource({
    name: MODEL_FOR_DASHBOARD_PARAMETER_SOURCE,
    tableId: PRODUCTS_ID,
  }).then(({ body: model }) => {
    if (withReferences) {
      createDashboardWithParameterWithCardSource({
        name: `${MODEL_FOR_DASHBOARD_PARAMETER_SOURCE} -> Dashboard`,
        cardId: model.id,
        cardFieldName: "CATEGORY",
      });
    }
  });
}

function setupSegmentContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_QUESTION_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createQuestionWithSegmentClause({
        name: `${SEGMENT_FOR_QUESTION_FILTER} -> Question`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });

  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_MODEL_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createModelWithSegmentClause({
        name: `${SEGMENT_FOR_MODEL_FILTER} -> Model`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });

  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_SEGMENT_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createSegmentWithSegmentClause({
        name: `${SEGMENT_FOR_SEGMENT_FILTER} -> Segment`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });

  createSegmentWithTableDataSource({
    name: SEGMENT_FOR_METRIC_FILTER,
    tableId: ORDERS_ID,
  }).then(({ body: segment }) => {
    if (withReferences) {
      createMetricWithSegmentClause({
        name: `${SEGMENT_FOR_METRIC_FILTER} -> Metric`,
        tableId: ORDERS_ID,
        segmentId: segment.id,
      });
    }
  });
}

function setupMetricContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createMetricWithTableDataSource({
    name: METRIC_FOR_QUESTION_AGGREGATION,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createQuestionWithMetricClause({
        name: `${METRIC_FOR_QUESTION_AGGREGATION} -> Question`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });

  createMetricWithTableDataSource({
    name: METRIC_FOR_MODEL_AGGREGATION,
    tableId: ORDERS_ID,
    collectionId: FIRST_COLLECTION_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createModelWithMetricClause({
        name: `${METRIC_FOR_MODEL_AGGREGATION} -> Model`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });

  createMetricWithTableDataSource({
    name: METRIC_FOR_METRIC_AGGREGATION,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createMetricWithMetricClause({
        name: `${METRIC_FOR_METRIC_AGGREGATION} -> Metric`,
        tableId: ORDERS_ID,
        metricId: metric.id,
      });
    }
  });

  createMetricWithTableDataSource({
    name: METRIC_FOR_DASHBOARD_CARD,
    tableId: ORDERS_ID,
  }).then(({ body: metric }) => {
    if (withReferences) {
      createDashboardWithCard({
        name: `${METRIC_FOR_DASHBOARD_CARD} -> Dashboard Card`,
        cardId: metric.id,
      });
    }
  });
}

function setupSnippetContent({
  withReferences = false,
}: {
  withReferences?: boolean;
}) {
  createSnippetWithBasicFilter({
    name: SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG,
  }).then(({ body: snippet }) => {
    if (withReferences) {
      createNativeQuestionWithSnippetTag({
        name: `${SNIPPET_FOR_NATIVE_QUESTION_CARD_TAG} -> Question`,
        tableName: "ORDERS",
        snippetId: snippet.id,
        snippetName: snippet.name,
      });
    }
  });

  createSnippetWithBasicFilter({ name: SNIPPET_FOR_SNIPPET_TAG }).then(
    ({ body: snippet }) => {
      if (withReferences) {
        createSnippetWithSnippetTag({
          name: `${SNIPPET_FOR_SNIPPET_TAG} -> Snippet`,
          snippetName: snippet.name,
        });
      }
    },
  );
}

function createQuestionWithModelDataSource({
  name,
  modelId,
}: {
  name: string;
  modelId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
}

function createQuestionWithTableDataSource({
  name,
  tableId,
}: {
  name: string;
  tableId: TableId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": tableId,
    },
  });
}

function createQuestionWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createQuestionWithMetricClause({
  name,
  tableId,
  metricId,
}: {
  name: string;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "question",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createNativeQuestionWithCardTag({
  name,
  cardId,
}: {
  name: string;
  cardId: CardId;
}) {
  const tagName = `#${cardId}`;

  return H.createNativeQuestion({
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

function createNativeQuestionWithParameterWithCardSource({
  name,
  tableName,
  tableFieldId,
  cardId,
  cardFieldName,
}: {
  name: string;
  tableName: string;
  tableFieldId: FieldId;
  cardId: CardId;
  cardFieldName: string;
}) {
  return H.createNativeQuestion({
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
      createMockParameter({
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

function createNativeQuestionWithSnippetTag({
  name,
  tableName,
  snippetId,
  snippetName,
}: {
  name: string;
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  const tagName = `snippet: ${snippetName}`;

  return H.createNativeQuestion({
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

function createModelWithTableDataSource({
  name,
  tableId,
  collectionId,
}: {
  name: string;
  tableId: TableId;
  collectionId?: CollectionId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
    },
    collection_id: collectionId,
  });
}

function createModelWithModelDataSource({
  name,
  modelId,
}: {
  name: string;
  modelId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
}

function createModelWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
}

function createModelWithMetricClause({
  name,
  tableId,
  metricId,
}: {
  name: string;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "model",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createSegmentWithTableDataSource({
  name,
  tableId,
}: {
  name: string;
  tableId: TableId;
}) {
  return H.createSegment({
    name,
    definition: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": tableId,
        filter: ["=", "A", "A"],
      },
    },
  });
}

function createSegmentWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createSegment({
    name,
    definition: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": tableId,
        filter: ["segment", segmentId],
      },
    },
  });
}

function createMetricWithTableDataSource({
  name,
  tableId,
  collectionId,
}: {
  name: string;
  tableId: TableId;
  collectionId?: CollectionId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
    collection_id: collectionId,
  });
}

function createMetricWithModelDataSource({
  name,
  modelId,
}: {
  name: string;
  modelId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [["count"]],
    },
  });
}

function createMetricWithSegmentClause({
  name,
  tableId,
  segmentId,
}: {
  name: string;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      filter: ["segment", segmentId],
      aggregation: [["count"]],
    },
  });
}

function createMetricWithMetricClause({
  name,
  tableId,
  metricId,
}: {
  name: string;
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createQuestion({
    name,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createSnippetWithBasicFilter({ name }: { name: string }) {
  return H.createSnippet({
    name,
    content: "1 = 1",
  });
}

function createSnippetWithSnippetTag({
  name,
  snippetName,
}: {
  name: string;
  snippetName: string;
}) {
  return H.createSnippet({
    name,
    content: `{{snippet: ${snippetName}}}`,
  });
}

function createDashboardWithCard({
  name,
  cardId,
}: {
  name: string;
  cardId: CardId;
}) {
  return H.createDashboard({ name }).then(({ body: dashboard }) => {
    H.updateDashboardCards({
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: cardId,
        },
      ],
    });
  });
}

function createDashboardWithParameterWithCardSource({
  name,
  cardId,
  cardFieldName,
}: {
  name: string;
  cardId: CardId;
  cardFieldName: string;
}) {
  return H.createDashboard({
    name,
    parameters: [
      createMockParameter({
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

// The dependency graph is recomputed asynchronously when entities are created or
// updated (metabase#71037). `waitForBackfillComplete` only reports the global
// one-time backfill flag — it does NOT guarantee the entities `setupEntities()`
// just created have been classified into the unreferenced graph. The list page
// fires a single query on load, so visiting before that async analysis finishes
// renders an incomplete list and the `findByText` assertions time out (4000ms).
//
// Poll the unreferenced endpoint until every expected entity is present before
// visiting. Defaults to the full seeded set, which is a superset of what any
// individual test asserts, so a single arg-free call makes every list test
// deterministic. The writable-Postgres table reaches the graph via the slower
// async DB-sync path, so it is covered here too. Mirrors
// `waitForBreakingDependencies`.
function waitForUnreferencedAnalysis(expectedNames: string[] = ENTITY_NAMES) {
  H.waitForBackfillComplete();
  H.waitForUnreferencedEntities((nodes) => {
    const presentNames = new Set(nodes.map(getNodeName));
    return expectedNames.every((name) => presentNames.has(name));
  });
}

// The unreferenced endpoint returns one page, so narrow it with `query` when
// the expected entities are not all on the first page.
function waitForSearchedUnreferencedAnalysis({
  query,
  expectedNames,
  timeoutMs = 30000,
}: {
  query: string;
  expectedNames: string[];
  timeoutMs?: number;
}): Cypress.Chainable {
  const intervalMs = 100;

  return cy
    .request<ListUnreferencedGraphNodesResponse>({
      method: "GET",
      url: "/api/ee/dependencies/graph/unreferenced",
      qs: { query, "include-personal-collections": true },
    })
    .then(({ body }) => {
      const presentNames = new Set(body.data.map(getNodeName));
      if (expectedNames.every((name) => presentNames.has(name))) {
        return;
      }
      if (timeoutMs <= 0) {
        throw new Error("Unreferenced entities analysis retry timeout");
      }
      cy.wait(intervalMs);
      waitForSearchedUnreferencedAnalysis({
        query,
        expectedNames,
        timeoutMs: timeoutMs - intervalMs,
      });
    });
}

function checkUnreferencedSidebar({
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
}) {
  const Sidebar = H.DependencyDiagnostics.Sidebar;

  H.DependencyDiagnostics.sidebar().within(() => {
    Sidebar.header().findByText(title).should("be.visible");
    if (location) {
      Sidebar.locationSection()
        .findByText(location)
        .scrollIntoView()
        .should("be.visible");
    }
    if (description) {
      Sidebar.infoSection().should("contain.text", description);
    }
    if (owner) {
      Sidebar.infoSection().should("contain.text", owner);
    }
    if (createdBy) {
      Sidebar.infoSection().should("contain.text", createdBy);
    }
    if (fields.length > 0) {
      Sidebar.fieldsSection().within(() => {
        fields.forEach((field) => {
          cy.findByText(field).scrollIntoView().should("be.visible");
        });
      });
    }
  });
}

// Polls the saved list params, so that a page reload restores the last change.
function waitForSavedListParams({
  mode,
  isSaved,
  timeoutMs = 10000,
}: {
  mode: "broken" | "unreferenced";
  isSaved: (params: DependencyDiagnosticsUserParams) => boolean;
  timeoutMs?: number;
}): Cypress.Chainable {
  const intervalMs = 100;

  return cy
    .request<DependencyDiagnosticsUserParams | "">({
      method: "GET",
      url: `/api/user-key-value/namespace/dependency_diagnostics/key/${mode}`,
    })
    .then(({ body }) => {
      if (typeof body === "object" && body != null && isSaved(body)) {
        return;
      }
      if (timeoutMs <= 0) {
        throw new Error(`Saved ${mode} list params retry timeout`);
      }
      cy.wait(intervalMs);
      waitForSavedListParams({
        mode,
        isSaved,
        timeoutMs: timeoutMs - intervalMs,
      });
    });
}

function getNodeName(node: DependencyNode): string | undefined {
  const { data } = node;
  if ("display_name" in data && data.display_name) {
    return data.display_name;
  }
  return "name" in data ? data.name : undefined;
}

function checkList({
  visibleEntities = [],
  hiddenEntities = [],
}: {
  visibleEntities?: string[];
  hiddenEntities?: string[];
}) {
  H.DependencyDiagnostics.list().within(() => {
    visibleEntities.forEach((name) => {
      cy.findByText(name).scrollIntoView().should("be.visible");
    });
    hiddenEntities.forEach((name) => {
      cy.findByText(name).should("not.exist");
    });
  });
}

function checkListSorting({ visibleEntities }: { visibleEntities: string[] }) {
  H.DependencyDiagnostics.list().within(() => {
    visibleEntities.forEach((name, index) => {
      cy.findByText(name)
        .parents("[data-index]")
        .should("have.attr", "data-index", index.toString());
    });
  });
}
