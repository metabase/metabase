import {
  appBar,
  collectionTable,
  createAction,
  getDashboardCard,
  getDashboardCardMenu,
  getDashboardCards,
  modal,
  popover,
  queryBuilderHeader,
  restore,
  rightSidebar,
  setActionsEnabledForDB,
  summarize,
  visitDashboard,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > dashboard back navigation", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setActionsEnabledForDB(SAMPLE_DB_ID);

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
    createAndVisitDashboardWithCards();
    cy.wait("@dashboard");
    cy.wait("@dashcardQuery");

    getDashboardCard().within(() => {
      cy.findByText("101.04").should("be.visible"); // table data
      cy.findByText("Orders").click();
      cy.wait("@cardQuery");
    });

    queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // cached data
    getDashboardCard(0).findByText("101.04").should("be.visible");
    getDashboardCard(1).findByText("Text card").should("be.visible");
    getDashboardCard(2).findByText("Action card").should("be.visible");

    cy.get("@dashboard.all").should("have.length", 1);
    cy.get("@dashcardQuery.all").should("have.length", 1);

    appBar().findByText("Our analytics").click();

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

const createAndVisitDashboardWithCards = () => {
  const questionDetails = {
    name: "Orders",
    query: { "source-table": ORDERS_ID },
  };

  const modelDetails = {
    name: "Orders model",
    query: { "source-table": ORDERS_ID },
    dataset: true,
  };

  const actionDetails = {
    name: "Update orders quantity",
    type: "query",
    database_id: SAMPLE_DB_ID,
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: "UPDATE orders SET quantity = quantity",
      },
      type: "native",
    },
    parameters: [],
    visualization_settings: {
      type: "button",
    },
  };

  const questionDashcardDetails = {
    row: 0,
    col: 0,
    size_x: 8,
    size_y: 8,
    visualization_settings: {},
  };

  const textDashcardDetails = {
    col: 8,
    row: 0,
    size_x: 4,
    size_y: 8,
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
  };

  const actionDashcardDetails = {
    row: 8,
    col: 0,
    size_x: 4,
    size_y: 1,
    series: [],
    visualization_settings: {
      actionDisplayType: "button",
      virtual_card: {
        name: null,
        display: "action",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      "button.label": "Action card",
    },
  };

  cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
    cy.createQuestion(questionDetails).then(({ body: { id: question_id } }) => {
      cy.createQuestion(modelDetails).then(({ body: { id: model_id } }) => {
        createAction({ ...actionDetails, model_id }).then(
          ({ body: { id: action_id } }) => {
            cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
              cards: [
                { id: -1, card_id: question_id, ...questionDashcardDetails },
                { id: -2, ...textDashcardDetails },
                { id: -3, ...actionDashcardDetails, action_id },
              ],
            });
          },
        );
      });
    });

    visitDashboard(dashboard_id);
  });
};
