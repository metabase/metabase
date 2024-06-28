import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  openNavigationSidebar,
  appBar,
  visitQuestion,
  POPOVER_ELEMENT,
} from "e2e/support/helpers";

describe("11914, 18978, 18977", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion({
      query: {
        "source-table": `card__${ORDERS_QUESTION_ID}`,
        limit: 2,
      },
    }).then(({ body: { id: questionId } }) => {
      cy.signIn("nodata");
      visitQuestion(questionId);
    });
  });

  it("should not display query editing controls and 'Browse databases' link", () => {
    cy.log(
      "Make sure we don't prompt user to browse databases from the sidebar",
    );
    openNavigationSidebar();
    cy.findByLabelText("Browse databases").should("not.exist");

    cy.log("Make sure we don't prompt user to create a new query");
    appBar().icon("add").click();
    popover().within(() => {
      cy.findByText("Dashboard").should("be.visible");
      cy.findByText("Question").should("not.exist");
      cy.findByText(/SQL query/).should("not.exist");
      cy.findByText("Model").should("not.exist");
    });
    // Click anywhere to close the "new" button popover
    cy.get("body").click("topLeft");

    cy.log(
      "Make sure we don't prompt user to perform any further query manipulations",
    );
    cy.findByTestId("qb-header-action-panel").within(() => {
      // visualization
      cy.icon("refresh").should("be.visible");
      cy.icon("bookmark").should("be.visible");
      // querying
      cy.icon("notebook").should("not.exist");
      cy.findByText("Filter").should("not.exist");
      cy.findByText("Summarize").should("not.exist");
      cy.button("Save").should("not.exist");
    });

    cy.log("Make sure drill-through menus do not appear");
    // No drills when clicking a column header
    cy.findAllByTestId("header-cell").contains("Subtotal").click();
    assertNoOpenPopover();

    // No drills when clicking a regular cell
    cy.findAllByRole("gridcell").contains("37.65").click();
    assertNoOpenPopover();

    // No drills when clicking on a FK
    cy.get(".test-Table-FK").contains("123").click();
    assertNoOpenPopover();

    assertIsNotAdHoc();

    cy.log("Make sure user can change visualization but not save the question");
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Number-button").click();
    cy.findByTestId("scalar-value").should("exist");
    assertSaveIsDisabled();

    cy.log("Make sure we don't prompt user to refresh the updated query");
    // Rerunning a query with changed viz settings will make it use the `/dataset` endpoint,
    // so a user will see the "You don't have permission" error
    assertNoRefreshButton();
  });
});

function assertSaveIsDisabled() {
  saveButton().should("have.attr", "aria-disabled", "true");
}

function assertIsNotAdHoc() {
  // Ad-hoc questions have a base64 encoded hash in the URL
  cy.location("hash").should("eq", "");
  saveButton().should("not.exist");
}

function assertNoRefreshButton() {
  cy.findByTestId("qb-header-action-panel").icon("refresh").should("not.exist");
}

function assertNoOpenPopover() {
  cy.get(POPOVER_ELEMENT).should("not.exist");
}

function saveButton() {
  return cy.findByTestId("qb-header").button("Save");
}
