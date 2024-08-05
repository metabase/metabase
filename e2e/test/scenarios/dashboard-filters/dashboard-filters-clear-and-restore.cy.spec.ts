import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
  setFilterListSource,
  sidebar,
  checkFilterListSourceHasValue,
  modal,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

describe("dashboard filters values source config clearing and restoring", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should clear and restore parameter static-list values when the type changes", () => {
    // @ts-expect-error: ts does not know about this function
    cy.createQuestionAndDashboard({
      questionDetails: targetQuestion,
      // @ts-expect-error: see above
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
  sidebar().findByText("Filter type").next().click();
  popover().findByText(type).click();

  sidebar().findByText("Filter operator").next().click();
  popover().findByText(subType).click();
}
