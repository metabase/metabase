import { restore, popover, addMySQLDatabase } from "__support__/e2e/cypress";

const MYSQL_DB_NAME = "QA MySQL8";

describe.skip("15342", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(4000, 1200); // huge width required so three joined tables can fit
    addMySQLDatabase(MYSQL_DB_NAME);
  });

  it("should correctly order joins for MySQL queries", () => {
    cy.intercept("POST", "/api/dataset").as("query");

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(MYSQL_DB_NAME).click();
    cy.findByText("People").click();

    addJoin({
      leftColumn: "ID",
      rightTable: "Orders",
      rightColumn: "Product ID",
    });

    addJoin({
      leftTable: "Orders",
      leftColumn: "Product ID",
      rightTable: "Products",
      rightColumn: "ID",
      joinType: "inner",
    });

    cy.button("Visualize").click();
    cy.wait("@query");
    cy.get(".Visualization").within(() => {
      cy.findByText("Email"); // from People table
      cy.findByText("Orders → ID"); // joined Orders table columns
      cy.findByText("Products → ID"); // joined Products table columns
    });
  });
});

function selectFromDropdown(itemName) {
  return popover().findByText(itemName);
}

const JOIN_LABEL = {
  left: "Left outer join",
  right: "Right outer join",
  inner: "Inner join",
};

function addJoin({
  leftTable,
  leftColumn,
  rightTable,
  rightColumn,
  joinType = "left",
} = {}) {
  cy.icon("join_left_outer")
    .last()
    .click();

  selectFromDropdown(rightTable).click();

  if (leftTable) {
    selectFromDropdown(leftTable).click();
  }

  selectFromDropdown(leftColumn).click();
  selectFromDropdown(rightColumn).click();

  cy.findAllByText("Join data")
    .last()
    .next()
    .within(() => {
      cy.icon("join_left_outer").click();
    });
  selectFromDropdown(JOIN_LABEL[joinType]).click();
}
