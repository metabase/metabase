import { signInAsAdmin, restore } from "__support__/cypress";
// Ported from `databases.e2e.spec.js`

describe("scenarios > admin > databases > table", () => {
  before(restore);
  beforeEach(signInAsAdmin);

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
  });
});
