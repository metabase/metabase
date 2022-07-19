import _ from "underscore";
import { restore, popover, startNewQuestion } from "__support__/e2e/helpers";

describe("visual tests > notebook > major UI elements", () => {
  const VIEWPORT_WIDTH = 2500;
  const VIEWPORT_HEIGHT = 1500;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  it("renders correctly", () => {
    startNewQuestion();
    cy.findByTextEnsureVisible("Sample Database").click();
    cy.findByTextEnsureVisible("Orders").click();

    addJoin({
      rightTable: "Products",
    });
    addJoinDimensions({
      currentJoinsCount: 1,
      leftField: "Created At",
      rightField: "Created At",
    });
    addJoinDimensions({
      currentJoinsCount: 2,
    });

    addCustomColumn({
      name: "Total square root (no reason)",
      formula: "sqrt([Total])",
    });

    addSingleValueFilter({
      field: "Total",
      filterType: "Greater than",
      filterValue: "10",
    });

    summarize({ metric: "Average of ...", field: "Quantity" });
    groupBy({ field: "User ID" });

    addSorting({ field: "Average of Quantity" });
    setRowLimit(500);

    cy.percySnapshot(
      "visual tests > notebook > major UI elements renders correctly",
      {
        minHeight: VIEWPORT_HEIGHT,
      },
    );
  });
});

describe("visual tests > notebook > Run buttons", () => {
  const VIEWPORT_WIDTH = 1920;
  const VIEWPORT_HEIGHT = 1500;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  // This tests that the run buttons are the correct size on the Custom question page
  it("in Custom Question render correctly", () => {
    startNewQuestion();
    cy.findByTextEnsureVisible("Sample Database").click();
    cy.findByTextEnsureVisible("Orders").click();
    // Waiting for notebook icon to load
    cy.wait(1000);
    cy.icon("notebook").click();
    // Waiting for empty question to load
    cy.wait(1000);
    // Check that we're on the blank question page
    cy.findByText("Here's where your results will appear");
    cy.percySnapshot(
      "visual tests > notebook > Run buttons in Custom Question render correctly",
      {
        minHeight: VIEWPORT_HEIGHT,
        widths: [VIEWPORT_WIDTH],
      },
    );
  });

  // This tests that the run buttons are the correct size on the Native query page
  it("in Native Query render correctly", () => {
    cy.visit("/");
    cy.findByText("New").click();
    cy.findByText("SQL query").click();

    // Check that we're on the blank question page
    cy.findByText("Here's where your results will appear").click();
    cy.percySnapshot(
      "visual tests > notebook > Run buttons in Native Query render correctly",
      {
        minHeight: VIEWPORT_HEIGHT,
        widths: [VIEWPORT_WIDTH],
      },
    );
  });
});

describe("visual tests > notebook", () => {
  const VIEWPORT_WIDTH = 1200;
  const VIEWPORT_HEIGHT = 600;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    _.range(10).forEach(index => {
      const name = `Sample Database ${index + 1}`;
      cy.addH2SampleDatabase({ name });
    });
  });

  it("data picker", () => {
    startNewQuestion();
    cy.findByText("Sample Database");
    cy.percySnapshot();
  });
});

function selectFromDropdown(itemName) {
  return popover().last().findByText(itemName);
}

function addJoin({ rightTable }) {
  cy.icon("join_left_outer").last().click();

  selectFromDropdown(rightTable).click();
}

function addJoinDimensions({ currentJoinsCount, leftField, rightField }) {
  const lastJoinIndex = currentJoinsCount - 1;

  cy.findByTestId(`join-dimensions-pair-${lastJoinIndex}`).within(() => {
    cy.icon("add").click();
  });

  if (leftField && rightField) {
    selectFromDropdown(leftField).click();
    selectFromDropdown(rightField).click();
  }
}

function addCustomColumn({ name, formula }) {
  cy.icon("add_data").click();
  cy.focused().type(formula);
  cy.findAllByPlaceholderText("Something nice and descriptive").type(name);
  cy.button("Done").click();
}

function addSingleValueFilter({ field, filterType, filterValue }) {
  cy.findByText("Add filters to narrow your answer").click();
  selectFromDropdown(field).click();
  popover().within(() => {
    cy.findByTestId("select-button").click();
  });
  selectFromDropdown(filterType).click();
  popover().within(() => {
    cy.get("input").type(filterValue);
    cy.button("Add filter").click();
  });
}

function summarize({ metric, field }) {
  cy.findByText("Pick the metric you want to see").click();
  selectFromDropdown(metric).click();
  selectFromDropdown(field).click();
}

function groupBy({ field }) {
  cy.findByText("Pick a column to group by").click();
  selectFromDropdown(field).click();
}

function addSorting({ field }) {
  cy.findByText("Sort").click();
  selectFromDropdown(field).click();
}

function setRowLimit(rowLimit) {
  cy.findByText("Row limit").click();
  cy.findByPlaceholderText("Enter a limit").type(String(rowLimit));
}
