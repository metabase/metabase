const { H } = cy;

export function startQuestionFromTable(table: string) {
  cy.visit("/");
  H.newButton("Question").click();
  selectFromPopover("Sample Database");
  selectFromPopover(table);
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
  H.popover().contains(item).should("be.visible").click();
}

export function joinTables(baseTable: string, joinTable: string) {
  selectFromPopover("Sample Database");
  selectFromPopover(baseTable);

  H.join();

  selectFromPopover("Sample Database");
  selectFromPopover(joinTable);
}
