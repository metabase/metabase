import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  checkFilterListSourceHasValue,
  createQuestionAndDashboard,
  editDashboard,
  modal,
  popover,
  restore,
  saveDashboard,
  setFilter,
  setFilterListSource,
  sidebar,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("dashboard filters values source config clearing and restoring", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should clear and restore parameter static-list values when the type changes", () => {
    createQuestionAndDashboard({
      questionDetails: {
        display: "scalar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    }).then(({ body: { dashboard_id } }) => {
      visitDashboard(dashboard_id);

      editDashboard();
      setFilter("Number", "Equal to", "Foo");
      mapFilterToQuestion();
      setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      saveDashboard();

      editDashboard();
      editFilter("Foo");

      editFilterType("Text or Category", "Is");
      checkFilterListSourceHasValue({ values: [] });

      mapFilterToQuestion("Email");
      setFilterSourceFromConnectedFields();

      editFilterType("Number", "Equal to");
      checkFilterListSourceHasValue({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
    });
  });
});

function setFilterSourceFromConnectedFields() {
  sidebar().findByText("Edit").click();
  modal().within(() => {
    cy.findByText("From connected fields").click();
    cy.button("Done").click();
  });
}

const mapFilterToQuestion = (column = "Quantity") => {
  cy.findByText("Select…").click();
  popover().within(() => cy.findByText(column).click());
};

function editFilter(name: string) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function editFilterType(type: string, subType: string) {
  sidebar().findByText("Filter or parameter type").next().click();
  popover().findByText(type).click();

  sidebar().findByText("Filter operator").next().click();
  popover().findByText(subType).click();
}
