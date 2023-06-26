import { modal, popover, restore, visitQuestion } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;
const EXPRESSION_NAME = "TEST_EXPRESSION";

const question = {
  name: "30905",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      [EXPRESSION_NAME]: ["+", 1, 1],
    },
  },
};
describe("Custom columns visualization settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying minibar settings for a custom column", () => {
    goToExpressionSidebarVisualizationSettings();
    popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });
    saveModifiedQuestion();
  });

  it("should not show 'Save' after text formatting visualization settings", () => {
    goToExpressionSidebarVisualizationSettings();

    popover().within(() => {
      const viewAsDropdown = cy.findByLabelText("Display as");
      viewAsDropdown.click();
    });

    cy.findByLabelText("Email link").click();

    popover().within(() => {
      cy.findByText("Email link").should("exist");
    });

    saveModifiedQuestion();
  });

  it("should not show 'Save' after saving viz settings from the custom column dropdown", () => {
    cy.findAllByTestId("header-cell").contains(EXPRESSION_NAME).click();
    popover().within(() => {
      cy.findByRole("button", { name: /gear icon/i }).click();
    });
    popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });

    saveModifiedQuestion();
  });
});

function saveModifiedQuestion() {
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").click();
  });
  modal().within(() => {
    cy.findByText(/Replace original question/i).should("exist");
    cy.findByText("Save").click();
  });

  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").should("not.exist");
  });
}

function goToExpressionSidebarVisualizationSettings() {
  cy.findByTestId("viz-settings-button").click();
  cy.findByTestId(`${EXPRESSION_NAME}-settings-button`).click();
}
