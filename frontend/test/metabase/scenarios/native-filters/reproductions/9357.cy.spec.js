import { restore, openNativeEditor } from "__support__/e2e/cypress";
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
    cy.get("fieldset .Icon-empty")
      .first()
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", 430, 0, { force: true })
      .trigger("mouseup", 430, 0, { force: true });

    // Ensure they're in the right order
    cy.findAllByText("Variable name")
      .parent()
      .as("variableField");

    cy.get("@variableField")
      .first()
      .findByText("nextparameter");

    cy.get("@variableField")
      .last()
      .findByText("firstparameter");
  });
});
