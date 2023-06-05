import {
  appBar,
  collectionTable,
  getDashboardCard,
  getDashboardCardMenu,
  getDashboardCards,
  modal,
  popover,
  queryBuilderHeader,
  restore,
  rightSidebar,
  summarize,
  visitDashboard,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > dashboard back navigation", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/dataset`).as("dataset");
    cy.intercept("POST", `/api/card/*/query`).as("cardQuery");
    cy.intercept("PUT", `/api/card/*`).as("updateCard");
    cy.intercept("GET", `/api/dashboard/*`).as("dashboard");
    cy.intercept("POST", `/api/dashboard/*/dashcard/*/card/*/query`).as(
      "dashcardQuery",
    );
  });

  it("should display a back to the dashboard button when navigating to a question", () => {
    const dashboardName = "Orders in a dashboard";
    const backButtonLabel = `Back to ${dashboardName}`;

    visitDashboard(1);
    cy.wait("@dashboard");
    cy.findByTestId("dashcard").findByText("Orders").click();
    cy.wait("@cardQuery");
    cy.findByLabelText(backButtonLabel).should("be.visible");
    cy.icon("notebook").click();
    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();
    cy.findByLabelText(backButtonLabel).should("be.visible");
    visualize();
    cy.findByLabelText(backButtonLabel).click();
    cy.findByTestId("dashboard-header")
      .findByText(dashboardName)
      .should("be.visible");

    getDashboardCard().realHover();
    getDashboardCardMenu().click();
    popover().findByText("Edit question").click();
    cy.findByLabelText(backButtonLabel).click();
    cy.findByTestId("dashboard-header")
      .findByText(dashboardName)
      .should("be.visible");

    appBar().findByText("Our analytics").click();
    cy.findByTestId("collection-table").findByText("Orders").click();
    cy.findByLabelText(backButtonLabel).should("not.exist");
  });

  it("should display a back to the dashboard button in table x-ray dashboards", () => {
    const cardTitle = "Sales per state";
    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    cy.wait("@dataset");

    getDashboardCards()
      .filter(`:contains("${cardTitle}")`)
      .findByText(cardTitle)
      .click();
    cy.wait("@dataset");

    queryBuilderHeader()
      .findByLabelText(/Back to .*Orders.*/)
      .click();

    getDashboardCards().filter(`:contains("${cardTitle}")`).should("exist");
  });

  it("should display a back to the dashboard button in model x-ray dashboards", () => {
    const cardTitle = "Orders by Subtotal";
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/auto/dashboard/model/1");
    cy.wait("@dataset");

    getDashboardCards()
      .filter(`:contains("${cardTitle}")`)
      .findByText(cardTitle)
      .click();
    cy.wait("@dataset");

    queryBuilderHeader()
      .findByLabelText(/Back to .*Orders.*/)
      .click();

    getDashboardCards().filter(`:contains("${cardTitle}")`).should("exist");
  });

  it("should preserve query results when navigating between the dashboard and the query builder", () => {
    createDashboardWithCards();
    cy.get("@dashboardId").then(visitDashboard);
    cy.wait("@dashboard");
    cy.wait("@dashcardQuery");

    getDashboardCard().within(() => {
      cy.findByText("101.04").should("be.visible"); // table data
      cy.findByText("Orders").click();
      cy.wait("@cardQuery");
    });

    queryBuilderHeader().within(() => {
      cy.findByLabelText("Back to Test Dashboard").click();
    });

    getDashboardCard(0).within(() => {
      cy.findByText("101.04").should("be.visible"); // cached data
    });

    getDashboardCard(1).within(() => {
      cy.findByText("Text card").should("be.visible"); // cached data
    });

    cy.get("@dashboard.all").should("have.length", 1);
    cy.get("@dashcardQuery.all").should("have.length", 1);

    appBar().within(() => {
      cy.findByText("Our analytics").click();
    });

    collectionTable().within(() => {
      cy.findByText("Test Dashboard").click();
      cy.wait("@dashboard");
      cy.wait("@dashcardQuery");
      cy.get("@dashcardQuery.all").should("have.length", 2);
    });
  });

  it("should not preserve query results when the question changes during navigation", () => {
    visitDashboard(1);
    cy.wait("@dashboard");
    cy.wait("@dashcardQuery");

    getDashboardCard().within(() => {
      cy.findByText("101.04").should("be.visible"); // table data
      cy.findByText("Orders").click();
      cy.wait("@cardQuery");
    });

    queryBuilderHeader().within(() => {
      cy.findByDisplayValue("Orders").clear().type("Orders question").blur();
      cy.wait("@updateCard");
      cy.button("Summarize").click();
    });

    rightSidebar().within(() => {
      cy.findByText("Total").click();
    });

    queryBuilderHeader().within(() => {
      cy.findByText("Save").click();
    });

    modal().within(() => {
      cy.button("Save").click();
      cy.wait("@updateCard");
    });

    queryBuilderHeader().within(() => {
      cy.findByLabelText("Back to Orders in a dashboard").click();
      cy.wait("@dashcardQuery");
      cy.get("@dashboard.all").should("have.length", 1);
    });

    getDashboardCard().within(() => {
      cy.findByText("Orders question").should("be.visible");
      cy.findByText("Count").should("be.visible"); // aggregated data
    });
  });
});

const createDashboardWithCards = () => {
  cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
    cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
      cards: [
        {
          id: -1,
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 8,
          size_y: 8,
        },
        {
          id: -2,
          card_id: null,
          col: 8,
          row: 0,
          size_x: 4,
          size_y: 4,
          visualization_settings: {
            virtual_card: {
              name: null,
              display: "text",
              visualization_settings: {},
              dataset_query: {},
              archived: false,
            },
            text: "Text card",
          },
        },
      ],
    });
    cy.wrap(dashboard_id).as("dashboardId");
  });
};
