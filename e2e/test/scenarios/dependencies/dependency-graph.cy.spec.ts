const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
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
const TABLE_BASED_MEASURE_NAME = "Table-based measure";
const TABLE_BASED_METRIC_NAME = "Table-based metric";
const TABLE_BASED_TRANSFORM_NAME = "Table-based transform";
const MEASURE_BASED_TRANSFORM_NAME = "Measure-based transform";
const METRIC_BASED_METRIC_NAME = "Metric-based metric";
const METRIC_BASED_TRANSFORM_NAME = "Metric-based transform";
const EMPTY_SNIPPET_NAME = "Empty snippet";
const SNIPPET_BASED_TRANSFORM_NAME = "Snippet-based transform";
const SNIPPET_BASED_SNIPPET_NAME = "Snippet-based snippet";
const TABLE_BASED_SEGMENT_NAME = "Table-based segment";
const SEGMENT_BASED_MEASURE_NAME = "Segment-based measure";
const DATA_ACTIONS_FOLDER_NAME = "Data actions folder";
const TABLE_BASED_ACTION_NAME = "Table-based data action";
const SNIPPET_BASED_ACTION_NAME = "Snippet-based data action";
const DATA_ACTIONS_ROOT_NAME = "Data actions";
const ROOT_COLLECTION_NAME = "Our analytics";
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
    it("should be able to use inline search and the entity picker", () => {
      createDataActionsFolder().then(({ body: folder }) =>
        createTableBasedAction({ collectionId: folder.id }),
      );
      visitGraph();

      cy.log("inline search, and the selection is saved as a recent item");
      H.DependencyGraph.entrySearchInput().type("Orders Model");
      H.popover().findByText("Orders Model").click();
      H.expectUnstructuredSnowplowEvent({
        event: "dependency_entity_selected",
        triggered_from: "dependency-graph",
        event_detail: "card",
      });
      H.DependencyGraph.entryButton().should("have.text", "Orders Model");
      H.DependencyGraph.entryButton().icon("model").should("be.visible");
      H.DependencyGraph.entryButton().icon("close").click();
      cy.reload();
      H.DependencyGraph.entrySearchInput().click();
      H.popover().findByText("Orders Model").should("be.visible");

      testEntityPicker({
        path: ["Databases", /Sample Database/, "Products"],
        itemIcon: "table",
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
    it("should display the dependents of a table and navigate to them", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedQuestion({
          name: "Question in root collection",
          tableId,
        });
        createDocumentWithTableBasedQuestion({
          name: "Question in document",
          tableId,
        });
        createTableBasedTransform({ tableName: TABLE_NAME }).then(
          ({ body: transform }) => {
            H.runTransformAndWaitForSuccess(transform.id);
          },
        );
        createTableBasedAction();
        visitGraphForEntity(tableId, "table");
      });

      cy.log("question dependents and their locations");
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_DISPLAY_NAME)
        .findByText("2 questions")
        .click();
      verifyItemLocation({
        itemTitle: "Question in root collection",
        location: ROOT_COLLECTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "2 questions",
        dependentItemTitle: "Question in document",
        dependentItemLocation: DOCUMENT_NAME,
      });

      cy.log("data action dependents");
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_DISPLAY_NAME)
        .findByText("1 data action")
        .click();
      verifyItemLocation({
        itemTitle: TABLE_BASED_ACTION_NAME,
        location: DATA_ACTIONS_ROOT_NAME,
      });

      cy.log("the transform and the table it generates");
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
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_BASED_TRANSFORM_NAME)
        .findByText("1 table")
        .click();
      verifyItems({ visibleItems: [TRANSFORM_TABLE_DISPLAY_NAME] });
    });

    // No backend test covers these dependencies or these dependent counts
    it("should display the dependents of a segment, a measure, a metric and a snippet", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedSegment({ tableId }).then(({ body: segment }) => {
          createSegmentBaseMeasure({ tableId, segmentId: segment.id });
          cy.wrap(segment.id).as("segmentId");
        });
        createTableBasedMeasure({ tableId }).then(({ body: measure }) => {
          createMeasureBasedTransform({ tableId, measureId: measure.id });
          cy.wrap(measure.id).as("measureId");
        });
        createTableBasedMetric({ tableId }).then((card) => {
          createMetricBasedMetric({ tableId, metricId: card.id });
          createMetricBasedTransform({ tableId, metricId: card.id });
          cy.wrap(card.id).as("metricId");
        });
      });
      createEmptySnippet().then(({ body: snippet }) => {
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
        cy.wrap(snippet.id).as("snippetId");
      });

      cy.log("segment dependents");
      cy.get<SegmentId>("@segmentId").then((segmentId) =>
        visitGraphForEntity(segmentId, "segment"),
      );
      verifyDependents({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 measure",
        dependentItemTitle: SEGMENT_BASED_MEASURE_NAME,
      });

      cy.log("measure dependents, and jump to an entity on the graph");
      cy.get<MeasureId>("@measureId").then((measureId) =>
        visitGraphForEntity(measureId, "measure"),
      );
      H.DependencyGraph.graph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME).should("be.visible");
        cy.findByLabelText(TABLE_BASED_MEASURE_NAME).should("be.visible");
      });
      verifyNodeCentered({ nodeLabel: TABLE_DISPLAY_NAME, isCentered: false });
      H.DependencyGraph.selectionButton().click();
      H.popover().findByText(TABLE_DISPLAY_NAME).click();
      verifyNodeCentered({ nodeLabel: TABLE_DISPLAY_NAME, isCentered: true });
      verifyDependents({
        itemTitle: TABLE_BASED_MEASURE_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: MEASURE_BASED_TRANSFORM_NAME,
      });

      cy.log("metric dependents");
      cy.get<CardId>("@metricId").then((metricId) =>
        visitGraphForEntity(metricId, "card"),
      );
      verifyDependents({
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: METRIC_BASED_METRIC_NAME,
      });
      verifyDependents({
        itemTitle: TABLE_BASED_METRIC_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: METRIC_BASED_TRANSFORM_NAME,
      });

      cy.log("snippet dependents");
      cy.get<NativeQuerySnippetId>("@snippetId").then((snippetId) =>
        visitGraphForEntity(snippetId, "snippet"),
      );
      verifyDependents({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: SNIPPET_BASED_TRANSFORM_NAME,
      });
      verifyDependents({
        itemTitle: EMPTY_SNIPPET_NAME,
        groupTitle: "1 SQL snippet",
        dependentItemTitle: SNIPPET_BASED_SNIPPET_NAME,
      });
      verifyDependents({
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
      cy.findByRole("tab", { name: "Dependencies" }).click();
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

      cy.log("the dependents of the table show the data action's folder");
      getScoreboardTableId().then((tableId) =>
        visitGraphForEntity(tableId, "table"),
      );
      H.DependencyGraph.graph()
        .findByLabelText(TABLE_DISPLAY_NAME)
        .findByText("1 data action")
        .click();
      verifyItemLocation({
        itemTitle: TABLE_BASED_ACTION_NAME,
        location: DATA_ACTIONS_FOLDER_NAME,
      });
    });
  });
});

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

function verifyDependents({
  itemTitle,
  groupTitle,
  dependentItemTitle,
}: {
  itemTitle: string;
  groupTitle: string;
  dependentItemTitle: string;
}) {
  H.DependencyGraph.graph()
    .findByLabelText(itemTitle)
    .findByText(groupTitle)
    .click();
  verifyItems({ visibleItems: [dependentItemTitle] });
}

function visitGraph() {
  cy.visit(BASE_URL);
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
