import {
  restore,
  signInAsNormalUser,
  popover,
  modal,
} from "__support__/cypress";

describe("scenarios > question > saved", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it("view and filter saved question", () => {
    cy.visit("/question/1");
    cy.findAllByText("Orders"); // question and table name appears

    // filter to only orders with quantity=100
    cy.findByText("Quantity").click();
    popover().within(() => cy.findByText("Filter").click());
    popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("100");
      cy.findByText("Update filter").click();
    });
    cy.findByText("Quantity is equal to 100");
    cy.findByText("Showing 2 rows"); // query updated

    // check that save will give option to replace
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText('Replace original question, "Orders"');
      cy.findByText("Save as new question");
      cy.findByText("Cancel").click();
    });

    // click "Started from Orders" and check that the original question is restored
    cy.findByText("Started from").within(() => cy.findByText("Orders").click());
    cy.findByText("Showing first 2,000 rows"); // query updated
    cy.findByText("Started from").should("not.exist");
    cy.findByText("Quantity is equal to 100").should("not.exist");
  });
});
