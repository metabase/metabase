import {
  ORDERS_DASHBOARD_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";
import { createMockParameter } from "metabase-types/api/mocks";

const CATEGORY_FILTER = createMockParameter({
  id: "1",
  name: "Category",
  type: "string/=",
});

H.describeWithSnowplow("scenarios > dashboard cards > sections", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [CATEGORY_FILTER],
    });
    H.visitDashboard(ORDERS_DASHBOARD_ID);
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should add sections and select a question for an empty card", () => {
    H.editDashboard();

    H.getDashboardCards().should("have.length", 1);
    addSection("KPIs w/ large chart below");
    H.getDashboardCards().should("have.length", 7);
    H.expectGoodSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_chart_below",
    });

    cy.findByPlaceholderText("Heading").type("This is a heading");
    selectQuestion("Orders, Count");

    H.createNewTab();
    H.getDashboardCards().should("have.length", 0);
    addSection("KPI grid");
    H.getDashboardCards().should("have.length", 5);
    H.expectGoodSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_grid",
    });

    selectQuestion("Orders, Count, Grouped by Created At (year)");

    mapDashCardToFilter(H.getDashboardCard(1), "Category");
    overwriteDashCardTitle(H.getDashboardCard(1), "Line chart");

    H.goToTab("Tab 1");
    H.saveDashboard();

    H.dashboardGrid().within(() => {
      H.getDashboardCards().should("have.length", 7);
      cy.findAllByText("Select question").should("have.length", 0);

      cy.findByText("This is a heading").should("exist");
      cy.findByText("Orders, Count").should("exist");
      cy.findByText("Orders").should("exist");

      cy.findByText("Line chart").should("not.exist");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
    });

    H.goToTab("Tab 2");

    H.dashboardGrid().within(() => {
      H.getDashboardCards().should("have.length", 5);
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
    H.editDashboard();
    filterPanel().findByText("Category").click();
    H.getDashboardCard(1).findByText("Product.Category").should("exist");
  });
});

describe("scenarios > dashboard cards > sections > read only collections", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("readonly");
  });

  it("Should allow you to select entites in collections you have read access to (metabase#50602)", () => {
    H.createDashboard({ collection_id: READ_ONLY_PERSONAL_COLLECTION_ID }).then(
      ({ body }) => {
        H.visitDashboard(body.id);
      },
    );

    H.editDashboard();
    addSection("KPIs w/ large chart below");
    H.dashboardGrid()
      .findAllByText("Select question")
      .first()
      .click({ force: true });
    H.entityPickerModal()
      .findByRole("tab", { name: /Questions/ })
      .click();
    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalItem(1, "Orders, Count").click();
    H.dashboardGrid().findByText("Orders, Count").should("exist");
  });
});

function addSection(name) {
  cy.findByLabelText("Add section").click();
  H.menu().findByLabelText(name).click();
}

function selectQuestion(question) {
  H.dashboardGrid()
    .findAllByText("Select question")
    .first()
    .click({ force: true });
  H.entityPickerModal()
    .findByRole("tab", { name: /Questions/ })
    .click();
  H.entityPickerModal().findByText(question).click();
  cy.wait("@cardQuery");
  H.dashboardGrid().findByText(question).should("exist");
}

function overwriteDashCardTitle(dashcardElement, textTitle) {
  H.findDashCardAction(dashcardElement, "Show visualization options").click({
    force: true,
  });
  H.modal().within(() => {
    cy.findByLabelText("Title").type(`{selectall}{del}${textTitle}`).blur();
    cy.button("Done").click();
  });
}

function filterPanel() {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
}

function mapDashCardToFilter(dashcardElement, filterName) {
  filterPanel().findByText(filterName).click();
  H.selectDashboardFilter(dashcardElement, filterName);
  H.sidebar().button("Done").click();
}
