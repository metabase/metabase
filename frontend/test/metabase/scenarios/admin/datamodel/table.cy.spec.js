// Ported from `databases.e2e.spec.js`
import { signInAsAdmin, restore } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > admin > databases > table", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should see four tables in sample database", () => {
    cy.visit("/admin/datamodel/database/1");
    cy.get(".AdminList-item").should("have.length", 4);
  });

  it("should be able to see details of each table", () => {
    cy.visit("/admin/datamodel/database/1");
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    );

    // Orders
    cy.findByText("Orders").click();
    cy.findByText(
      "Select any table to see its schema and add or edit metadata.",
    ).should("not.exist");
    cy.get(
      "input[value='This is a confirmed order for a product from a user.']",
    );
  });

  describe("in orders table", () => {
    beforeEach(() => {
      cy.visit("/admin/datamodel/database/1/table/2");
    });

    it("should see multiple fields", () => {
      cy.get("input[value='User ID']");
      cy.findAllByText("Foreign Key");

      cy.get("input[value='Tax']");
      cy.findAllByText("No special type");

      cy.get("input[value='Discount']");
      cy.findByText("Discount");
    });

    it("should see the id field", () => {
      cy.get("input[value='ID']");
      cy.findAllByText("Entity Key");
    });

    it("should see the created_at timestamp field", () => {
      cy.get("input[value='Created At']");
      cy.findByText("Creation timestamp");
    });

    it("should respect selected Column ordering (metabase#13024)", () => {
      cy.request("GET", `/api/table/${ORDERS_ID}/query_metadata`).then(
        ({ body }) => {
          const DATABASE_ORDER = body.fields.map(field => field.display_name);

          cy.findByText("Column order: Database");
          // There's currently no better way to select all fields (TODO: sections should have unique CSS class)
          // The only unique element for each of them is ".Grabber", so its parent is a whole field section
          cy.get(".Grabber")
            .parent()
            .as("columns")
            .should("have.length", DATABASE_ORDER.length);

          DATABASE_ORDER.forEach((title, i) => {
            cy.get("@columns")
              .eq(i)
              .within(() => {
                cy.findByDisplayValue(title);
              });
          });
        },
      );
    });
  });
});
