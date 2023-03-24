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
    // I don't know why this can't be chained, I tried it and it didn't work.
    popover().findByRole("option", { name: "Name" }).click();

    // findByRole doesn't work here, and I don't know why.
    cy.findByText("Pick a column to group by").click();
    popover().findByRole("option", { name: "Source" }).click();

    // can't use `filter()` because it found multiple filter buttons and Cypress only allows clicking on one element at a time.
    cy.button("Filter").click();
    popover().findByRole("option", { name: "Max of Name" }).click();
    // can't add aria-label to the input, since it's past the translation period.
    cy.findByTestId("select-button").click();
    // can't use `popover()` because there are 2 popovers, and I tested that it also didn't work.
    cy.findByRole("option", { name: "Starts with" }).click();
    popover().findByPlaceholderText("Enter some text").type("Zo");
    popover().button("Add filter").click();

    visualize();

    cy.findByText("Showing 2 rows").should("be.visible");
    cy.findByText("Zora Schamberger").should("be.visible");
    cy.findByText("Zoie Kozey").should("be.visible");
  });
});
