const { H } = cy;

export function saveQuestion(name: string) {
  cy.log(`-- Save question: ${name}`);
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByTestId("qb-header").button("Save").click();
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByLabelText("Name").clear().type(name);
    cy.button("Save").click();
    cy.wait("@saveQuestion");
  });
  cy.findByTestId("save-question-modal").should("not.exist");
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

/**
 * Visits the root collection and waits for the collection items API response
 * before returning, ensuring the collection table is fully rendered.
 */
export function visitRootCollectionAndWait() {
  cy.intercept("GET", "/api/collection/root/items?*").as("rootCollectionItems");
  cy.visit("/collection/root");
  cy.wait("@rootCollectionItems");
  cy.findByTestId("collection-table").should("exist");
}

export function joinTables(baseTable: string, joinTable: string) {
  selectFromPopover("Sample Database");
  selectFromPopover(baseTable);

  H.join();

  selectFromPopover("Sample Database");
  selectFromPopover(joinTable);
}
