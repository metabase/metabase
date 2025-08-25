const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId, TableId } from "metabase-types/api";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

describe("detail view", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/table/*/query_metadata*").as("tableMetadata");
  });

  describe("table", () => {
    it("works", () => {
      DetailView.visitTable(PRODUCTS_ID, 1);

      cy.findByRole("heading", {
        name: "Rustic Paper Wallet",
        level: 1,
      }).should("be.visible");
      cy.findByRole("heading", { name: "1", level: 2 }).should("be.visible");
      cy.icon("document").should("be.visible");

      H.appBar().within(() => {
        cy.findByRole("link", { name: /Sample Database/ }).should("be.visible");
        cy.findByRole("link", { name: "Products" }).should("be.visible");
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });

      DetailView.verifyObjectDetails([
        ["Ean", "1018947080336"],
        ["Category", "Gizmo"],
        ["Vendor", "Swaniawski, Casper and Hilll"],
        ["Price", "29.46"],
        ["Rating", "4.6"],
        ["Created At", "July 19, 2023, 7:44 PM"],
      ]);

      DetailView.getRelationships().within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
        cy.findByRole("link", { name: "93 Orders" }).should("be.visible");
        cy.findByRole("link", { name: "8 Reviews" })
          .should("be.visible")
          .click();
      });

      H.queryBuilderHeader().findByText("Reviews").should("be.visible");
      H.queryBuilderFiltersPanel().children().should("have.length", 1);
      H.queryBuilderFiltersPanel()
        .findByText("Product ID is 1")
        .should("be.visible");
      cy.findByTestId("question-row-count")
        .should("be.visible")
        .and("have.text", "Showing 8 rows");
    });

    // it("breadcrumbs", () => {
    //   H.restore("postgres-writable");
    //   H.resetTestTable({ type: "postgres", table: "multi_schema" });
    //   H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    //   DetailView.visitTable(PRODUCTS_ID, 1);
    // });
  });
});

const DetailView = {
  visitModel,
  visitTable,
  getObjectDetails,
  getRelationships,
  verifyObjectDetails,
};

function visitModel(modelIdOrSlug: CardId | string, rowId: string | number) {
  cy.visit(`/model/${modelIdOrSlug}/detail/${rowId}`);
}

function visitTable(tableId: TableId, rowId: string | number) {
  cy.visit(`/table/${tableId}/detail/${rowId}`);
  cy.findByTestId("loading-indicator").should("be.visible");
  cy.wait("@tableMetadata");
  cy.findByTestId("loading-indicator").should("not.exist");
}

function verifyObjectDetails(rows: [string, string][]) {
  getObjectDetails().within(() => {
    cy.findAllByTestId("object-details-row").should("have.length", rows.length);
    for (let i = 0; i < rows.length; ++i) {
      const [column, value] = rows[i];

      cy.findAllByTestId("object-details-row")
        .should("have.length", rows.length)
        .eq(i)
        .findByTestId("column")
        .should("have.text", column);

      cy.findAllByTestId("object-details-row")
        .should("have.length", rows.length)
        .eq(i)
        .findByTestId("value")
        .should("have.text", value);
    }
  });
}

function getRelationships() {
  return cy.findByTestId("relationships");
}

function getObjectDetails() {
  return cy.findByTestId("object-details");
}
