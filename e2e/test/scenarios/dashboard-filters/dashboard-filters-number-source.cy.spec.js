const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > dashboard > filters", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be able to use a static list source with a dropdown or a search box, and restore it when the type changes back", () => {
    H.createQuestionAndDashboard({
      questionDetails: targetQuestion,
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    H.setFilter("Number", "Equal to", "Number");
    mapFilterToQuestion();
    H.setFilterListSource({
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });
    H.setFilter("Number", "Equal to", "Number search");
    mapFilterToQuestion();
    H.sidebar().findByText("Search box").click();
    H.setFilterListSource({
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });
    H.saveDashboard();

    cy.log("dropdown");
    filterDashboard({ index: 0, isDropdown: true });

    H.filterWidget().eq(0).findByText("Twenty").should("be.visible");
    H.getDashboardCard().findByText("4").should("be.visible");
    H.clearFilterWidget(0);
    H.getDashboardCard().findByText("18,760").should("be.visible");

    cy.log("search box");
    filterDashboard({ index: 1, isLabeled: true });

    H.filterWidget().eq(1).findByText("Twenty").should("be.visible");
    H.getDashboardCard().findByText("4").should("be.visible");

    cy.log("static list values are cleared and restored when the type changes");
    H.editDashboard();
    editFilter("Number");

    editFilterType("Text or Category", "Is");
    H.checkFilterListSourceHasValue({ values: [] });

    mapFilterToQuestion("Email");
    setFilterSourceFromConnectedFields();

    editFilterType("Number", "Equal to");
    H.checkFilterListSourceHasValue({
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });
  });

  it("should allow to use a card source with numeric columns and single or multiple values", () => {
    cy.log("setup a dashboard");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Number", "Less than or equal to");
    H.selectDashboardFilter(H.getDashboardCard(), "Total");
    H.sidebar().findByText("Dropdown list").click();
    H.setFilterQuestionSource({ question: "Orders", field: "ID" });
    H.setFilter("Number", "Equal to");
    H.selectDashboardFilter(H.getDashboardCard(), "Quantity");
    H.sidebar().findByText("Dropdown list").click();
    H.setFilterQuestionSource({ question: "Orders", field: "ID" });
    H.saveDashboard();

    cy.log("single value: pick a value without searching");

    H.filterWidget().eq(0).click();
    H.popover().within(() => {
      cy.findByText("5").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().findByText("1 row").should("be.visible");

    cy.log("single value: pick a value with searching");

    H.filterWidget().eq(0).click();
    H.popover().within(() => {
      cy.findByTestId("5-filter-value").should("be.visible");
      cy.findByPlaceholderText("Search the list").type("20");
      cy.findByTestId("5-filter-value").should("not.exist");
      cy.findByText("20").click();
      cy.button("Update filter").click();
    });
    H.getDashboardCard().within(() => H.assertTableRowsCount(52));
    H.clearFilterWidget(0);

    cy.log("multiple values: pick a value without searching");

    H.filterWidget().eq(1).click();
    H.popover().within(() => {
      cy.findByText("7").click();
      cy.findByText("25").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().findByText("932 rows").should("be.visible");

    cy.log("multiple values: pick a value with searching");

    H.filterWidget().eq(1).click();
    H.popover().within(() => {
      cy.findByLabelText("7").should("be.checked");
      cy.findByLabelText("25").should("be.checked");
      cy.findByPlaceholderText("Search the list").type("225");
      cy.findByLabelText("7").should("not.exist");
      cy.findByText("225").click();
      cy.button("Update filter").click();
    });

    H.filterWidget().eq(1).click();
    H.popover().within(() => {
      cy.findByLabelText("7").should("be.checked");
      cy.findByLabelText("25").should("be.checked");
      cy.findByLabelText("225").should("be.checked");
    });
  });
});

const mapFilterToQuestion = (column = "Quantity") => {
  cy.findByText("Select…").click();
  H.popover().within(() => cy.findByText(column).click());
};

function setFilterSourceFromConnectedFields() {
  H.sidebar().findByText("Edit").click();
  H.modal().within(() => {
    cy.findByText("From connected fields").click();
    cy.button("Done").click();
  });
}

function editFilter(name) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function editFilterType(type, subType) {
  H.sidebar().findByText("Filter or parameter type").next().click();
  H.selectDropdown().findByText(type).click();

  H.sidebar().findByText("Filter operator").next().click();
  H.selectDropdown().findByText(subType).click();
}

const filterDashboard = ({ index, isLabeled = false, isDropdown = false }) => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.filterWidget().eq(index).click();

  if (isDropdown) {
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list");

      cy.findByText("Ten").should("be.visible");
      cy.findAllByText("30").should("be.visible");
      cy.findByText("Twenty").should("be.visible").click();

      cy.button("Add filter").click();
    });
    return;
  }

  if (isLabeled) {
    H.popover().first().findByPlaceholderText("Enter a number").type("T");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText("Twenty").click();
    H.popover().first().button("Add filter").click();
  }
};
