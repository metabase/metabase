import { restore, openNativeEditor } from "__support__/e2e/cypress";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 11580", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't reorder template tags when updated (metabase#11580)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("{{foo}} {{bar}}");

    cy.findByTestId("sidebar-right").find(".text-brand").as("variableLabels");

    // ensure they're in the right order to start
    assertVariablesOrder();

    // change the parameter to a number.
    cy.contains("Variable type").first().next().as("variableType").click();
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
