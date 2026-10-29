const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  CardId,
  CardType,
  CollectionId,
  DashboardId,
  DependencyId,
  DependencyType,
  IconName,
  MeasureId,
  NativeQuerySnippetId,
  OpaqueDatasetQuery,
  SegmentId,
  TableId,
  TestAggregationSpec,
  TestNativeQuerySpec,
  TestStageSpec,
  TestStageWithSourceSpec,
  WritebackActionId,
  WritebackParameter,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

const BASE_URL = "/data-studio/dependencies";
const TABLE_NAME = "scoreboard_actions";
const TABLE_DISPLAY_NAME = "Scoreboard Actions";
const TABLE_ID_ALIAS = "tableId";
const TRANSFORM_TABLE_NAME = "transform_table";
const TRANSFORM_TABLE_DISPLAY_NAME = "Transform Table";
const TABLE_BASED_QUESTION_NAME = "Table-based question";
const TABLE_BASED_MODEL_NAME = "Table-based model";
const TABLE_BASED_MEASURE_NAME = "Table-based measure";
const TABLE_BASED_METRIC_NAME = "Table-based metric";
const TABLE_BASED_TRANSFORM_NAME = "Table-based transform";
const QUESTION_BASED_NAME_PREFIX = "Question-based";
const QUESTION_BASED_TRANSFORM_TABLE_NAME = "question_based_transform_table";
const MODEL_BASED_NAME_PREFIX = "Model-based";
const MODEL_BASED_TRANSFORM_TABLE_NAME = "model_based_transform_table";
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
const DATA_ACTIONS_FOLDER_NAME = "Data actions folder";
const TABLE_BASED_ACTION_NAME = "Table-based data action";
const SNIPPET_BASED_ACTION_NAME = "Snippet-based data action";
const DATA_ACTIONS_ROOT_NAME = "Data actions";
const ROOT_COLLECTION_NAME = "Our analytics";
const FIRST_COLLECTION_NAME = "First collection";
const DASHBOARD_NAME = "Dashboard";
const DOCUMENT_NAME = "Document";

describe("scenarios > dependencies > dependency graph", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TABLE_NAME });
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE_NAME });
    H.getTableId({ name: TABLE_NAME }).as(TABLE_ID_ALIAS);
    H.resetSnowplow();
  });

  describe("entity search", () => {
    function testEntitySearch({
      itemName,
      itemIcon,
      isRecentItem,
      eventDetail,
      eventCount,
    }: {
      itemName: string;
      itemIcon: IconName;
      isRecentItem: boolean;
      eventDetail: DependencyType;
      eventCount: number;
    }) {
      cy.log(`verify that "${itemName}" can be found via search`);
      H.DependencyGraph.entrySearchInput().clear().type(itemName);
      H.popover().findByText(itemName).click();
      H.expectUnstructuredSnowplowEvent(
        {
          event: "dependency_entity_selected",
          triggered_from: "dependency-graph",
          event_detail: eventDetail,
        },
        eventCount,
      );

      H.DependencyGraph.entryButton().should("have.text", itemName);
      H.DependencyGraph.entryButton().icon(itemIcon).should("be.visible");
      H.DependencyGraph.entryButton().icon("close").click();

      if (isRecentItem) {
        H.DependencyGraph.entrySearchInput().click();
        H.popover().findByText(itemName).should("be.visible");
      }
    }

    function testEntityPicker({
      path,
      itemIcon,
    }: {
      path: (string | RegExp)[];
      itemIcon: IconName;
    }) {
      const itemName = path[path.length - 1];
      const itemLevel = path.length - 1;
      cy.log(`verify that "${itemName}" can be selected in the picker`);
      H.DependencyGraph.entrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.pickEntity({ path });
      H.DependencyGraph.entryButton().should("have.text", itemName);
      H.DependencyGraph.entryButton().icon(itemIcon).should("be.visible");

      cy.log(`verify that "${itemName}" is selected when the picker is opened`);
      H.DependencyGraph.entryButton().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(itemLevel, itemName).should(
          "have.attr",
          "data-active",
          "true",
        );
        cy.findByLabelText("Close").click();
      });
      H.DependencyGraph.entryButton().icon("close").click();
    }

    function testEntityPickerSearch({
      itemName,
      itemIcon,
    }: {
      itemName: string;
      itemIcon: IconName;
    }) {
      cy.log(`verify that "${itemName}" can be found via search"`);
      H.DependencyGraph.entrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        cy.findByPlaceholderText(/Search/).type(itemName);
        cy.findByText(/results for/).should("be.visible");
        cy.findByTestId("search-scope-selector")
          .findByText("Everywhere")
          .click();
        cy.findByText(itemName).click();
      });
      H.DependencyGraph.entryButton().should("have.text", itemName);
      H.DependencyGraph.entryButton().icon(itemIcon).should("be.visible");
      H.DependencyGraph.entryButton().icon("close").click();
    }

    it("should be able to use inline search and the entity picker for all supported entity types", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedMetric({ tableId });
        createTableBasedTransform({ tableName: TABLE_NAME });
      });
      createEmptySnippet();
      createDataActionsFolder().then(({ body: folder }) =>
        createTableBasedAction({ collectionId: folder.id }),
      );
      visitGraph();

      testEntitySearch({
        itemName: "Products",
        itemIcon: "table",
        isRecentItem: true,
        eventDetail: "table",
        eventCount: 1,
      });
      testEntitySearch({
        itemName: "Orders, Count, Grouped by Created At (year)",
        itemIcon: "line",
        isRecentItem: true,
        eventDetail: "card",
        eventCount: 1,
      });
      testEntitySearch({
        itemName: "Orders Model",
        itemIcon: "model",
        isRecentItem: true,
        eventDetail: "card",
        eventCount: 2,
      });
      testEntitySearch({
        itemName: TABLE_BASED_METRIC_NAME,
        itemIcon: "metric",
        isRecentItem: false,
        eventDetail: "card",
        eventCount: 3,
      });
      testEntitySearch({
        itemName: TABLE_BASED_TRANSFORM_NAME,
        itemIcon: "transform",
        isRecentItem: false,
        eventDetail: "transform",
        eventCount: 1,
      });

      testEntityPicker({
        path: ["Databases", /Sample Database/, "Products"],
        itemIcon: "table",
      });
      testEntityPickerSearch({
        itemName: "Products",
        itemIcon: "table",
      });
      testEntityPicker({
        path: ["Our analytics", "Orders, Count, Grouped by Created At (year)"],
        itemIcon: "line",
      });
      testEntityPickerSearch({
        itemName: "Orders, Count, Grouped by Created At (year)",
        itemIcon: "line",
      });
      testEntityPicker({
        path: ["Our analytics", "Orders Model"],
        itemIcon: "model",
      });
      testEntityPickerSearch({
        itemName: "Orders Model",
        itemIcon: "model",
      });
      testEntityPicker({
        path: ["Our analytics", TABLE_BASED_METRIC_NAME],
        itemIcon: "metric",
      });
      testEntityPickerSearch({
        itemName: TABLE_BASED_METRIC_NAME,
        itemIcon: "metric",
      });
      testEntityPicker({
        path: [/Transforms/, TABLE_BASED_TRANSFORM_NAME],
        itemIcon: "transform",
      });
      testEntityPickerSearch({
        itemName: TABLE_BASED_TRANSFORM_NAME,
        itemIcon: "transform",
      });
      testEntityPicker({
        path: ["SQL Snippets", EMPTY_SNIPPET_NAME],
        itemIcon: "snippet",
      });
      testEntityPicker({
        path: [
          DATA_ACTIONS_ROOT_NAME,
          DATA_ACTIONS_FOLDER_NAME,
          TABLE_BASED_ACTION_NAME,
        ],
        itemIcon: "bolt",
      });
    });
  });

  describe("dependent types", () => {
    it("should display dependencies for a table, filter them, and navigate to them", () => {
      getScoreboardTableId().then((tableId) => {
        createDashboard().then(({ body: dashboard }) => {
          createTableBasedQuestion({
            name: "Question in root collection",
            tableId,
          });
          createTableBasedQuestion({
            name: "Question in first collection",
            tableId,
            collectionId: FIRST_COLLECTION_ID,
          });
          createTableBasedQuestion({
            name: "Question in second collection",
            tableId,
            collectionId: SECOND_COLLECTION_ID,
          });
          createTableBasedQuestion({
            name: "Question in personal collection",
            tableId,
            collectionId: ADMIN_PERSONAL_COLLECTION_ID,
          });
          createTableBasedQuestion({
            name: "Question in dashboard",
            tableId,
            dashboardId: dashboard.id,
          });
        });
        createDocumentWithTableBasedQuestion({
          name: "Question in document",
          tableId,
        });
        createTableBasedModel({ tableId });
        createTableBasedMetric({ tableId });
        createTableBasedTransform({ tableName: TABLE_NAME }).then(
          ({ body: transform }) => {
            H.runTransformAndWaitForSuccess(transform.id);
          },
        );
        createTableBasedSegment({ tableId });
        createTableBasedMeasure({ tableId });
        createTableBasedAction();
        visitGraphForEntity(tableId, "table");
      });

      cy.log("question dependents and their locations");
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_DISPLAY_NAME)
        .findByText("6 questions")
        .click();
      verifyItems({
        visibleItems: [
          "Question in dashboard",
          "Question in document",
          "Question in root collection",
          "Question in first collection",
          "Question in second collection",
          "Question in personal collection",
        ],
      });
      verifyItemLocation({
        itemTitle: "Question in root collection",
        location: ROOT_COLLECTION_NAME,
      });
      verifyItemLocation({
        itemTitle: "Question in first collection",
        location: FIRST_COLLECTION_NAME,
      });
      verifyItemLocation({
        itemTitle: "Question in dashboard",
        location: DASHBOARD_NAME,
      });
      verifyItemLocation({
        itemTitle: "Question in document",
        location: DOCUMENT_NAME,
      });

      cy.log("question dependents without items in personal collections");
      toggleFilter({
        filterName: "Include items in personal collections",
      });
      verifyItems({
        visibleItems: [
          "Question in dashboard",
          "Question in document",
          "Question in root collection",
          "Question in first collection",
          "Question in second collection",
        ],
        hiddenItems: ["Question in personal collection"],
      });

      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "6 questions",
        dependentItemTitle: "Question in document",
        dependentItemLocation: DOCUMENT_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 model",
        dependentItemTitle: TABLE_BASED_MODEL_NAME,
        dependentItemLocation: ROOT_COLLECTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: TABLE_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 segment",
        dependentItemTitle: TABLE_BASED_SEGMENT_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: TABLE_BASED_MEASURE_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 data action",
        dependentItemTitle: TABLE_BASED_ACTION_NAME,
        dependentItemLocation: DATA_ACTIONS_ROOT_NAME,
      });

      cy.log("transform dependents");
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_DISPLAY_NAME)
        .findByText("1 transform")
        .click();
      H.DependencyGraph.dependencyPanel()
        .findByText(TABLE_BASED_TRANSFORM_NAME)
        .click();
      H.DependencyGraph.entryButton()
        .findByText(TABLE_BASED_TRANSFORM_NAME)
        .should("be.visible");
      H.DependencyGraph.dependencyPanel()
        .findByRole("button", { name: "Close" })
        .click();
      H.DependencyGraph.dependencyPanel().should("not.exist");
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_TRANSFORM_NAME,
        groupTitle: "1 table",
        dependentItemTitle: TRANSFORM_TABLE_DISPLAY_NAME,
      });
    });

    it("should display dependencies for a segment and navigate to them", () => {
      getScoreboardTableId().then((tableId) =>
        createTableBasedSegment({ tableId }).then(({ body: segment }) => {
          createSegmentBasedQuestion({ tableId, segmentId: segment.id });
          createSegmentBasedModel({ tableId, segmentId: segment.id });
          createSegmentBaseMeasure({ tableId, segmentId: segment.id });
          createSegmentBasedMetric({ tableId, segmentId: segment.id });
          createSegmentBasedSegment({ tableId, segmentId: segment.id });
          visitGraphForEntity(segment.id, "segment");
        }),
      );
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 question",
        dependentItemTitle: SEGMENT_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 model",
        dependentItemTitle: SEGMENT_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: SEGMENT_BASED_MEASURE_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: SEGMENT_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 segment",
        dependentItemTitle: SEGMENT_BASED_SEGMENT_NAME,
      });
    });

    it("should display dependencies for a question and a model and navigate to them", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedQuestion({ tableId }).then((card) => {
          createCardBasedDependents({
            cardId: card.id,
            namePrefix: QUESTION_BASED_NAME_PREFIX,
            transformTableName: QUESTION_BASED_TRANSFORM_TABLE_NAME,
          });
          cy.wrap(card.id).as("questionId");
        });
        createTableBasedModel({ tableId }).then((card) => {
          createCardBasedDependents({
            cardId: card.id,
            namePrefix: MODEL_BASED_NAME_PREFIX,
            transformTableName: MODEL_BASED_TRANSFORM_TABLE_NAME,
          });
        });
      });
      cy.get<CardId>("@questionId").then((questionId) =>
        visitGraphForEntity(questionId, "card"),
      );

      cy.log("jump to an entity on the graph");
      H.DependencyGraph.graph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME).should("be.visible");
        cy.findByLabelText(TABLE_BASED_QUESTION_NAME).should("be.visible");
      });
      verifyNodeCentered({ nodeLabel: TABLE_DISPLAY_NAME, isCentered: false });
      H.DependencyGraph.selectionButton().click();
      H.popover().findByText(TABLE_DISPLAY_NAME).click();
      verifyNodeCentered({ nodeLabel: TABLE_DISPLAY_NAME, isCentered: true });

      cy.log("question dependents");
      verifyCardDependentsNavigation({
        itemTitle: TABLE_BASED_QUESTION_NAME,
        namePrefix: QUESTION_BASED_NAME_PREFIX,
      });

      cy.log("model dependents");
      H.DependencyGraph.entryButton().icon("close").click();
      H.DependencyGraph.entrySearchInput().type(TABLE_BASED_MODEL_NAME);
      H.popover().findByText(TABLE_BASED_MODEL_NAME).click();
      H.DependencyGraph.entryButton().should(
        "have.text",
        TABLE_BASED_MODEL_NAME,
      );
      verifyCardDependentsNavigation({
        itemTitle: TABLE_BASED_MODEL_NAME,
        namePrefix: MODEL_BASED_NAME_PREFIX,
      });
    });

    it("should display dependencies for a measure and navigate to them", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedMeasure({ tableId }).then(({ body: measure }) => {
          createMeasureBasedQuestion({ tableId, measureId: measure.id });
          createMeasureBasedModel({ tableId, measureId: measure.id });
          createMeasureBasedMetric({ tableId, measureId: measure.id });
          createMeasureBasedTransform({ tableId, measureId: measure.id });
          createMeasureBasedMeasure({ tableId, measureId: measure.id });

          visitGraphForEntity(measure.id, "measure");
        });
      });

      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 question",
        dependentItemTitle: MEASURE_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 model",
        dependentItemTitle: MEASURE_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: MEASURE_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: MEASURE_BASED_TRANSFORM_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: MEASURE_BASED_MEASURE_NAME,
      });
    });

    it("should display dependencies for a metric and navigate to them", () => {
      getScoreboardTableId().then((tableId) =>
        createTableBasedMetric({ tableId }).then((card) => {
          createMetricBasedQuestion({ tableId, metricId: card.id });
          createMetricBasedModel({ tableId, metricId: card.id });
          createMetricBasedMetric({ tableId, metricId: card.id });
          createMetricBasedTransform({ tableId, metricId: card.id });
          visitGraphForEntity(card.id, "card");
        }),
      );
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 question",
        dependentItemTitle: METRIC_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 model",
        dependentItemTitle: METRIC_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: METRIC_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: METRIC_BASED_TRANSFORM_NAME,
      });
    });

    it("should display dependencies for a snippet and navigate to them", () => {
      createEmptySnippet().then(({ body: snippet }) => {
        createSnippetBasedQuestion({
          tableName: TABLE_NAME,
          snippetId: snippet.id,
          snippetName: snippet.name,
        });
        createSnippetBasedModel({
          tableName: TABLE_NAME,
          snippetId: snippet.id,
          snippetName: snippet.name,
        });
        createSnippetBasedTransform({
          tableName: TABLE_NAME,
          snippetId: snippet.id,
          snippetName: snippet.name,
        });
        createSnippetBasedSnippet({ snippetName: snippet.name });
        createSnippetBasedAction({
          tableName: TABLE_NAME,
          snippetId: snippet.id,
          snippetName: snippet.name,
        });
        visitGraphForEntity(snippet.id, "snippet");
      });
      verifyPanelNavigation({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 question",
        dependentItemTitle: SNIPPET_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 model",
        dependentItemTitle: SNIPPET_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: SNIPPET_BASED_TRANSFORM_NAME,
      });
      verifyPanelNavigation({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 SQL snippet",
        dependentItemTitle: SNIPPET_BASED_SNIPPET_NAME,
      });
      verifyPanelNavigation({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 data action",
        dependentItemTitle: SNIPPET_BASED_ACTION_NAME,
      });
    });

    it("should display the dependencies and parameters of a data action", () => {
      createDataActionsFolder().then(({ body: folder }) =>
        createTableBasedAction({ collectionId: folder.id }).then(
          ({ body: action }) => {
            H.waitForBackfillComplete();
            cy.visit(`/data-studio/actions/${action.id}`);
          },
        ),
      );

      cy.log("open the dependencies tab of the data action");
      cy.findByRole("link", { name: "Dependencies" }).click();
      H.DependencyGraph.graph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME).should("be.visible");
        cy.findByLabelText(TABLE_BASED_ACTION_NAME).should("be.visible");
      });

      cy.log("the info panel shows the data action's folder and parameters");
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_BASED_ACTION_NAME)
        .findByText(TABLE_BASED_ACTION_NAME)
        .click();
      H.DependencyGraph.infoPanel().within(() => {
        cy.findByText(DATA_ACTIONS_FOLDER_NAME).should("be.visible");
        cy.findByText("Parameters").should("be.visible");
        cy.findByText("Team ID").should("be.visible");
      });

      cy.log("navigate from the table to the data action");
      getScoreboardTableId().then((tableId) =>
        visitGraphForEntity(tableId, "table"),
      );
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 data action",
        dependentItemTitle: TABLE_BASED_ACTION_NAME,
        dependentItemLocation: DATA_ACTIONS_FOLDER_NAME,
      });
    });
  });
});

function visitGraph() {
  cy.visit(BASE_URL);
}

function toggleFilter({ filterName }: { filterName: string }) {
  H.DependencyGraph.dependencyPanel().icon("filter").click();
  H.popover().findByText(filterName).click();
  H.DependencyGraph.dependencyPanel().icon("filter").click();
}

function verifyItems({
  visibleItems = [],
  hiddenItems = [],
}: {
  visibleItems?: string[];
  hiddenItems?: string[];
}) {
  H.DependencyGraph.dependencyPanel().within(() => {
    visibleItems.forEach((item) => cy.findByText(item).should("be.visible"));
    hiddenItems.forEach((item) => cy.findByText(item).should("not.exist"));
  });
}

function verifyItemLocation({
  itemTitle,
  location,
}: {
  itemTitle: string;
  location: string;
}) {
  H.DependencyGraph.dependencyPanel()
    .findByLabelText(itemTitle)
    .findByText(location)
    .should("be.visible");
}

function verifyCardDependentsNavigation({
  itemTitle,
  namePrefix,
}: {
  itemTitle: string;
  namePrefix: string;
}) {
  const names = getCardBasedDependentNames(namePrefix);
  verifyPanelNavigation({
    itemTitle,
    groupTitle: "1 question",
    dependentItemTitle: names.question,
  });
  verifyPanelNavigation({
    itemTitle,
    groupTitle: "1 model",
    dependentItemTitle: names.model,
  });
  verifyPanelNavigation({
    itemTitle,
    groupTitle: "1 metric",
    dependentItemTitle: names.metric,
  });
  verifyPanelNavigation({
    itemTitle,
    groupTitle: "1 transform",
    dependentItemTitle: names.transform,
  });
  verifyPanelNavigation({
    itemTitle,
    groupTitle: "1 SQL snippet",
    dependentItemTitle: names.snippet,
  });
  verifyPanelNavigation({
    itemTitle,
    groupTitle: "1 data action",
    dependentItemTitle: names.action,
  });
}

function getElementCenter(element: HTMLElement) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { x: left + width / 2, y: top + height / 2 };
}

function verifyNodeCentered({
  nodeLabel,
  isCentered,
}: {
  nodeLabel: string;
  isCentered: boolean;
}) {
  const maxOffsetPx = 10;

  H.DependencyGraph.graph().then(($graph) => {
    const graphCenter = getElementCenter($graph[0]);
    H.DependencyGraph.graph()
      .findByLabelText(nodeLabel)
      .should(($node) => {
        const nodeCenter = getElementCenter($node[0]);
        const offsetPx = Math.hypot(
          nodeCenter.x - graphCenter.x,
          nodeCenter.y - graphCenter.y,
        );
        if (isCentered) {
          expect(offsetPx).to.be.lessThan(maxOffsetPx);
        } else {
          expect(offsetPx).to.be.greaterThan(maxOffsetPx);
        }
      });
  });
}

function verifyPanelNavigation({
  itemTitle,
  groupTitle,
  dependentItemTitle,
  dependentItemLocation,
}: {
  itemTitle: string;
  groupTitle: string;
  dependentItemTitle: string;
  dependentItemLocation?: string;
}) {
  H.DependencyGraph.graph()
    .findByLabelText(itemTitle)
    .findByText(groupTitle)
    .click();
  H.DependencyGraph.dependencyPanel()
    .findByLabelText(dependentItemTitle)
    .within(() => {
      if (dependentItemLocation) {
        cy.findByText(dependentItemLocation).should("be.visible");
      }
      cy.findByText(dependentItemTitle).should("be.visible").click();
    });
  H.DependencyGraph.entryButton()
    .findByText(dependentItemTitle)
    .should("be.visible");
  cy.go("back");
  H.DependencyGraph.entryButton().findByText(itemTitle).should("be.visible");
}

function visitGraphForEntity(id: DependencyId, type: DependencyType) {
  // Wait for async dependency computation to complete before navigating
  H.waitForBackfillComplete();
  return cy.visit(BASE_URL, { qs: { id, type } });
}

function getScoreboardTableId() {
  return cy.get<number>(`@${TABLE_ID_ALIAS}`);
}

function createWritableQuery(stage: TestStageWithSourceSpec) {
  return H.createTestQuery({ database: WRITABLE_DB_ID, stages: [stage] });
}

function createWritableNativeQuery(spec: TestNativeQuerySpec) {
  return H.createTestNativeQuery({ database: WRITABLE_DB_ID, ...spec });
}

function createCardFromStage({
  name,
  type,
  stage,
  collectionId,
  dashboardId,
}: {
  name: string;
  type: CardType;
  stage: TestStageWithSourceSpec;
  collectionId?: CollectionId | null;
  dashboardId?: DashboardId | null;
}) {
  return createWritableQuery(stage).then((query) =>
    H.createCard({
      name,
      type,
      dataset_query: query,
      collection_id: collectionId,
      dashboard_id: dashboardId,
    }),
  );
}

function createTransformFromQuery({
  name,
  tableName,
  query,
}: {
  name: string;
  tableName: string;
  query: OpaqueDatasetQuery;
}) {
  return H.createTransform({
    name,
    source: { type: "query", query },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: tableName,
    },
  });
}

function getSnippetTemplateTags({
  snippetId,
  snippetName,
}: {
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}): TestNativeQuerySpec["templateTags"] {
  return {
    [`snippet: ${snippetName}`]: {
      type: "snippet",
      "snippet-id": snippetId,
      "snippet-name": snippetName,
    },
  };
}

function createTableBasedCard({
  name,
  type,
  tableId,
  collectionId,
  dashboardId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  collectionId?: CollectionId | null;
  dashboardId?: DashboardId | null;
}) {
  return createCardFromStage({
    name,
    type,
    stage: { source: { type: "table", id: tableId } },
    collectionId,
    dashboardId,
  });
}

function createTableBasedQuestion({
  name = TABLE_BASED_QUESTION_NAME,
  tableId,
  collectionId = null,
  dashboardId = null,
}: {
  name?: string;
  tableId: TableId;
  collectionId?: CollectionId | null;
  dashboardId?: DashboardId | null;
}) {
  return createTableBasedCard({
    name,
    type: "question",
    tableId,
    collectionId,
    dashboardId,
  });
}

function createTableBasedModel({
  name = TABLE_BASED_MODEL_NAME,
  tableId,
  collectionId,
}: {
  name?: string;
  tableId: TableId;
  collectionId?: CollectionId | null;
}) {
  return createTableBasedCard({
    name,
    type: "model",
    tableId,
    collectionId,
  });
}

function getCardBasedDependentNames(namePrefix: string) {
  return {
    question: `${namePrefix} question`,
    model: `${namePrefix} model`,
    metric: `${namePrefix} metric`,
    transform: `${namePrefix} transform`,
    snippet: `${namePrefix} snippet`,
    action: `${namePrefix} data action`,
  };
}

function createCardBasedDependents({
  cardId,
  namePrefix,
  transformTableName,
}: {
  cardId: CardId;
  namePrefix: string;
  transformTableName: string;
}) {
  const names = getCardBasedDependentNames(namePrefix);
  const source = { type: "card", id: cardId } as const;
  createCardFromStage({
    name: names.question,
    type: "question",
    stage: { source },
  });
  createCardFromStage({ name: names.model, type: "model", stage: { source } });
  createCardFromStage({
    name: names.metric,
    type: "metric",
    stage: { source, aggregations: [{ type: "operator", operator: "count" }] },
  });
  createWritableQuery({ source }).then((query) =>
    createTransformFromQuery({
      name: names.transform,
      tableName: transformTableName,
      query,
    }),
  );
  H.createSnippet({
    name: names.snippet,
    content: `{{#${cardId}}}`,
  });
  createCardBasedAction({ name: names.action, cardId });
}

function createMetricBasedCard({
  name,
  type,
  tableId,
  metricId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  metricId: CardId;
}) {
  return createCardFromStage({
    name,
    type,
    stage: {
      source: { type: "table", id: tableId },
      aggregations: [{ type: "metric", id: metricId }],
    },
  });
}

function createMetricBasedQuestion({
  tableId,
  metricId,
}: {
  tableId: TableId;
  metricId: CardId;
}) {
  return createMetricBasedCard({
    name: METRIC_BASED_QUESTION_NAME,
    type: "question",
    tableId,
    metricId,
  });
}

function createMetricBasedModel({
  tableId,
  metricId,
}: {
  tableId: TableId;
  metricId: CardId;
}) {
  return createMetricBasedCard({
    name: METRIC_BASED_MODEL_NAME,
    type: "model",
    tableId,
    metricId,
  });
}

function createSnippetBasedCard({
  name,
  type,
  tableName,
  snippetId,
  snippetName,
}: {
  name: string;
  type: CardType;
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  return createWritableNativeQuery({
    query: `SELECT * FROM ${tableName} WHERE {{snippet: ${snippetName}}}`,
    templateTags: getSnippetTemplateTags({ snippetId, snippetName }),
  }).then((query) => H.createCard({ name, type, dataset_query: query }));
}

function createSnippetBasedQuestion({
  tableName,
  snippetId,
  snippetName,
}: {
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  return createSnippetBasedCard({
    name: SNIPPET_BASED_QUESTION_NAME,
    type: "question",
    tableName,
    snippetId,
    snippetName,
  });
}

function createSnippetBasedModel({
  tableName,
  snippetId,
  snippetName,
}: {
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  return createSnippetBasedCard({
    name: SNIPPET_BASED_MODEL_NAME,
    type: "model",
    tableName,
    snippetId,
    snippetName,
  });
}

function createTableBasedMetric({ tableId }: { tableId: TableId }) {
  return createCardFromStage({
    name: TABLE_BASED_METRIC_NAME,
    type: "metric",
    stage: {
      source: { type: "table", id: tableId },
      aggregations: [{ type: "operator", operator: "count" }],
    },
  });
}

function createMetricBasedMetric({
  tableId,
  metricId,
}: {
  tableId: TableId;
  metricId: CardId;
}) {
  return createMetricBasedCard({
    name: METRIC_BASED_METRIC_NAME,
    type: "metric",
    tableId,
    metricId,
  });
}

function createTableBasedTransform({ tableName }: { tableName: string }) {
  return createWritableNativeQuery({
    query: `SELECT * from ${tableName}`,
  }).then((query) =>
    createTransformFromQuery({
      name: TABLE_BASED_TRANSFORM_NAME,
      tableName: TRANSFORM_TABLE_NAME,
      query,
    }),
  );
}

function createMetricBasedTransform({
  tableId,
  metricId,
}: {
  tableId: TableId;
  metricId: CardId;
}) {
  return createWritableQuery({
    source: { type: "table", id: tableId },
    aggregations: [{ type: "metric", id: metricId }],
  }).then((query) =>
    createTransformFromQuery({
      name: METRIC_BASED_TRANSFORM_NAME,
      tableName: TRANSFORM_TABLE_NAME,
      query,
    }),
  );
}

function createSnippetBasedTransform({
  tableName,
  snippetId,
  snippetName,
}: {
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  return createWritableNativeQuery({
    query: `SELECT * FROM ${tableName} WHERE {{snippet: ${snippetName}}}`,
    templateTags: getSnippetTemplateTags({ snippetId, snippetName }),
  }).then((query) =>
    createTransformFromQuery({
      name: SNIPPET_BASED_TRANSFORM_NAME,
      tableName: TRANSFORM_TABLE_NAME,
      query,
    }),
  );
}

function createDataActionsFolder() {
  return cy.request<{ id: CollectionId }>("POST", "/api/collection", {
    name: DATA_ACTIONS_FOLDER_NAME,
    namespace: "data-actions",
  });
}

function createDataAction({
  name,
  query,
  templateTags,
  parameters = [],
  collectionId = null,
}: {
  name: string;
  query: string;
  templateTags?: TestNativeQuerySpec["templateTags"];
  parameters?: WritebackParameter[];
  collectionId?: CollectionId | null;
}) {
  H.setActionsEnabledForDB(WRITABLE_DB_ID);
  return createWritableNativeQuery({ query, templateTags }).then(
    (datasetQuery) =>
      cy.request<{ id: WritebackActionId }>("POST", "/api/action", {
        name,
        type: "query",
        database_id: WRITABLE_DB_ID,
        collection_id: collectionId,
        dataset_query: datasetQuery,
        parameters,
      }),
  );
}

function createTableBasedAction({
  collectionId = null,
}: { collectionId?: CollectionId | null } = {}) {
  return createDataAction({
    name: TABLE_BASED_ACTION_NAME,
    query: `DELETE FROM ${TABLE_NAME} WHERE id = {{team_id}}`,
    templateTags: {
      team_id: {
        type: "number",
        "display-name": "Team ID",
        required: true,
      },
    },
    parameters: [
      {
        id: "team_id",
        slug: "team_id",
        name: "Team ID",
        type: "number/=",
        target: ["variable", ["template-tag", "team_id"]],
        required: true,
      },
    ],
    collectionId,
  });
}

function createSnippetBasedAction({
  tableName,
  snippetId,
  snippetName,
}: {
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  return createDataAction({
    name: SNIPPET_BASED_ACTION_NAME,
    query: `DELETE FROM ${tableName} WHERE {{snippet: ${snippetName}}}`,
    templateTags: getSnippetTemplateTags({ snippetId, snippetName }),
  });
}

function createCardBasedAction({
  name,
  cardId,
}: {
  name: string;
  cardId: CardId;
}) {
  return createDataAction({
    name,
    query: `DELETE FROM ${TABLE_NAME} WHERE id IN (SELECT id FROM {{#${cardId}}})`,
    templateTags: {
      [`#${cardId}`]: { type: "card", "card-id": cardId },
    },
  });
}

function createEmptySnippet() {
  return H.createSnippet({
    name: EMPTY_SNIPPET_NAME,
    content: "1 = 1",
  });
}

function createSnippetBasedSnippet({ snippetName }: { snippetName: string }) {
  return H.createSnippet({
    name: SNIPPET_BASED_SNIPPET_NAME,
    content: `{{snippet: ${snippetName}}}`,
  });
}

function createTableBasedSegment({ tableId }: { tableId: TableId }) {
  return createWritableQuery({
    source: { type: "table", id: tableId },
    filters: [
      {
        type: "operator",
        operator: "=",
        args: [
          { type: "literal", value: 1 },
          { type: "literal", value: 1 },
        ],
      },
    ],
  }).then((definition) =>
    H.createSegment({
      name: TABLE_BASED_SEGMENT_NAME,
      description: "Segment description",
      definition,
    }),
  );
}

function createSegmentBasedSegment({
  tableId,
  segmentId,
}: {
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return createWritableQuery({
    source: { type: "table", id: tableId },
    filters: [{ type: "segment", id: segmentId }],
  }).then((definition) =>
    H.createSegment({
      name: SEGMENT_BASED_SEGMENT_NAME,
      description: "Segment description",
      definition,
    }),
  );
}

function createSegmentBasedCard({
  name,
  type,
  tableId,
  segmentId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return createCardFromStage({
    name,
    type,
    stage: {
      source: { type: "table", id: tableId },
      filters: [{ type: "segment", id: segmentId }],
      aggregations: [{ type: "operator", operator: "count" }],
    },
  });
}

function createSegmentBasedQuestion({
  tableId,
  segmentId,
}: {
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return createSegmentBasedCard({
    name: SEGMENT_BASED_QUESTION_NAME,
    type: "question",
    tableId,
    segmentId,
  });
}

function createSegmentBasedModel({
  tableId,
  segmentId,
}: {
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return createSegmentBasedCard({
    name: SEGMENT_BASED_MODEL_NAME,
    type: "model",
    tableId,
    segmentId,
  });
}

function createSegmentBasedMetric({
  tableId,
  segmentId,
}: {
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return createSegmentBasedCard({
    name: SEGMENT_BASED_METRIC_NAME,
    type: "metric",
    tableId,
    segmentId,
  });
}

function createDashboard() {
  return H.createDashboard({
    name: DASHBOARD_NAME,
  });
}

function createDocumentWithTableBasedQuestion({
  name,
  tableId,
}: {
  name: string;
  tableId: TableId;
}) {
  return createWritableQuery({ source: { type: "table", id: tableId } }).then(
    (query) =>
      H.createDocument({
        name: DOCUMENT_NAME,
        document: { type: "doc", content: [] },
        cards: {
          "-1": createMockCard({
            id: -1,
            name,
            dataset_query: query,
            description: "Table based question",
          }),
        },
      }),
  );
}

function createMeasure({
  name,
  tableId,
  aggregation,
  filters,
}: {
  name: string;
  tableId: TableId;
  aggregation: TestAggregationSpec;
  filters?: TestStageSpec["filters"];
}) {
  return createWritableQuery({
    source: { type: "table", id: tableId },
    filters,
    aggregations: [aggregation],
  }).then((definition) => H.createMeasure({ name, definition }));
}

function createTableBasedMeasure({ tableId }: { tableId: TableId }) {
  return createMeasure({
    name: TABLE_BASED_MEASURE_NAME,
    tableId,
    aggregation: { type: "operator", operator: "count" },
  });
}

function createSegmentBaseMeasure({
  tableId,
  segmentId,
}: {
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return createMeasure({
    name: SEGMENT_BASED_MEASURE_NAME,
    tableId,
    aggregation: {
      type: "operator",
      operator: "count-where",
      args: [{ type: "segment", id: segmentId }],
    },
  });
}

function createMeasureBasedCard({
  name,
  type,
  tableId,
  measureId,
}: {
  name: string;
  type: CardType;
  tableId: TableId;
  measureId: MeasureId;
}) {
  return createCardFromStage({
    name,
    type,
    stage: {
      source: { type: "table", id: tableId },
      aggregations: [{ type: "measure", id: measureId }],
    },
  });
}

function createMeasureBasedQuestion({
  tableId,
  measureId,
}: {
  tableId: TableId;
  measureId: MeasureId;
}) {
  return createMeasureBasedCard({
    name: MEASURE_BASED_QUESTION_NAME,
    type: "question",
    tableId,
    measureId,
  });
}

function createMeasureBasedModel({
  tableId,
  measureId,
}: {
  tableId: TableId;
  measureId: MeasureId;
}) {
  return createMeasureBasedCard({
    name: MEASURE_BASED_MODEL_NAME,
    type: "model",
    tableId,
    measureId,
  });
}

function createMeasureBasedMetric({
  tableId,
  measureId,
}: {
  tableId: TableId;
  measureId: MeasureId;
}) {
  return createMeasureBasedCard({
    name: MEASURE_BASED_METRIC_NAME,
    type: "metric",
    tableId,
    measureId,
  });
}

function createMeasureBasedTransform({
  tableId,
  measureId,
}: {
  tableId: TableId;
  measureId: MeasureId;
}) {
  return createWritableQuery({
    source: { type: "table", id: tableId },
    aggregations: [{ type: "measure", id: measureId }],
  }).then((query) =>
    createTransformFromQuery({
      name: MEASURE_BASED_TRANSFORM_NAME,
      tableName: TRANSFORM_TABLE_NAME,
      query,
    }),
  );
}

function createMeasureBasedMeasure({
  tableId,
  measureId,
}: {
  tableId: TableId;
  measureId: MeasureId;
}) {
  return createMeasure({
    name: MEASURE_BASED_MEASURE_NAME,
    tableId,
    aggregation: {
      type: "operator",
      operator: "+",
      args: [
        { type: "literal", value: 1 },
        { type: "measure", id: measureId },
      ],
    },
  });
}
