const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { IconName } from "metabase/ui";

const BASE_URL = "/dependencies";
const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dependencies > dependency graph", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "Animals" });
  });

  describe("entity selection", () => {
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
      entrySearchInput().clear().type(itemName);
      H.popover().findByText(itemName).click();
      entryButton().should("have.text", itemName);
      entryButton().icon(itemIcon).should("be.visible");
      entryButton().icon("close").click();

      if (isRecentItem) {
        entrySearchInput().click();
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
      entrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab(tabName).click();
        H.entityPickerModalItem(itemLevel, itemName).click();
      });
      entryButton().should("have.text", itemName);
      entryButton().icon(itemIcon).should("be.visible");

      cy.log(`verify that "${itemName}" is selected when the picker is opened`);
      entryButton().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(itemLevel, itemName).should(
          "have.attr",
          "data-active",
          "true",
        );
        cy.findByLabelText("Close").click();
      });
      entryButton().icon("close").click();

      cy.log(`verify that "${itemName}" can be found via search"`);
      entrySearchInput().click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab(tabName).click();
        cy.findByPlaceholderText(/Search/).type(itemName);
        cy.findByText(/result for/).should("be.visible");
        cy.findByText(itemName).click();
      });
      entryButton().should("have.text", itemName);
      entryButton().icon(itemIcon).should("be.visible");
      entryButton().icon("close").click();
    }

    it("should be able to use inline search for all supported entity types", () => {
      createMetric();
      createSqlTransform();
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
        itemName: "Orders Metric",
        itemIcon: "metric",
        isRecentItem: false,
      });
      testEntitySearch({
        itemName: "SQL transform",
        itemIcon: "refresh_downstream",
        isRecentItem: false,
      });
    });

    it("should be able to use the entity picker for all supported entity types", () => {
      createMetric();
      createSqlTransform();
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
        itemName: "Orders Metric",
        itemLevel: 1,
        itemIcon: "metric",
      });
      testEntityPicker({
        tabName: "Transforms",
        itemName: "SQL transform",
        itemLevel: 0,
        itemIcon: "refresh_downstream",
      });
    });
  });
});

function visitGraph() {
  cy.visit(BASE_URL);
}

function entryButton() {
  return cy.findByTestId("graph-entry-button");
}

function entrySearchInput() {
  return cy.findByTestId("graph-entry-search-input");
}

function createMetric() {
  H.createQuestion({
    name: "Orders Metric",
    type: "metric",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  });
}

function createSqlTransform() {
  H.createTransform({
    name: "SQL transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: "SELECT 1 AS num",
          "template-tags": {},
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      schema: "Schema A",
      name: "transform_table",
    },
  });
}
