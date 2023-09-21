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
  visitDashboardAndCreateTab,
  visualize,
  openQuestionsSidebar,
  sidebar,
  saveDashboard,
  filterWidget,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS_ID } = SAMPLE_DATABASE;
const PG_DB_ID = 2;
const PERMISSION_ERROR = "Sorry, you don't have permission to see this card.";

describe("scenarios > dashboard > dashboard back navigation", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setActionsEnabledForDB(SAMPLE_DB_ID);

    cy.intercept("POST", `/api/dataset`).as("dataset");
    cy.intercept("GET", "/api/card/*").as("card");
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

  it("should expand the native editor when editing a question from a dashboard", () => {
    createDashboardWithNativeCard();
    cy.get("@dashboardId").then(visitDashboard);
    getDashboardCard().realHover();
    getDashboardCardMenu().click();
    popover().findByText("Edit question").click();
    cy.findByTestId("native-query-editor").should("be.visible");

    queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();
    getDashboardCard().findByText("Orders SQL").click();
    cy.findByTestId("native-query-top-bar")
      .findByText("This question is written in SQL.")
      .should("be.visible");
    cy.findByTestId("native-query-editor").should("not.be.visible");
  });

  it(
    "should display a back to the dashboard button in table x-ray dashboards",
    { tags: "@slow" },
    () => {
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
    },
  );

  it("should display 'back to the model x-ray dashboard' button after drill-through", () => {
    const modelDetails = {
      name: "Simple Native Model",
      native: { query: 'select 1 as "Foo"' },
      dataset: true,
    };

    cy.createNativeQuestion(modelDetails).then(({ body: { id } }) => {
      const modelUrl = `/auto/dashboard/model/${id}`;

      cy.visit(modelUrl);
      cy.log("There will always be just two cards since the model is simple");
      cy.wait(["@dataset", "@dataset"]);

      cy.log("Drill through to see the ad-hoc question");
      cy.findByTestId("scalar-title")
        .should("have.text", `Total ${modelDetails.name}`)
        .click();

      cy.log("Make sure we're on the question page");
      // ad-hoc question format is `/question` followed by hash `#`
      cy.location("pathname").should("eq", "/question");
      cy.findByTestId("view-footer").findByText("Showing 1 row");
      cy.findByTestId("scalar-value").should("have.text", 1);

      cy.log("Go back to the model x-ray dashboard");
      const labelRegex = new RegExp(`Back to .*${modelDetails.name}`, "i");
      queryBuilderHeader().findByLabelText(labelRegex).click();
      cy.location("pathname").should("eq", modelUrl);
      cy.findByTestId("scalar-title").should(
        "have.text",
        `Total ${modelDetails.name}`,
      );
    });
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

  it("should navigate back to a dashboard with permission errors", () => {
    createDashboardWithPermissionError();
    cy.signInAsNormalUser();
    cy.get("@dashboardId").then(visitDashboard);
    cy.wait("@dashboard");
    cy.wait("@dashcardQuery");

    getDashboardCard(1).findByText(PERMISSION_ERROR);
    getDashboardCard(0).findByText("Orders 1").click();
    cy.wait("@card");

    queryBuilderHeader()
      .findByLabelText("Back to Orders in a dashboard")
      .click();

    getDashboardCard(1).findByText(PERMISSION_ERROR);
    cy.get("@dashboard.all").should("have.length", 1);
    cy.get("@dashcardQuery.all").should("have.length", 1);
  });

  it("should return to dashboard with specific tab selected", () => {
    visitDashboardAndCreateTab({ dashboardId: 1, save: false });

    // Add card to second tab
    cy.icon("pencil").click();
    openQuestionsSidebar();
    sidebar().within(() => {
      cy.findByText("Orders, Count").click();
    });
    saveDashboard();

    getDashboardCard().within(() => {
      cy.findByText("Orders, Count").click();
      cy.wait("@card");
    });

    queryBuilderHeader()
      .findByLabelText("Back to Orders in a dashboard")
      .click();

    cy.findByRole("tab", { selected: true }).should("have.text", "Tab 2");
  });
});

describe(
  "scenarios > dashboard > dashboard back navigation",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/card/*").as("card");
      cy.intercept("POST", `/api/dashboard/*/dashcard/*/card/*/query`).as(
        "dashcardQuery",
      );
    });

    it("should preserve filter value when navigating between the dashboard and the question without re-fetch", () => {
      // could be a regular dashboard with card and filters
      createDashboardWithSlowCard();

      cy.get("@dashboardId").then(dashboardId => {
        cy.visit(`/dashboard/${dashboardId}`);
        cy.wait("@dashboard");
        cy.wait("@dashcardQuery");
      });

      // initial loading of the dashboard with card
      cy.get("@dashcardQuery.all").should("have.length", 1);

      filterWidget().findByPlaceholderText("sleep").type("1{enter}");

      cy.wait("@dashcardQuery");

      // we applied filter, so the data is requested again
      cy.get("@dashcardQuery.all").should("have.length", 2);

      cy.log("drill down to the question");
      getDashboardCard().within(() => {
        cy.findByText("Sleep card").click();
      });

      filterWidget().findByPlaceholderText("sleep").should("have.value", "1");
      // if we do not wait for this query, it's canceled and re-trigered on dashboard
      cy.wait("@card");

      cy.log("navigate back to the dashboard");
      queryBuilderHeader().findByLabelText("Back to Sleep dashboard").click();

      getDashboardCard().within(() => {
        cy.findByText("Sleep card").should("be.visible");
      });

      filterWidget().findByPlaceholderText("sleep").should("have.value", "1");

      // cached data is used, no re-fetching should happen
      cy.get("@dashcardQuery.all").should("have.length", 2);
    });

    // be careful writing a test after this one. tests order matters.
    // cypress will not cancel the request with slow response after the test is finished
    // so it will affect interception of @dashcardQuery and mess up the number of requests
    it("should restore a dashboard with loading cards and re-fetch query data", () => {
      createDashboardWithSlowCard();
      cy.get("@dashboardId").then(dashboardId => {
        cy.visit({
          url: `/dashboard/${dashboardId}`,
          qs: { sleep: 60 },
        });
      });
      cy.wait("@dashboard");

      getDashboardCard().within(() => {
        cy.findByTestId("loading-spinner").should("be.visible");
        cy.findByText("Sleep card").click();
        cy.wait("@card");
      });

      queryBuilderHeader().within(() => {
        cy.findByLabelText("Back to Sleep dashboard").click();
      });

      getDashboardCard().within(() => {
        cy.findByText("Sleep card").should("be.visible");
      });

      // dashboard is taken from the cache, no re-fetch
      cy.get("@dashboard.all").should("have.length", 1);
      // the query is triggered second time as first one never loaded - no value in the cache
      cy.get("@dashcardQuery.all").should("have.length", 2);
    });
  },
);

const createDashboardWithCards = () => {
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

    cy.wrap(dashboard_id).as("dashboardId");
  });
};

const createDashboardWithNativeCard = () => {
  const questionDetails = {
    name: "Orders SQL",
    native: {
      query: "SELECT * FROM ORDERS",
    },
  };

  cy.createNativeQuestionAndDashboard({ questionDetails }).then(
    ({ body: { dashboard_id } }) => cy.wrap(dashboard_id).as("dashboardId"),
  );
};

const createDashboardWithSlowCard = () => {
  const questionDetails = {
    name: "Sleep card",
    database: PG_DB_ID,
    native: {
      query: "SELECT {{sleep}}, pg_sleep({{sleep}});",
      "template-tags": {
        sleep: {
          id: "fake-uuid",
          name: "sleep",
          "display-name": "sleep",
          type: "number",
          default: 0,
        },
      },
    },
  };

  const filterDetails = {
    name: "sleep",
    slug: "sleep",
    id: "96917420",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "Sleep dashboard",
    parameters: [filterDetails],
  };

  const dashcardDetails = {
    row: 0,
    col: 0,
    size_x: 8,
    size_y: 8,
  };

  const parameterMapping = {
    parameter_id: filterDetails.id,
    target: ["variable", ["template-tag", "sleep"]],
  };

  cy.createNativeQuestionAndDashboard({
    questionDetails,
    dashboardDetails,
  }).then(({ body: { id, card_id, dashboard_id } }) => {
    cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
      cards: [
        {
          id,
          card_id,
          ...dashcardDetails,
          parameter_mappings: [{ ...parameterMapping, card_id }],
        },
      ],
    });

    cy.wrap(dashboard_id).as("dashboardId");
  });
};

const createDashboardWithPermissionError = () => {
  const question1Details = {
    name: "Orders 1",
    query: { "source-table": ORDERS_ID },
  };

  const question2Details = {
    name: "Orders 2",
    query: { "source-table": ORDERS_ID },
    collection_id: 1,
  };

  const dashboardDetails = {
    name: "Orders in a dashboard",
  };

  const dashcard1Details = {
    row: 0,
    col: 0,
    size_x: 8,
    size_y: 8,
  };

  const dashcard2Details = {
    row: 0,
    col: 8,
    size_x: 8,
    size_y: 8,
  };

  cy.createQuestion(question1Details).then(({ body: { id: card_id_1 } }) => {
    cy.createQuestion(question2Details).then(({ body: { id: card_id_2 } }) => {
      cy.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
            cards: [
              { id: -1, card_id: card_id_1, ...dashcard1Details },
              { id: -2, card_id: card_id_2, ...dashcard2Details },
            ],
          });

          cy.wrap(dashboard_id).as("dashboardId");
        },
      );
    });
  });
};
