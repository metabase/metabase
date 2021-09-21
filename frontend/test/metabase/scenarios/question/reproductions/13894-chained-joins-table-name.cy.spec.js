import { restore, popover, openOrdersTable } from "__support__/e2e/cypress";

describe("issue 13894", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should always display 'Previous results' for subsequent joins (metabase#13894)", () => {
    openOrdersTable({ mode: "notebook" });

    clickActionButton("Join data");
    selectFromDropdown("People");
    assertLeftTableName("Orders");

    clickActionButton("Join data");
    assertLeftTableName("Previous results", { step: 1 });
    selectFromDropdown("Products");

    clickActionButton("Join data");
    selectFromDropdown("People");

    assertLeftTableName("Orders", { step: 0 });
    assertLeftTableName("Previous results", { step: 1 });
    assertLeftTableName("Previous results", { step: 2 });

    // Test joins in the next notebook stages also show "Previous results"

    clickActionButton("Summarize");
    selectFromDropdown("Count of rows");
    cy.findByText("Pick a column to group by").click();
    selectFromDropdown("Created At");

    cy.findByTestId("step-summarize-0-0").within(() => {
      clickActionButton("Join data");
    });
    selectFromDropdown("Reviews");
    assertLeftTableName("Previous results", { stage: 1 });
  });
});

function clickActionButton(name) {
  cy.findByTestId("action-buttons")
    .findByText(name)
    .click();
}

function selectFromDropdown(text) {
  popover()
    .findByText(text)
    .click();
}

function assertLeftTableName(name, { stage = 0, step = 0 } = {}) {
  cy.findByTestId(`step-join-${stage}-${step}`)
    .findByTestId("left-table")
    .should("have.text", name);
}
