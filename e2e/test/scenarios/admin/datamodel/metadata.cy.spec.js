import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getNotebookStep,
  restore,
  openOrdersTable,
  openReviewsTable,
  popover,
  summarize,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > metadata", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should correctly show remapped column value", () => {
    // go directly to Data Model page for Sample Database
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // edit "Product ID" column in "Orders" table
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    cy.findByTestId("column-PRODUCT_ID").find(".Icon-gear").click();

    // remap its original value to use foreign key
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use original value").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use foreign key").click();
    popover().within(() => {
      cy.findByText("Title").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    cy.log("Name of the product should be displayed instead of its ID");
    openOrdersTable();
    cy.findAllByText("Awesome Concrete Shoes");
  });

  it("should correctly apply and display custom remapping for numeric values", () => {
    // this test also indirectly reproduces metabase#12771
    const customMap = {
      1: "Awful",
      2: "Unpleasant",
      3: "Meh",
      4: "Enjoyable",
      5: "Perfecto",
    };

    // go directly to Data Model page for Sample Database
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    // edit "Rating" values in "Reviews" table
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviews").click();
    cy.findByTestId("column-RATING").find(".Icon-gear").click();

    // apply custom remapping for "Rating" values 1-5
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use original value").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom mapping").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    Object.entries(customMap).forEach(([key, value]) => {
      cy.findByDisplayValue(key).click().clear().type(value);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.log("Numeric ratings should be remapped to custom strings");
    openReviewsTable();
    Object.values(customMap).forEach(rating => {
      cy.findAllByText(rating);
    });
  });

  it("should not include date when metric is binned by hour of day (metabase#14124)", () => {
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    cy.createQuestion(
      {
        name: "14124",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          ],
        },
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At: Hour of day");

    cy.log("Reported failing in v0.37.2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^3:00 AM$/);
  });

  it("should not display multiple 'Created At' fields when they are remapped to PK/FK (metabase#15563)", () => {
    // Remap fields
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: "type/PK",
    });
    cy.request("PUT", `/api/field/${REVIEWS.CREATED_AT}`, {
      semantic_type: "type/FK",
      fk_target_field_id: ORDERS.CREATED_AT,
    });

    openReviewsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    cy.get("[data-element-id=list-section-header]")
      .contains("Created At")
      .click();
    cy.get("[data-element-id=list-section] [data-element-id=list-item-title]")
      .contains("Created At")
      .should("have.length", 1);
  });

  it("should display breakouts group for all FKs (metabase#36122)", () => {
    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/FK",
      fk_target_field_id: PRODUCTS.ID,
    });

    openReviewsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    popover().within(() => {
      cy.findAllByTestId("dimension-list-item")
        .eq(3)
        .should("have.text", "Rating");
      cy.get("[data-element-id=list-section-header]").should("have.length", 3);
      cy.get("[data-element-id=list-section-header]")
        .eq(0)
        .should("have.text", "Review");
      cy.get("[data-element-id=list-section-header]")
        .eq(1)
        .should("have.text", "Product");
      cy.get("[data-element-id=list-section-header]")
        .eq(2)
        .should("have.text", "Rating");
    });
  });

  it("display value 'custom mapping' should be available regardless of the chosen filtering type (metabase#16322)", () => {
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}/field/${REVIEWS.RATING}/general`,
    );

    openOptionsForSection("Filtering on this field");
    popover().findByText("Search box").click();

    openOptionsForSection("Display values");
    popover().findByText("Custom mapping").should("not.exist");

    openOptionsForSection("Filtering on this field");
    popover().findByText("A list of all values").click();

    openOptionsForSection("Display values");
    popover().findByText("Custom mapping");
  });

  describe("column formatting options", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/field/*").as("updateField");
      cy.intercept("GET", "/api/field/*").as("getField");
    });

    it("should only show currency formatting options for currency fields", () => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.DISCOUNT}/formatting`,
      );

      cy.wait("@getField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByText("Unit of currency");
        cy.findByText("Currency label style");
      });

      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );

      cy.wait("@getField");

      cy.findByTestId("column-settings").within(() => {
        // shouldnt show currency settings by default for quantity field
        cy.findByText("Unit of currency").should("not.be.visible");
        cy.findByText("Currency label style").should("not.be.visible");

        cy.get("#number_style").click();
      });

      // if you change the style to currency, currency settings should appear
      popover().findByText("Currency").click();
      cy.wait("@updateField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByText("Unit of currency");
        cy.findByText("Currency label style");
      });
    });

    it("should save and obey field prefix formatting settings", () => {
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}/formatting`,
      );

      cy.wait("@getField");

      cy.findByTestId("column-settings").within(() => {
        cy.findByTestId("prefix").type("about ").blur();
      });

      cy.wait("@updateField");

      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["sum", ["field", ORDERS.QUANTITY, null]]],
          },
          type: "query",
        },
      });

      cy.findByTestId("visualization-root").findByText("about 69,540");
    });
  });
});

function openOptionsForSection(sectionName) {
  cy.findByText(sectionName)
    .closest("section")
    .findByTestId("select-button")
    .click();
}
