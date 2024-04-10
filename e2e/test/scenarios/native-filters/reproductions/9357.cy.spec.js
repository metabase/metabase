import {
  restore,
  openNativeEditor,
  moveDnDKitElement,
} from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 9357", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should reorder template tags by drag and drop (metabase#9357)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery(
      "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
    );

    // Drag the firstparameter to last position
    moveDnDKitElement(cy.get("fieldset").findAllByRole("listitem").first(), {
      horizontal: 430,
    });

    // Ensure they're in the right order
    cy.findAllByText("Variable name").parent().as("variableField");

    cy.get("@variableField").first().findByText("nextparameter");

    cy.get("@variableField").eq(1).findByText("firstparameter");
  });
});
