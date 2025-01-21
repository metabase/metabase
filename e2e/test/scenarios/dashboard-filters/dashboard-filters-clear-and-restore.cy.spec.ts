import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("dashboard filters values source config clearing and restoring", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should clear and restore parameter static-list values when the type changes", () => {
    cy.createQuestionAndDashboard({
      questionDetails: {
        display: "scalar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.visitDashboard(dashboard_id);

      cy.editDashboard();
      cy.setFilter("Number", "Equal to", "Foo");
      mapFilterToQuestion();
      cy.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      cy.saveDashboard();

      cy.editDashboard();
      editFilter("Foo");

      editFilterType("Text or Category", "Is");
      cy.checkFilterListSourceHasValue({ values: [] });

      mapFilterToQuestion("Email");
      setFilterSourceFromConnectedFields();

      editFilterType("Number", "Equal to");
      cy.checkFilterListSourceHasValue({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
    });
  });
});

function setFilterSourceFromConnectedFields() {
  cy.sidebar().findByText("Edit").click();
  cy.modal().within(() => {
    cy.findByText("From connected fields").click();
    cy.button("Done").click();
  });
}

const mapFilterToQuestion = (column = "Quantity") => {
  cy.findByText("Select…").click();
  cy.popover().within(() => cy.findByText(column).click());
};

function editFilter(name: string) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function editFilterType(type: string, subType: string) {
  cy.sidebar().findByText("Filter or parameter type").next().click();
  cy.selectDropdown().findByText(type).click();

  cy.sidebar().findByText("Filter operator").next().click();
  cy.selectDropdown().findByText(subType).click();
}
