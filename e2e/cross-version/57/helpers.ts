const { H } = cy;

export function startQuestionFromTable(table: string) {
  cy.visit("/");
  H.newButton("Question").click();
  H.modal().contains(table).should("be.visible").click();
}

export function saveQuestion(name: string) {
  cy.log(`-- Save question: ${name}`);
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByTestId("qb-header").button("Save").click();
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByLabelText("Name").clear().type(name);
    cy.button("Save").click();
    cy.wait("@saveQuestion");
  });
}

export function assertRowCount(count: string) {
  cy.findByTestId("question-row-count").should(
    "have.text",
    `Showing ${count} rows`,
  );
}

export function selectFromPopover(item: string) {
  H.popover().contains(item).click();
}

export function joinTables(baseTable: string, joinTable: string) {
  H.modal().within(() => {
    cy.findAllByRole("tab")
      .should("be.visible")
      .filter(":contains(Tables)")
      .click();
    cy.findAllByTestId("picker-item").filter(`:contains(${baseTable})`).click();
  });

  H.join();

  H.modal().within(() => {
    cy.findAllByRole("tab")
      .should("be.visible")
      .filter(":contains(Tables)")
      .click();
    cy.findAllByTestId("picker-item").filter(`:contains(${joinTable})`).click();
  });
}
