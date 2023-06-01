import {
  filter,
  filterField,
  filterFieldPopover,
  modal,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issue 28971", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to filter a newly created model (metabase#28971)", () => {
    cy.visit("/");

    cy.findByText("New").click();
    popover().within(() => cy.findByText("Model").click());
    cy.findByText("Use the notebook editor").click();
    popover().within(() => cy.findByText("Sample Database").click());
    popover().within(() => cy.findByText("Orders").click());
    cy.button("Save").click();
    modal().button("Save").click();
    cy.wait("@createCard");

    filter();
    filterField("Quantity", { operator: "equal to" });
    filterFieldPopover("Quantity").within(() => cy.findByText("20").click());
    cy.button("Apply Filters").click();
    cy.wait("@dataset");
    cy.findByText("Quantity is equal to 20").should("exist");
    cy.findByText("Showing 4 rows").should("exist");
  });
});
