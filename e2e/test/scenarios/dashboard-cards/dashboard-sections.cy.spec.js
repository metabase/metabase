import {
  ORDERS_DASHBOARD_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const CATEGORY_FILTER = createMockParameter({
  id: "1",
  name: "Category",
  type: "string/=",
});

cy.describeWithSnowplow("scenarios > dashboard cards > sections", () => {
  beforeEach(() => {
    cy.resetSnowplow();
    cy.restore();
    cy.signInAsAdmin();
    cy.enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [CATEGORY_FILTER],
    });
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
  });

  afterEach(() => {
    cy.expectNoBadSnowplowEvents();
  });

  it("should add sections and select a question for an empty card", () => {
    cy.editDashboard();

    cy.getDashboardCards().should("have.length", 1);
    addSection("KPIs w/ large chart below");
    cy.getDashboardCards().should("have.length", 7);
    cy.expectGoodSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_chart_below",
    });

    cy.findByPlaceholderText("Heading").type("This is a heading");
    selectQuestion("Orders, Count");

    cy.createNewTab();
    cy.getDashboardCards().should("have.length", 0);
    addSection("KPI grid");
    cy.getDashboardCards().should("have.length", 5);
    cy.expectGoodSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_grid",
    });

    selectQuestion("Orders, Count, Grouped by Created At (year)");

    mapDashCardToFilter(cy.getDashboardCard(1), "Category");
    overwriteDashCardTitle(cy.getDashboardCard(1), "Line chart");

    cy.goToTab("Tab 1");
    cy.saveDashboard();

    cy.dashboardGrid().within(() => {
      cy.getDashboardCards().should("have.length", 7);
      cy.findAllByText("Select question").should("have.length", 0);

      cy.findByText("This is a heading").should("exist");
      cy.findByText("Orders, Count").should("exist");
      cy.findByText("Orders").should("exist");

      cy.findByText("Line chart").should("not.exist");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
    });

    cy.goToTab("Tab 2");

    cy.dashboardGrid().within(() => {
      cy.getDashboardCards().should("have.length", 5);
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
    cy.editDashboard();
    filterPanel().findByText("Category").click();
    cy.getDashboardCard(1).findByText("Product.Category").should("exist");
  });
});

describe("scenarios > dashboard cards > sections > read only collections", () => {
  beforeEach(() => {
    cy.restore();
    cy.signIn("readonly");
  });

  it("Should allow you to select entites in collections you have read access to (metabase#50602)", () => {
    cy.createDashboard({
      collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
    }).then(({ body }) => {
      cy.visitDashboard(body.id);
    });

    cy.editDashboard();
    addSection("KPIs w/ large chart below");
    cy.dashboardGrid()
      .findAllByText("Select question")
      .first()
      .click({ force: true });
    cy.entityPickerModal()
      .findByRole("tab", { name: /Questions/ })
      .click();
    cy.entityPickerModalItem(0, "Our analytics").click();
    cy.entityPickerModalItem(1, "Orders, Count").click();
    cy.dashboardGrid().findByText("Orders, Count").should("exist");
  });
});

function addSection(name) {
  cy.findByLabelText("Add section").click();
  cy.menu().findByLabelText(name).click();
}

function selectQuestion(question) {
  cy.dashboardGrid()
    .findAllByText("Select question")
    .first()
    .click({ force: true });
  cy.entityPickerModal()
    .findByRole("tab", { name: /Questions/ })
    .click();
  cy.entityPickerModal().findByText(question).click();
  cy.wait("@cardQuery");
  cy.dashboardGrid().findByText(question).should("exist");
}

function overwriteDashCardTitle(dashcardElement, textTitle) {
  cy.findDashCardAction(dashcardElement, "Show visualization options").click({
    force: true,
  });
  cy.modal().within(() => {
    cy.findByLabelText("Title").type(`{selectall}{del}${textTitle}`).blur();
    cy.button("Done").click();
  });
}

function filterPanel() {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
}

function mapDashCardToFilter(dashcardElement, filterName) {
  filterPanel().findByText(filterName).click();
  cy.selectDashboardFilter(dashcardElement, filterName);
  cy.sidebar().button("Done").click();
}
