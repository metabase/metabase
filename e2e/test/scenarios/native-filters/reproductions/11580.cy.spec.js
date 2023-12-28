import { restore, openNativeEditor } from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 11580", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't reorder template tags when updated (metabase#11580)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("{{foo}} {{bar}}");

    cy.findAllByText("Variable name").next().as("variableLabels");

    // ensure they're in the right order to start
    assertVariablesOrder();

    // change the parameter to a number.
    cy.findAllByLabelText("Variable type").first().as("variableType").click();
    SQLFilter.chooseType("Number");

    cy.get("@variableType").should("have.text", "Number");

    // ensure they're still in the right order
    assertVariablesOrder();
  });
});

function assertVariablesOrder() {
  cy.get("@variableLabels").first().should("have.text", "foo");
  cy.get("@variableLabels").last().should("have.text", "bar");
}
