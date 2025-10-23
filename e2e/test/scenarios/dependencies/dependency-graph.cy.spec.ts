const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { IconName } from "metabase/ui";
import type {
  CardId,
  CardType,
  DependencyId,
  DependencyType,
  NativeQuerySnippetId,
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

describe("scenarios > dependencies > dependency graph", () => {
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
        cy.findByText(/result for/).should("be.visible");
        cy.findByText(itemName).click();
      });
      graphEntryButton().should("have.text", itemName);
      graphEntryButton().icon(itemIcon).should("be.visible");
      graphEntryButton().icon("close").click();
    }

    it("should be able to use inline search for all supported entity types", () => {
      getScoreboardTableId().then((tableId) => {
        createTableBasedMetric(tableId);
        createTableBasedTransform(TABLE_NAME);
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
        createTableBasedMetric(tableId);
        createTableBasedTransform(TABLE_NAME);
      });

      visitGraph();
      testEntityPicker({
        tabName: "Tables",
        itemName: "Products",
        itemLevel: 2,
        itemIcon: "table",
      });
      testEntityPicker({
        tabName: "Collections",
        itemName: "Orders, Count, Grouped by Created At (year)",
        itemLevel: 1,
        itemIcon: "line",
      });
      testEntityPicker({
        tabName: "Collections",
        itemName: "Orders Model",
        itemLevel: 1,
        itemIcon: "model",
      });
      testEntityPicker({
        tabName: "Collections",
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
        createTableBasedQuestion(tableId).then(({ body: card }) => {
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

  describe("dependency types", () => {
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
        createTableBasedQuestion(tableId);
        createTableBasedModel(tableId);
        createTableBasedMetric(tableId);
        createTableBasedTransform(TABLE_NAME);
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
    });

    it("should display dependencies for a question and navigate to them", () => {
      getScoreboardTableId()
        .then((tableId) => createTableBasedQuestion(tableId))
        .then(({ body: card }) => {
          createCardBasedQuestion(card.id);
          createCardBasedModel(card.id);
          createCardBasedMetric(card.id);
          createCardBasedTransform(card.id);
          createCardBasedSnippet(card.id);
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
        .then((tableId) => createTableBasedModel(tableId))
        .then(({ body: card }) => {
          createCardBasedQuestion(card.id);
          createCardBasedModel(card.id);
          createCardBasedMetric(card.id);
          createCardBasedTransform(card.id);
          createCardBasedSnippet(card.id);
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
        createTableBasedMetric(tableId).then(({ body: card }) => {
          createMetricBasedQuestion(tableId, card.id);
          createMetricBasedModel(tableId, card.id);
          createMetricBasedMetric(tableId, card.id);
          createMetricBasedTransform(tableId, card.id);
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
      createTableBasedTransform(TABLE_NAME).then(({ body: transform }) => {
        runTransformAndWaitForSuccess(transform.id);
        visitGraphForEntity(transform.id, "transform");
      });
      verifyPanelNavigation({
        itemTitle: TABLE_BASED_TRANSFORM_NAME,
        groupTitle: "1 table",
        dependentItemTitle: TRANSFORM_TABLE_DISPLAY_NAME,
      });
    });

    it("should display dependencies for a snippet and navigate to them", () => {
      createEmptySnippet().then(({ body: snippet }) => {
        createSnippetBasedQuestion(TABLE_NAME, snippet.id, snippet.name);
        createSnippetBasedModel(TABLE_NAME, snippet.id, snippet.name);
        createSnippetBasedTransform(TABLE_NAME, snippet.id, snippet.name);
        createSnippetBasedSnippet(snippet.name);
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

function createTableBasedCard(name: string, type: CardType, tableId: TableId) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": tableId,
    },
  });
}

function createTableBasedQuestion(tableId: TableId) {
  return createTableBasedCard(TABLE_BASED_QUESTION_NAME, "question", tableId);
}

function createTableBasedModel(tableId: TableId) {
  return createTableBasedCard(TABLE_BASED_MODEL_NAME, "model", tableId);
}

function createCardBasedCard(name: string, type: CardType, cardId: CardId) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": `card__${cardId}`,
    },
  });
}

function createCardBasedQuestion(cardId: CardId) {
  return createCardBasedCard(CARD_BASED_QUESTION_NAME, "question", cardId);
}

function createCardBasedModel(cardId: CardId) {
  return createCardBasedCard(CARD_BASED_MODEL_NAME, "model", cardId);
}

function createMetricBasedCard(
  name: string,
  type: CardType,
  tableId: TableId,
  metricId: CardId,
) {
  return H.createQuestion({
    name,
    type,
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createMetricBasedQuestion(tableId: TableId, metricId: CardId) {
  return createMetricBasedCard(
    METRIC_BASED_QUESTION_NAME,
    "question",
    tableId,
    metricId,
  );
}

function createMetricBasedModel(tableId: TableId, metricId: CardId) {
  return createMetricBasedCard(
    METRIC_BASED_MODEL_NAME,
    "model",
    tableId,
    metricId,
  );
}

function createSnippetBasedCard(
  name: string,
  type: CardType,
  tableName: string,
  snippetId: NativeQuerySnippetId,
  snippetName: string,
) {
  return H.createNativeQuestion({
    name,
    type,
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
  tableName: string,
  snippetId: NativeQuerySnippetId,
  snippetName: string,
) {
  return createSnippetBasedCard(
    SNIPPET_BASED_QUESTION_NAME,
    "question",
    tableName,
    snippetId,
    snippetName,
  );
}

function createSnippetBasedModel(
  tableName: string,
  snippetId: NativeQuerySnippetId,
  snippetName: string,
) {
  return createSnippetBasedCard(
    SNIPPET_BASED_MODEL_NAME,
    "model",
    tableName,
    snippetId,
    snippetName,
  );
}

function createTableBasedMetric(tableId: TableId) {
  return H.createQuestion({
    name: TABLE_BASED_METRIC_NAME,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["count"]],
    },
  });
}

function createCardBasedMetric(cardId: CardId) {
  return H.createQuestion({
    name: CARD_BASED_METRIC_NAME,
    type: "metric",
    query: {
      "source-table": `card__${cardId}`,
      aggregation: [["count"]],
    },
  });
}

function createMetricBasedMetric(tableId: TableId, metricId: CardId) {
  return H.createQuestion({
    name: METRIC_BASED_METRIC_NAME,
    type: "metric",
    query: {
      "source-table": tableId,
      aggregation: [["metric", metricId]],
    },
  });
}

function createTableBasedTransform(tableName: string) {
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

function createCardBasedTransform(cardId: CardId) {
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

function createMetricBasedTransform(tableId: TableId, metricId: CardId) {
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

function createSnippetBasedTransform(
  tableName: string,
  snippetId: NativeQuerySnippetId,
  snippetName: string,
) {
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

function createCardBasedSnippet(cardId: CardId) {
  return H.createSnippet({
    name: CARD_BASED_SNIPPET_NAME,
    content: `{{#${cardId}}}`,
  });
}

function createSnippetBasedSnippet(snippetName: string) {
  return H.createSnippet({
    name: SNIPPET_BASED_SNIPPET_NAME,
    content: `{{snippet:${snippetName}}}`,
  });
}
