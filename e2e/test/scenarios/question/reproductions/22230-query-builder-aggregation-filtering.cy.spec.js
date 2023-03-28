import {
  restore,
  popover,
  summarize,
  openPeopleTable,
  visualize,
} from "e2e/support/helpers";

describe("issue 22230", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering on aggregated fields", () => {
    openPeopleTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    popover().findByRole("option", { name: "Maximum of ..." }).click();
    popover().findByRole("option", { name: "Name" }).click();

    cy.findByText("Pick a column to group by").click();
    popover().findByRole("option", { name: "Source" }).click();

    cy.button("Filter").click();
    popover().findByRole("option", { name: "Max of Name" }).click();
    cy.findByTestId("select-button").click();
    cy.findByRole("option", { name: "Starts with" }).click();
    popover().findByPlaceholderText("Enter some text").type("Zo");
    popover().button("Add filter").click();

    visualize();

    cy.findByText("Showing 2 rows").should("be.visible");
    cy.findByText("Zora Schamberger").should("be.visible");
    cy.findByText("Zoie Kozey").should("be.visible");
  });
});
