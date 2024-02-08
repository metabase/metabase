import {
  editDashboard,
  getDashboardCard,
  goToTab,
  openQuestionsSidebar,
  restore,
  selectDashboardFilter,
  sidebar,
  visitDashboard,
} from "e2e/support/helpers";

const TAB_1 = {
  id: 1,
  name: "Tab 1",
};

const TAB_2 = {
  id: 2,
  name: "Tab 2",
};

const DASHBOARD_TEXT_FILTER = {
  id: "3",
  name: "Text filter",
  slug: "filter-text",
  type: "string/contains",
};

describe("issue 38245", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    restore();
    cy.signInAsNormalUser();
  });

  it("should not make a request to the server if the parameters are not saved (metabase#38245)", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [DASHBOARD_TEXT_FILTER],
      dashcards: [],
    }).then(dashboard => visitDashboard(dashboard.id));

    editDashboard();
    openQuestionsSidebar();

    sidebar().findByText("Orders").click();

    cy.wait("@cardQuery");

    mapDashCardToFilter(
      getDashboardCard(),
      DASHBOARD_TEXT_FILTER.name,
      "Source",
    );

    goToTab(TAB_2.name);
    goToTab(TAB_1.name);

    getDashboardCard().within(() => {
      cy.findByText("Orders").should("exist");
      cy.findByText("Product ID").should("exist");
      cy.findByText(/(Problem|Error)/i).should("not.exist");
    });

    cy.get("@cardQuery.all").should("have.length", 2);
    cy.get("@cardQuery").should(({ response }) => {
      expect(response.statusCode).not.to.eq(500);
    });
  });
});

function createDashboardWithTabs({ dashcards, tabs, ...dashboardDetails }) {
  return cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
      ...dashboard,
      dashcards,
      tabs,
    }).then(({ body: dashboard }) => cy.wrap(dashboard));
  });
}

function filterPanel() {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
}

function mapDashCardToFilter(dashcardElement, filterName, columnName) {
  filterPanel().findByText(filterName).click();
  selectDashboardFilter(dashcardElement, columnName);
  sidebar().button("Done").click();
}
