import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createNewTab,
  dashboardGrid,
  describeWithSnowplow,
  editDashboard,
  enableTracking,
  entityPickerModal,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  findDashCardAction,
  getDashboardCard,
  getDashboardCards,
  goToTab,
  menu,
  modal,
  resetSnowplow,
  restore,
  saveDashboard,
  selectDashboardFilter,
  sidebar,
  visitDashboard,
} from "e2e/support/helpers";
import { createMockParameter } from "metabase-types/api/mocks";

const CATEGORY_FILTER = createMockParameter({
  id: "1",
  name: "Category",
  type: "string/=",
});

describeWithSnowplow("scenarios > dashboard cards > sections", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [CATEGORY_FILTER],
    });
    visitDashboard(ORDERS_DASHBOARD_ID);
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should add sections and select a question for an empty card", () => {
    editDashboard();

    getDashboardCards().should("have.length", 1);
    addSection("KPIs w/ large chart below");
    getDashboardCards().should("have.length", 7);
    expectGoodSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_chart_below",
    });

    cy.findByPlaceholderText("Heading").type("This is a heading");
    selectQuestion("Orders, Count");

    createNewTab();
    getDashboardCards().should("have.length", 0);
    addSection("KPI grid");
    getDashboardCards().should("have.length", 5);
    expectGoodSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_grid",
    });

    selectQuestion("Orders, Count, Grouped by Created At (year)");

    mapDashCardToFilter(getDashboardCard(1), "Category");
    overwriteDashCardTitle(getDashboardCard(1), "Line chart");

    goToTab("Tab 1");
    saveDashboard();

    dashboardGrid().within(() => {
      getDashboardCards().should("have.length", 7);
      cy.findAllByText("Select question").should("have.length", 0);

      cy.findByText("This is a heading").should("exist");
      cy.findByText("Orders, Count").should("exist");
      cy.findByText("Orders").should("exist");

      cy.findByText("Line chart").should("not.exist");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
    });

    goToTab("Tab 2");

    dashboardGrid().within(() => {
      getDashboardCards().should("have.length", 5);
      cy.findAllByText("Select question").should("have.length", 0);

      cy.findByText("Line chart").should("exist");

      cy.findByText("This is a heading").should("not.exist");
      cy.findByText("Orders, Count").should("not.exist");
      cy.findByText("Orders").should("not.exist");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
    });

    // Ensure parameter mapping is persisted
    editDashboard();
    filterPanel().findByText("Category").click();
    getDashboardCard(1).findByText("Product.Category").should("exist");
  });
});

function addSection(name) {
  cy.findByLabelText("Add section").click();
  menu().findByLabelText(name).click();
}

function selectQuestion(question) {
  dashboardGrid()
    .findAllByText("Select question")
    .first()
    .click({ force: true });
  entityPickerModal()
    .findByRole("tab", { name: /Questions/ })
    .click();
  entityPickerModal().findByText(question).click();
  cy.wait("@cardQuery");
  dashboardGrid().findByText(question).should("exist");
}

function overwriteDashCardTitle(dashcardElement, textTitle) {
  findDashCardAction(dashcardElement, "Show visualization options").click();
  modal().within(() => {
    cy.findByLabelText("Title").type(`{selectall}{del}${textTitle}`);
    cy.button("Done").click();
  });
}

function filterPanel() {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
}

function mapDashCardToFilter(dashcardElement, filterName) {
  filterPanel().findByText(filterName).click();
  selectDashboardFilter(dashcardElement, filterName);
  sidebar().button("Done").click();
}
