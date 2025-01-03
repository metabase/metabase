import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("dashboard filters values source config clearing and restoring", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should clear and restore parameter static-list values when the type changes", () => {
    H.createQuestionAndDashboard({
      questionDetails: {
        display: "scalar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);

      H.editDashboard();
      H.setFilter("Number", "Equal to", "Foo");
      mapFilterToQuestion();
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      H.saveDashboard();

      H.editDashboard();
      editFilter("Foo");

      editFilterType("Text or Category", "Is");
      H.checkFilterListSourceHasValue({ values: [] });

      mapFilterToQuestion("Email");
      setFilterSourceFromConnectedFields();

      editFilterType("Number", "Equal to");
      H.checkFilterListSourceHasValue({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
    });
  });
});

function setFilterSourceFromConnectedFields() {
  H.sidebar().findByText("Edit").click();
  H.modal().within(() => {
    cy.findByText("From connected fields").click();
    cy.button("Done").click();
  });
}

const mapFilterToQuestion = (column = "Quantity") => {
  cy.findByText("Select…").click();
  H.popover().within(() => cy.findByText(column).click());
};

function editFilter(name: string) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function editFilterType(type: string, subType: string) {
  H.sidebar().findByText("Filter or parameter type").next().click();
  H.selectDropdown().findByText(type).click();

  H.sidebar().findByText("Filter operator").next().click();
  H.selectDropdown().findByText(subType).click();
}
