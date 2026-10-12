const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const cards = [
  {
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 0,
    col: 0,
    size_x: 5,
    size_y: 4,
  },
  {
    card_id: ORDERS_BY_YEAR_QUESTION_ID,
    row: 0,
    col: 5,
    size_x: 5,
    size_y: 5,
  },
];

describe("dashboard card fetching", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should pass same dashboard_load_id to every query to enable metadata cache sharing", () => {
    createDashboardWithCards({ cards }).then(H.visitDashboard);

    cy.wait(["@dashcardQuery", "@dashcardQuery"]).then((interceptions) => {
      const query1 = interceptions[0].request.body;
      const query2 = interceptions[1].request.body;

      expect(query1.dashboard_load_id).to.have.length(36);
      expect(query2.dashboard_load_id).to.have.length(36);
      expect(query1.dashboard_load_id).to.equal(query2.dashboard_load_id);
    });
  });
});

function createDashboardWithCards({
  dashboardName = "test dashboard",
  cards = [],
} = {}) {
  return H.createDashboard({ name: dashboardName }).then(({ body: { id } }) => {
    H.updateDashboardCards({
      dashboard_id: id,
      cards,
    });

    cy.wrap(id).as("dashboardId");
  });
}

describe("issue 48878", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);

    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "/api/action").as("createAction");
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

    cy.intercept("GET", "/api/card/*").as("fetchCard");
    setup();
  });

  // I could only reproduce this issue in Cypress when I didn't use any helpers like createQuestion, etc.
  it("does not crash the action button viz (metabase#48878)", () => {
    cy.reload();
    cy.wait("@fetchCard");
    H.getDashboardCard(0).findByText("Click Me").should("be.visible");
  });

  function setup() {
    cy.log("create model");

    createModel({
      name: "SQL Model",
      query: "select * from orders limit 5",
    });

    cy.log("create model action");

    cy.findByTestId("qb-header-info-button").click();
    H.sidesheet().findByText("Actions").click();

    cy.findByTestId("model-actions-header").findByText("New action").click();

    H.modal().within(() => {
      H.NativeEditor.focus().type("UPDATE orders SET plan = {{ plan ", {
        parseSpecialCharSequences: false,
      });
      cy.button("Save").click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.modal()
      .last()
      .within(() => {
        cy.findByPlaceholderText("My new fantastic action").type("Test action");
        cy.button("Create").click();
        cy.wait("@createAction");
      });

    cy.visit("/");

    cy.log("create dashoard");

    cy.button("New").click();
    H.popover().findByText("Dashboard").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your dashboard?").type(
        "Dash",
      );
      cy.button("Create").click();
      cy.wait("@getDashboard");
    });

    cy.button("Add action").click();
    cy.button("Pick an action").click();
    H.modal().within(() => {
      cy.findByText("SQL Model").click();
      cy.findByText("Test action").click();
      cy.button("Done").click();
    });
    cy.button("Save").click();
    cy.wait("@updateDashboard");
    cy.wait("@fetchCard");
  }

  function createModel({ name, query }) {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    H.NativeEditor.focus().type(query);
    cy.findByTestId("native-query-editor-container")
      .findByTestId("run-button")
      .click();
    cy.wait("@dataset");
    cy.button("Save").click();

    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your model?").type(name);
      cy.button("Save").click();
      cy.wait("@saveQuestion");
    });
    cy.wait("@fetchCard");
  }
});

describe("issue 12578", () => {
  const ORDERS_QUESTION = {
    name: "Orders question",
    query: {
      "source-table": ORDERS_ID,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not fetch cards that are still loading when refreshing", () => {
    cy.clock(Date.now());
    H.createQuestionAndDashboard({ questionDetails: ORDERS_QUESTION }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    // Without tick the dashboard header will not load
    cy.tick();
    H.openDashboardMenu("Auto-refresh");
    H.popover().findByText("1 minute").click();

    // Mock slow card request
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", (req) => {
      req.on("response", (res) => {
        res.setDelay(99999);
      });
    }).as("dashcardQuery");
    cy.tick(61 * 1000);
    cy.tick(61 * 1000);

    cy.get("@dashcardQuery.all").should("have.length", 1);
  });
});

describe("issue 13736", () => {
  const questionDetails = {
    name: "Orders count",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should work even if some cards are broken (metabase#13736)", () => {
    H.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "failingQuestionId",
    });
    H.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "successfulQuestionId",
    });
    H.createDashboard({ name: "13736 Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      const dashboardId = this.dashboardId;
      const failingQuestionId = this.failingQuestionId;
      const successfulQuestionId = this.successfulQuestionId;

      cy.intercept(
        "POST",
        `/api/dashboard/*/dashcard/*/card/${failingQuestionId}/query`,
        {
          statusCode: 500,
          body: {
            cause: "some error",
            data: {},
            message: "some error",
          },
        },
      );

      H.updateDashboardCards({
        dashboard_id: dashboardId,
        cards: [
          {
            card_id: failingQuestionId,
          },
          {
            card_id: successfulQuestionId,
            col: 11,
          },
        ],
      });
      H.visitDashboard(dashboardId);
    });

    H.getDashboardCards()
      .eq(0)
      .findByText("There was a problem displaying this chart.");

    H.getDashboardCards().eq(1).findByText("18,760").should("be.visible");
  });
});

describe("issue 62170", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should only refresh card data, not reload entire dashboard when auto-refresh is enabled", () => {
    const REFRESH_PERIOD = 3;

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Orders Count",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.intercept("GET", `/api/dashboard/${dashboard_id}*`).as(
        "dashboardLoad",
      );
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "cardDataRefresh",
      );

      cy.visit(`/dashboard/${dashboard_id}#refresh=${REFRESH_PERIOD}`);
    });

    // Wait for initial dashboard load
    cy.wait("@dashboardLoad");
    cy.wait("@cardDataRefresh");

    // Verify dashboard is loaded
    H.getDashboardCard().within(() => {
      cy.findByText("Orders Count").should("be.visible");
    });

    // Verify card data was refreshed
    cy.wait("@cardDataRefresh");

    // Verify dashboard itself was NOT reloaded
    cy.get("@dashboardLoad.all").should("have.length", 1);
  });
});
