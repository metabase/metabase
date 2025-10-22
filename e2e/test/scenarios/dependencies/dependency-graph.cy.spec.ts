const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { IconName } from "metabase/ui";
import type { DependencyId, DependencyType, TableId } from "metabase-types/api";

const BASE_URL = "/dependencies";
const TABLE_NAME = "scoreboard_actions";
const TABLE_DISPLAY_NAME = "Scoreboard Actions";
const TABLE_ID_ALIAS = "tableId";

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
        itemName: "Table-based metric",
        itemIcon: "metric",
        isRecentItem: false,
      });
      testEntitySearch({
        itemName: "Table-based transform",
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
        itemName: "Table-based metric",
        itemLevel: 1,
        itemIcon: "metric",
      });
      testEntityPicker({
        tabName: "Transforms",
        itemName: "Table-based transform",
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

      dependencyGraph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME)
          .should("be.visible")
          .and("not.have.attr", "aria-selected", "true");
        cy.findByLabelText("Table-based question")
          .should("be.visible")
          .and("have.attr", "aria-selected", "true");
      });

      graphSelectionInput().click();
      H.popover().findByText(TABLE_DISPLAY_NAME).click();
      dependencyGraph().within(() => {
        cy.findByLabelText(TABLE_DISPLAY_NAME)
          .should("be.visible")
          .and("have.attr", "aria-selected", "true");
        cy.findByLabelText("Table-based question")
          .should("be.visible")
          .and("not.have.attr", "aria-selected", "true");
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
      dependencyGraph().findByLabelText(itemTitle).contains(groupTitle).click();
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
        groupTitle: "question",
        dependentItemTitle: "Table-based question",
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "model",
        dependentItemTitle: "Table-based model",
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "metric",
        dependentItemTitle: "Table-based metric",
      });
      verifyPanelNavigation({
        itemTitle: TABLE_DISPLAY_NAME,
        groupTitle: "transform",
        dependentItemTitle: "Table-based transform",
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

function graphSelectionInput() {
  return cy.findByTestId("graph-selection-input");
}

function graphDependencyPanel() {
  return cy.findByTestId("graph-dependency-panel");
}

function getScoreboardTableId() {
  return cy.get<number>(`@${TABLE_ID_ALIAS}`);
}

function createTableBasedQuestion(tableId: TableId) {
  return H.createQuestion({
    name: "Table-based question",
    type: "question",
    query: {
      "source-table": tableId,
    },
  });
}

function createTableBasedModel(tableId: TableId) {
  return H.createQuestion({
    name: "Table-based model",
    type: "model",
    query: {
      "source-table": tableId,
    },
  });
}

function createTableBasedMetric(tableId: TableId) {
  return H.createQuestion({
    name: "Table-based metric",
    type: "metric",
    query: {
      "source-table": tableId,
    },
  });
}

function createTableBasedTransform(tableName: string) {
  return H.createTransform({
    name: "Table-based transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: `SELECT team_name, score from ${tableName}`,
          "template-tags": {},
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "public",
      name: "transform_table",
    },
  });
}
