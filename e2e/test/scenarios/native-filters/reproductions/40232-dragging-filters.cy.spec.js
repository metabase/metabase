import {
  restore,
  openNativeEditor,
  filterWidget,
  popover,
  moveDnDKitElement,
} from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 40232", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not start drag and drop from clicks on popovers", () => {
    openNativeEditor();

    SQLFilter.enterParameterizedQuery("{{foo}} {{bar}}");

    cy.findAllByRole("radio", { name: "Search box" })
      .first()
      .click({ force: true });
    filterWidget().first().click();

    moveDnDKitElement(popover().findByText("Add filter"), {
      horizontal: 300,
    });

    filterWidget()
      .should("have.length", 2)
      .first()
      .should("contain.text", "Foo");
  });
});
