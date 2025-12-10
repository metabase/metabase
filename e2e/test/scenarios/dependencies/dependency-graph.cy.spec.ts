const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ALL_USERS_GROUP_ID,
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import type { IconName } from "metabase/ui";
import type {
  CardId,
  CardType,
  CollectionId,
  DependencyId,
  DependencyType,
  NativeQuerySnippetId,
  SegmentId,
  TableId,
  TransformId,
} from "metabase-types/api";

const BASE_URL = "/dependencies";
const TABLE_NAME = "scoreboard_actions";
const TABLE_DISPLAY_NAME = "Scoreboard Actions";
const TABLE_ID_ALIAS = "tableId";
const TRANSFORM_TABLE_NAME = "transform_table";
const TRANSFORM_TABLE_DISPLAY_NAME = "Transform Table";
const TABLE_BASED_QUESTION_NAME = "Table-based question";
const TABLE_BASED_MODEL_NAME = "Table-based model";
const TABLE_BASED_METRIC_NAME = "Table-based metric";
const TABLE_BASED_TRANSFORM_NAME = "Table-based transform";
const CARD_BASED_QUESTION_NAME = "Card-based question";
const CARD_BASED_MODEL_NAME = "Card-based model";
const CARD_BASED_METRIC_NAME = "Card-based metric";
const CARD_BASED_TRANSFORM_NAME = "Card-based transform";
const CARD_BASED_SNIPPET_NAME = "Card-based snippet";
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
const SEGMENT_BASED_METRIC_NAME = "Segment-based metric";
const SEGMENT_BASED_SEGMENT_NAME = "Segment-based segment";

// TODO skipped until v57 is released
describe.skip("scenarios > dependencies > dependency graph", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TABLE_NAME });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TABLE_NAME });
    H.getTableId({ name: TABLE_NAME }).as(TABLE_ID_ALIAS);
  });

  describe("entity search", () => {
    function testEntitySearch({
      itemName,
      itemIcon,
      isRecentItem,
    }: {
      itemName: string;
      itemIcon: IconName;
      isRecentItem: boolean;
    }) {
      cy.log(`verify that "${itemName}" can be found via search`);
      graphEntrySearchInput().clear().type(itemName);
      H.popover().findByText(itemName).click();
      graphEntryButton().should("have.text", itemName);
      graphEntryButton().icon(itemIcon).should("be.visible");
      graphEntryButton().icon("close").click();

      if (isRecentItem) {
        graphEntrySearchInput().click();
        H.popover().findByText(itemName).should("be.visible");
      }
    }

    function testEntityPicker({
      tabName,
      itemName,
      itemLevel,
      itemIcon,
    }: {
      tabName: string;
      itemName: string;
      itemLevel: number;
      itemIcon: IconName;
    }) {
      cy.log(`verify that "${itemName}" can be selected in the picker`);
      graphEntrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab(tabName).click();
        H.entityPickerModalItem(itemLevel, itemName).click();
      });
      graphEntryButton().should("have.text", itemName);
      graphEntryButton().icon(itemIcon).should("be.visible");

      cy.log(`verify that "${itemName}" is selected when the picker is opened`);
      graphEntryButton().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(itemLevel, itemName).should(
          "have.attr",
          "data-active",
          "true",
        );
        cy.findByLabelText("Close").click();
      });
      graphEntryButton().icon("close").click();

      cy.log(`verify that "${itemName}" can be found via search"`);
      graphEntrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab(tabName).click();
        cy.findByPlaceholderText(/Search/).type(itemName);
        cy.findByText(/result for/).should("exist");
        cy.findByText(itemName).click();
      });
      graphEntryButton().should("have.text", itemName);
      graphEntryButton().icon(itemIcon).should("be.visible");
      graphEntryButton().icon("close").click();
    }

    it("should be able to use inline search for all supported entity types", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedMetric({ tableId });
        createTableBasedTransform({ tableName: TABLE_NAME });
      });
      visitGraph();

      testEntitySearch({
        itemName: "Products",
        itemIcon: "table",
        isRecentItem: true,
      });
      testEntitySearch({
        itemName: "Orders, Count, Grouped by Created At (year)",
        itemIcon: "line",
        isRecentItem: true,
      });
      testEntitySearch({
        itemName: "Orders Model",
        itemIcon: "model",
        isRecentItem: true,
      });
      testEntitySearch({
        itemName: TABLE_BASED_METRIC_NAME,
        itemIcon: "metric",
        isRecentItem: false,
      });
      testEntitySearch({
        itemName: TABLE_BASED_TRANSFORM_NAME,
        itemIcon: "refresh_downstream",
        isRecentItem: false,
      });
    });

    it("should be able to use the entity picker for all supported entity types", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedMetric({ tableId });
        createTableBasedTransform({ tableName: TABLE_NAME });
      });

      visitGraph();
      testEntityPicker({
        tabName: "Tables",
        itemName: "Products",
        itemLevel: 2,
        itemIcon: "table",
      });
      testEntityPicker({
        tabName: "Questions",
        itemName: "Orders, Count, Grouped by Created At (year)",
        itemLevel: 1,
        itemIcon: "line",
      });
      testEntityPicker({
        tabName: "Models",
        itemName: "Orders Model",
        itemLevel: 1,
        itemIcon: "model",
      });
      testEntityPicker({
        tabName: "Metrics",
        itemName: TABLE_BASED_METRIC_NAME,
        itemLevel: 1,
        itemIcon: "metric",
      });
      testEntityPicker({
        tabName: "Transforms",
        itemName: TABLE_BASED_TRANSFORM_NAME,
        itemLevel: 0,
        itemIcon: "refresh_downstream",
      });
    });
  });

  describe("entity focus", () => {
    it("should be possible to select an entity via search", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedQuestion({ tableId }).then(({ body: card }) => {
          visitGraphForEntity(card.id, "card");
        });
      });

      graphSelectionButton().click();
      H.popover().findByText(TABLE_DISPLAY_NAME).click();
      dependencyGraph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME).should("be.visible");
        cy.findByLabelText(TABLE_BASED_QUESTION_NAME).should("be.visible");
      });
    });
  });

  describe("dependent types", () => {
    function verifyPanelNavigation({
      itemTitle,
      groupTitle,
      dependentItemTitle,
    }: {
      itemTitle: string;
      groupTitle: string;
      dependentItemTitle: string;
    }) {
      dependencyGraph()
        .findByLabelText(itemTitle)
        .findByText(groupTitle)
        .click();
      graphDependencyPanel()
        .findByLabelText(dependentItemTitle)
        .findByText(dependentItemTitle)
        .click();
      graphEntryButton().findByText(dependentItemTitle).should("be.visible");
      cy.go("back");
    }

    it("should display dependencies for a table and navigate to them", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedQuestion({ tableId });
        createTableBasedModel({ tableId });
        createTableBasedMetric({ tableId });
        createTableBasedTransform({ tableName: TABLE_NAME });
        createTableBasedSegment({ tableId });
        visitGraphForEntity(tableId, "table");
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 question",
        dependentItemTitle: TABLE_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 model",
        dependentItemTitle: TABLE_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: TABLE_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: TABLE_BASED_TRANSFORM_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "1 segment",
        dependentItemTitle: TABLE_BASED_SEGMENT_NAME,
      });
    });

    it("should display dependencies for a segment and navigate to them", () => {
      getScoreboardTableId().then((tableId) =>
        createTableBasedSegment({ tableId }).then(({ body: segment }) => {
          createSegmentBasedQuestion({ tableId, segmentId: segment.id });
          createSegmentBasedModel({ tableId, segmentId: segment.id });
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
        groupTitle: "1 metric",
        dependentItemTitle: SEGMENT_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_SEGMENT_NAME,
        groupTitle: "1 segment",
        dependentItemTitle: SEGMENT_BASED_SEGMENT_NAME,
      });
    });

    it("should display dependencies for a question and navigate to them", () => {
      getScoreboardTableId()
        .then((tableId) => createTableBasedQuestion({ tableId }))
        .then(({ body: card }) => {
          createCardBasedQuestion({ cardId: card.id });
          createCardBasedModel({ cardId: card.id });
          createCardBasedMetric({ cardId: card.id });
          createCardBasedTransform({ cardId: card.id });
          createCardBasedSnippet({ cardId: card.id });
          visitGraphForEntity(card.id, "card");
        });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 question",
        dependentItemTitle: CARD_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 model",
        dependentItemTitle: CARD_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: CARD_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: CARD_BASED_TRANSFORM_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_QUESTION_NAME,
        groupTitle: "1 snippet",
        dependentItemTitle: CARD_BASED_SNIPPET_NAME,
      });
    });

    it("should display dependencies for a model and navigate to them", () => {
      getScoreboardTableId()
        .then((tableId) => createTableBasedModel({ tableId }))
        .then(({ body: card }) => {
          createCardBasedQuestion({ cardId: card.id });
          createCardBasedModel({ cardId: card.id });
          createCardBasedMetric({ cardId: card.id });
          createCardBasedTransform({ cardId: card.id });
          createCardBasedSnippet({ cardId: card.id });
          visitGraphForEntity(card.id, "card");
        });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 question",
        dependentItemTitle: CARD_BASED_QUESTION_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 model",
        dependentItemTitle: CARD_BASED_MODEL_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 metric",
        dependentItemTitle: CARD_BASED_METRIC_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 transform",
        dependentItemTitle: CARD_BASED_TRANSFORM_NAME,
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_MODEL_NAME,
        groupTitle: "1 snippet",
        dependentItemTitle: CARD_BASED_SNIPPET_NAME,
      });
    });

    it("should display dependencies for a metric and navigate to them", () => {
      getScoreboardTableId().then((tableId) =>
        createTableBasedMetric({ tableId }).then(({ body: card }) => {
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

    it("should display dependencies for a transform and navigate to them", () => {
      createTableBasedTransform({ tableName: TABLE_NAME }).then(
        ({ body: transform }) => {
          runTransformAndWaitForSuccess(transform.id);
          visitGraphForEntity(transform.id, "transform");
        },
      );
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_TRANSFORM_NAME,
        groupTitle: "1 table",
        dependentItemTitle: TRANSFORM_TABLE_DISPLAY_NAME,
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
        groupTitle: "1 snippet",
        dependentItemTitle: SNIPPET_BASED_SNIPPET_NAME,
      });
    });
  });

  describe("dependent filtering", () => {
    function verifyFilter({
      filterName,
      visibleItems,
      hiddenItems,
    }: {
      filterName: string;
      visibleItems: string[];
      hiddenItems: string[];
    }) {
      graphDependencyPanel().icon("filter").click();
      H.popover().findByText(filterName).click();
      graphDependencyPanel().within(() => {
        visibleItems.forEach((item) =>
          cy.findByText(item).should("be.visible"),
        );
        hiddenItems.forEach((item) => cy.findByText(item).should("not.exist"));
      });
      H.popover().findByText(filterName).click();
      graphDependencyPanel().icon("filter").click();
    }

    it("should be able to filter questions", () => {
      makeCollectionOfficial(FIRST_COLLECTION_ID);
      getScoreboardTableId().then((tableId) => {
        createTableBasedQuestion({
          name: "Verified question",
          tableId,
        }).then(({ body: card }) => {
          verifyCard(card.id);
        });
        createTableBasedQuestion({
          name: "Question in dashboard",
          tableId,
          dashboardId: ORDERS_DASHBOARD_ID,
        });
        createTableBasedQuestion({
          name: "Question in root collection",
          tableId,
        });
        createTableBasedQuestion({
          name: "Question in official collection",
          tableId,
          collectionId: FIRST_COLLECTION_ID,
        });
        createTableBasedQuestion({
          name: "Question in regular collection",
          tableId,
          collectionId: SECOND_COLLECTION_ID,
        });
        createTableBasedQuestion({
          name: "Question in personal collection",
          tableId,
          collectionId: ADMIN_PERSONAL_COLLECTION_ID,
        });
        visitGraphForEntity(tableId, "table");
      });
      dependencyGraph()
        .findByLabelText(TABLE_DISPLAY_NAME)
        .findByText("6 questions")
        .click();
      verifyFilter({
        filterName: "Verified",
        visibleItems: ["Verified question"],
        hiddenItems: ["Question in official collection"],
      });
      verifyFilter({
        filterName: "In a dashboard",
        visibleItems: ["Question in dashboard"],
        hiddenItems: ["Verified question", "Question in regular collection"],
      });
      verifyFilter({
        filterName: "In an official collection",
        visibleItems: ["Question in official collection"],
        hiddenItems: [
          "Verified question",
          "Question in dashboard",
          "Question in root collection",
        ],
      });
      verifyFilter({
        filterName: "Not in personal collection",
        visibleItems: [
          "Question in dashboard",
          "Question in root collection",
          "Question in regular collection",
        ],
        hiddenItems: ["Question in personal collection"],
      });
    });
  });

  describe("permissions", () => {
    it("should be able to view database entities without collection access", () => {
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP_ID]: {
          [WRITABLE_DB_ID]: {
            "view-data": DataPermissionValue.UNRESTRICTED,
            "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
          },
        },
      });

      getScoreboardTableId().then((tableId) => {
        createTableBasedQuestion({ tableId });
        createTableBasedModel({ tableId });
        createTableBasedMetric({ tableId });
        createTableBasedTransform({ tableName: TABLE_NAME });
        cy.signIn("nocollection");
        visitGraphForEntity(tableId, "table");
      });

      dependencyGraph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME).within(() => {
          cy.findByText(/question/).should("not.exist");
          cy.findByText(/model/).should("not.exist");
          cy.findByText(/metric/).should("not.exist");
          cy.findByText(/transform/).should("not.exist");
        });
      });
    });

    it("should be able to view collection entities without data access", () => {
      getScoreboardTableId()
        .then((tableId) => createTableBasedQuestion({ tableId }))
        .then(({ body: card }) => {
          createCardBasedQuestion({ cardId: card.id });
          createCardBasedModel({ cardId: card.id });
          createCardBasedMetric({ cardId: card.id });
          createCardBasedTransform({ cardId: card.id });
          createCardBasedSnippet({ cardId: card.id });
          cy.signIn("nodata");
          visitGraphForEntity(card.id, "card");
        });

      dependencyGraph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME).should("not.exist");
        cy.findByLabelText(TABLE_BASED_QUESTION_NAME).within(() => {
          cy.findByText("1 question").should("be.visible");
          cy.findByText("1 model").should("be.visible");
          cy.findByText("1 metric").should("be.visible");
          cy.findByText(/snippet/).should("not.exist");
          cy.findByText(/transform/).should("not.exist");
        });
      });
    });
  });
});

function visitGraph() {
  cy.visit(BASE_URL);
}

function visitGraphForEntity(id: DependencyId, type: DependencyType) {
  return cy.visit(`/${BASE_URL}/${type}/${id}`);
}

function dependencyGraph() {
  return cy.findByTestId("dependency-graph");
}

function graphEntryButton() {
  return cy.findByTestId("graph-entry-button");
}

function graphEntrySearchInput() {
  return cy.findByTestId("graph-entry-search-input");
}

function graphSelectionButton() {
  return cy.findByTestId("graph-selection-button");
}

function graphDependencyPanel() {
  return cy.findByTestId("graph-dependency-panel");
}

function getScoreboardTableId() {
  return cy.get<number>(`@${TABLE_ID_ALIAS}`);
}

function makeCollectionOfficial(collectionId: CollectionId) {
  cy.request("PUT", `/api/collection/${collectionId}`, {
    authority_level: "official",
  });
}

function verifyCard(cardId: CardId) {
  cy.request("POST", "/api/moderation-review", {
    status: "verified",
    moderated_item_id: cardId,
    moderated_item_type: "card",
  });
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
  collectionId?: number | null;
  dashboardId?: number | null;
}) {
  return H.createQuestion({
    name,
    type,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
    },
    collection_id: collectionId,
    dashboard_id: dashboardId,
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
  collectionId?: number | null;
  dashboardId?: number | null;
}) {
  return createTableBasedCard({
    name,
    type: "question",
    tableId,
    collectionId: collectionId,
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
  collectionId?: number | null;
}) {
  return createTableBasedCard({
    name,
    type: "model",
    tableId,
    collectionId,
  });
}

function createCardBasedCard({
  name,
  type,
  cardId,
}: {
  name: string;
  type: CardType;
  cardId: CardId;
}) {
  return H.createQuestion({
    name,
    type,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": `card__${cardId}`,
    },
  });
}

function createCardBasedQuestion({ cardId }: { cardId: CardId }) {
  return createCardBasedCard({
    name: CARD_BASED_QUESTION_NAME,
    type: "question",
    cardId,
  });
}

function createCardBasedModel({ cardId }: { cardId: CardId }) {
  return createCardBasedCard({
    name: CARD_BASED_MODEL_NAME,
    type: "model",
    cardId,
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
  return H.createQuestion({
    name,
    type,
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
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
  return H.createNativeQuestion({
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
  return H.createQuestion({
    name: TABLE_BASED_METRIC_NAME,
    type: "metric",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
  });
}

function createCardBasedMetric({ cardId }: { cardId: CardId }) {
  return H.createQuestion({
    name: CARD_BASED_METRIC_NAME,
    type: "metric",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": `card__${cardId}`,
      aggregation: [["count"]],
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
  return H.createQuestion({
    name: METRIC_BASED_METRIC_NAME,
    type: "metric",
    database: WRITABLE_DB_ID,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createTableBasedTransform({ tableName }: { tableName: string }) {
  return H.createTransform({
    name: TABLE_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: `SELECT * from ${tableName}`,
          "template-tags": {},
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

function createCardBasedTransform({ cardId }: { cardId: CardId }) {
  return H.createTransform({
    name: CARD_BASED_TRANSFORM_NAME,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: {
          "source-table": `card__${cardId}`,
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

function createMetricBasedTransform({
  tableId,
  metricId,
}: {
  tableId: TableId;
  metricId: CardId;
}) {
  return H.createTransform({
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

function createSnippetBasedTransform({
  tableName,
  snippetId,
  snippetName,
}: {
  tableName: string;
  snippetId: NativeQuerySnippetId;
  snippetName: string;
}) {
  return H.createTransform({
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

function runTransformAndWaitForSuccess(transformId: TransformId) {
  cy.request("POST", `/api/ee/transform/${transformId}/run`);
  H.waitForSucceededTransformRuns();
}

function createEmptySnippet() {
  return H.createSnippet({
    name: EMPTY_SNIPPET_NAME,
    content: "1 = 1",
  });
}

function createCardBasedSnippet({ cardId }: { cardId: CardId }) {
  return H.createSnippet({
    name: CARD_BASED_SNIPPET_NAME,
    content: `{{#${cardId}}}`,
  });
}

function createSnippetBasedSnippet({ snippetName }: { snippetName: string }) {
  return H.createSnippet({
    name: SNIPPET_BASED_SNIPPET_NAME,
    content: `{{snippet:${snippetName}}}`,
  });
}

function createTableBasedSegment({ tableId }: { tableId: TableId }) {
  return H.createSegment({
    name: TABLE_BASED_SEGMENT_NAME,
    description: "Segment description",
    table_id: tableId,
    definition: {
      "source-table": tableId,
      filter: ["=", 1, 1],
    },
  });
}

function createSegmentBasedSegment({
  tableId,
  segmentId,
}: {
  tableId: TableId;
  segmentId: SegmentId;
}) {
  return H.createSegment({
    name: SEGMENT_BASED_SEGMENT_NAME,
    description: "Segment description",
    table_id: tableId,
    definition: {
      "source-table": tableId,
      filter: ["segment", segmentId],
    },
  });
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
  return H.createQuestion({
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
