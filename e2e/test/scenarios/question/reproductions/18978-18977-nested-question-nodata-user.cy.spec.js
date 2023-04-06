import {
  restore,
  appBar,
  popover,
  openNavigationSidebar,
  leftSidebar,
  visitQuestion,
  POPOVER_ELEMENT,
} from "e2e/support/helpers";

describe("11914, 18978, 18977", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not display query editing controls and 'Browse Data' link", () => {
    cy.createQuestion({
      query: {
        "source-table": "card__1",
      },
    }).then(({ body: { id: questionId } }) => {
      cy.signIn("nodata");
      visitQuestion(questionId);
      openNavigationSidebar();

      cy.findByText(/Browse data/i).should("not.exist");
      cy.icon("add").click();

      popover().within(() => {
        cy.findByText("Question").should("not.exist");
        cy.findByText(/SQL query/).should("not.exist");
        cy.findByText(/Native query/).should("not.exist");
      });

      // Click outside to close the "new" button popover
      appBar().click();

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.icon("notebook").should("not.exist");
        cy.findByText("Filter").should("not.exist");
        cy.findByText("Summarize").should("not.exist");
        cy.icon("refresh").should("be.visible");
      });

      // Ensure no drills offered when clicking a column header
      cy.findByText("Subtotal").click();
      assertNoOpenPopover();

      // Ensure no drills offered when clicking a regular cell
      cy.findByText("6.42").click();
      assertNoOpenPopover();

      // Ensure no drills offered when clicking FK
      cy.findByText("184").click();
      assertNoOpenPopover();

      assertIsNotAdHoc(questionId);

      setVisualizationTo("line");
      assertIsNotAdHoc(questionId);

      // Rerunning a query with changed viz settings will make it use the `/dataset` endpoint,
      // so a user will see the "Your don't have permission" error
      // Need to ensure "refresh" button is hidden now
      assertNoRefreshButton();

      addGoalLine();
      assertIsNotAdHoc(questionId);
      assertNoRefreshButton();
    });
  });
});

function setVisualizationTo(vizName) {
  cy.findByTestId("viz-type-button").click();

  leftSidebar().within(() => {
    cy.icon(vizName).click();
    cy.icon(vizName).realHover();
    cy.icon("gear").click();
    cy.findByText("X-axis").parent().findByText("Select a field").click();
  });
  selectFromDropdown("Created At");

  leftSidebar().within(() => {
    cy.findByText("Y-axis").parent().findByText("Select a field").click();
  });
  selectFromDropdown("Quantity");

  leftSidebar().findByText("Done").click();
}

function addGoalLine() {
  cy.findByTestId("viz-settings-button").click();
  leftSidebar().within(() => {
    cy.findByText("Display").click();
    cy.findByText("Goal line").parent().find("input").click();
    cy.findByText("Done").click();
  });
  cy.get(".Visualization").get(".goal").should("be.visible");
}

function assertIsNotAdHoc(questionId) {
  cy.url().should("include", `/question/${questionId}`);
  cy.findByTestId("qb-header").findByText("Save").should("not.exist");
}

function assertNoRefreshButton() {
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.icon("refresh").should("not.exist");
  });
}

function assertNoOpenPopover() {
  cy.get(POPOVER_ELEMENT).should("not.exist");
}

function selectFromDropdown(option) {
  popover().findByText(option).click();
}
