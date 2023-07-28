import {
  restore,
  openOrdersTable,
  openReviewsTable,
  popover,
  summarize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

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
    cy.get(".List-section-header").contains("Created At").click();
    cy.get(".List-section--expanded .List-item-title")
      .contains("Created At")
      .should("have.length", 1);
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
});

function openOptionsForSection(sectionName) {
  cy.findByText(sectionName)
    .closest("section")
    .findByTestId("select-button")
    .click();
}
