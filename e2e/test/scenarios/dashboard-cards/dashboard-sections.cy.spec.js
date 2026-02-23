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

describe("scenarios > dashboard cards > sections", () => {
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
    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_chart_below",
    });

    cy.findByPlaceholderText(
      "You can connect widgets to {{variables}} in heading cards.",
    ).type("This is a heading");
    selectQuestion("Orders, Count");

    H.createNewTab();
    H.getDashboardCards().should("have.length", 0);
    addSection("KPI grid");
    H.getDashboardCards().should("have.length", 5);
    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_section_added",
      section_layout: "kpi_grid",
    });

    selectQuestion("Orders, Count, Grouped by Created At (year)");

    overwriteDashCardTitle(
      1,
      "Orders, Count, Grouped by Created At (year)",
      "Line chart",
    );
    // TODO: if the mapping is done before the title is changed, the mapping is lost
    mapDashCardToFilter(H.getDashboardCard(1), "Category");

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
    cy.intercept("GET", "/api/collection/*/items*").as("getCollectionItems");
  });

  it("Should allow you to select entities in collections you have read access to (metabase#50602)", () => {
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
    cy.wait(["@getCollectionItems", "@getCollectionItems"]);
    H.pickEntity({ path: ["Our analytics", "Orders, Count"] });
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
  H.pickEntity({ path: ["Our analytics", question] });
  cy.wait("@cardQuery");
  H.dashboardGrid().findByText(question).should("exist");
}

function overwriteDashCardTitle(index, originalTitle, newTitle) {
  H.showDashcardVisualizerModalSettings(index, {
    isVisualizerCard: false,
  });
  cy.findByDisplayValue(originalTitle).clear().type(newTitle).blur();
  H.saveDashcardVisualizerModalSettings();
}

function filterPanel() {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
}

function mapDashCardToFilter(dashcardElement, filterName) {
  filterPanel().findByText(filterName).click();
  H.selectDashboardFilter(dashcardElement, filterName);
  H.sidebar().button("Done").click();
}
