import { openPeopleTable, popover, restore } from "e2e/support/helpers";

describe("issue 31339", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/field/*/search/*").as("findSuggestions");
  });

  it("should not show horizontal scrollbar on overflow (metabase#31339)", () => {
    openPeopleTable();
    headerCells().filter(":contains('Password')").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();

      const input = cy.findByPlaceholderText("Search by Password");

      input.type("e").blur();
      cy.wait("@findSuggestions");

      input.type("f");
      cy.wait("@findSuggestions");

      const container = cy.findByTestId("default-picker-container");

      container.then(containerElement => {
        expect(
          containerElement[0].clientHeight,
          "horizontal scrollbar is not shown",
        ).to.eq(containerElement[0].offsetHeight);
      });
    });
  });
});

function headerCells() {
  return cy.findAllByTestId("header-cell");
}
