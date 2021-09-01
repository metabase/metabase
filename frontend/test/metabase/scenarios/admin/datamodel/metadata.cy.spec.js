import {
  restore,
  openOrdersTable,
  openReviewsTable,
  popover,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATASET;

describe("scenarios > admin > datamodel > metadata", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should correctly show remapped column value", () => {
    // go directly to Data Model page for Sample Dataset
    cy.visit("/admin/datamodel/database/1");
    // edit "Product ID" column in "Orders" table
    cy.findByText("Orders").click();
    cy.findByDisplayValue("Product ID")
      .parent()
      .find(".Icon-gear")
      .click();

    // remap its original value to use foreign key
    cy.findByText("Use original value").click();
    cy.findByText("Use foreign key").click();
    popover().within(() => {
      cy.findByText("Title").click();
    });
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

    // go directly to Data Model page for Sample Dataset
    cy.visit("/admin/datamodel/database/1");
    // edit "Rating" values in "Reviews" table
    cy.findByText("Reviews").click();
    cy.findByDisplayValue("Rating")
      .parent()
      .find(".Icon-gear")
      .click();

    // apply custom remapping for "Rating" values 1-5
    cy.findByText("Use original value").click();
    cy.findByText("Custom mapping").click();
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    Object.entries(customMap).forEach(([key, value]) => {
      cy.findByDisplayValue(key)
        .click()
        .clear()
        .type(value);
    });
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

    cy.createQuestion({
      name: "14124",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        ],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);

      cy.findByText("Created At: Hour of day");

      cy.log("Reported failing in v0.37.2");
      cy.findByText(/^3:00 AM$/);
    });
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
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.get(".List-section-header")
      .contains("Created At")
      .click();
    cy.get(".List-section--expanded .List-item-title")
      .contains("Created At")
      .should("have.length", 1);
  });

  it.skip("display value 'custom mapping' should be available regardless of the chosen filtering type (metabase#16322)", () => {
    cy.visit(
      `/admin/datamodel/database/1/table/${REVIEWS_ID}/${REVIEWS.RATING}/general`,
    );

    openOptionsForSection("Filtering on this field");
    popover()
      .findByText("Search box")
      .click();

    cy.reload();

    openOptionsForSection("Display values");
    popover().findByText("Custom mapping");
  });
});

function openOptionsForSection(sectionName) {
  cy.findByText(sectionName)
    .closest("section")
    .find(".AdminSelect")
    .click();
}
