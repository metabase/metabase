import { openPeopleTable, popover, restore } from "e2e/support/helpers";

describe("issue 31339", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/field/*/search/*").as("findSuggestions");
  });

  it("should not show horizontal scrollbar in the popover (metabase#31339)", () => {
    openPeopleTable();
    cy.findAllByTestId("header-cell").filter(":contains('Password')").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Password").type("e").blur();
      cy.wait("@findSuggestions");
    });

    popover().then(popoverElement => {
      expect(
        popoverElement[0].clientHeight,
        "horizontal scrollbar is not shown",
      ).to.eq(popoverElement[0].offsetHeight);
    });
  });

  it("should not show horizontal scrollbar in default picker container", () => {
    openPeopleTable();
    cy.findAllByTestId("header-cell").filter(":contains('Password')").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();

      const input = cy.findByPlaceholderText("Search by Password");
      input.type("e").blur();
      cy.wait("@findSuggestions");
      input.type("f");
      cy.wait("@findSuggestions");

      cy.findByTestId("default-picker-container").then(containerElement => {
        expect(
          containerElement[0].clientHeight,
          "horizontal scrollbar is not shown",
        ).to.eq(containerElement[0].offsetHeight);
      });
    });
  });
});
