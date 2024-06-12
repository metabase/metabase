import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  appBar,
  clearFilterWidget,
  createNativeQuestion,
  createQuestion,
  dashboardParametersDoneButton,
  dashboardParameterSidebar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  queryBuilderHeader,
  queryBuilderMain,
  resetFilterWidgetToDefault,
  restore,
  saveDashboard,
  visitDashboard,
  visitEmbeddedPage,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const dashboardDetails = {
  name: "Test dashboard",
};

const singleBreakoutQuestionDetails = {
  name: "Single breakout",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

const multiBreakoutQuestionDetails = {
  name: "Multiple breakouts",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "temporal-unit": "year", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

const noBreakoutQuestionDetails = {
  name: "No breakouts",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    limit: 1,
  },
};

const multiStageQuestionDetails = {
  name: "Multiple stages",
  display: "table",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 2],
    aggregation: [["avg", ["field", "count", { "base-type": "type/Integer" }]]],
    breakout: [
      [
        "field",
        "CREATED_AT",
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
    ],
  },
};

const expressionBreakoutQuestionDetails = {
  name: "Breakout by expression",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    expressions: {
      Date: [
        "datetime-add",
        ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
        1,
        "day",
      ],
    },
    breakout: [["expression", "Date", { "base-type": "type/DateTime" }]],
  },
};

const binningBreakoutQuestionDetails = {
  name: "Breakout by a column with a binning strategy",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        { binning: { strategy: "num-bins", "num-bins": 100 } },
      ],
    ],
  },
};

const nativeQuestionDetails = {
  name: "SQL query",
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS",
  },
};

const nativeQuestionWithParameterDetails = {
  name: "SQL query with a parameter",
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS WHERE {{date}}",
    "template-tags": {
      date: {
        id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
        name: "date",
        "display-name": "Date",
        type: "dimension",
        dimension: ["field", ORDERS.CREATED_AT, null],
        "widget-type": "date/all-options",
      },
    },
  },
};

const parameterDetails = {
  id: "1",
  name: "Unit of Time",
  slug: "unit_of_time",
  type: "temporal-unit",
  sectionId: "temporal-unit",
};

const getParameterMapping = card => ({
  card_id: card.id,
  parameter_id: parameterDetails.id,
  target: [
    "dimension",
    [
      "field",
      ORDERS.CREATED_AT,
      {
        "base-type": "type/DateTime",
        "temporal-unit": "month",
      },
    ],
  ],
});

describe("scenarios > dashboard > temporal unit parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("mapping targets", () => {
    it("should connect a parameter to a question and drill thru", () => {
      createQuestion(noBreakoutQuestionDetails);
      createQuestion(singleBreakoutQuestionDetails);
      createQuestion(multiBreakoutQuestionDetails);
      createQuestion(multiStageQuestionDetails);
      createQuestion(expressionBreakoutQuestionDetails);
      createQuestion(binningBreakoutQuestionDetails);
      createNativeQuestion(nativeQuestionWithParameterDetails);
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        visitDashboard(dashboard.id),
      );
      editDashboard();
      addTemporalUnitParameter();

      cy.log("single breakout");
      addQuestion(singleBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At").click();
      saveDashboard();
      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      queryBuilderMain().findByText("Created At: Year").should("be.visible");
      backToDashboard();
      editDashboard();
      removeQuestion();

      cy.log("multiple breakouts");
      addQuestion(multiBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("Select…").click();
      popover()
        .findAllByText("Created At")
        .should("have.length", 2)
        .eq(0)
        .click();
      saveDashboard();
      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().within(() => {
        cy.findByText("Q2 2022").should("be.visible");
        cy.findByText(multiBreakoutQuestionDetails.name).click();
      });
      queryBuilderMain().findByText("Q2 2022").should("be.visible");
      backToDashboard();
      editDashboard();
      removeQuestion();

      cy.log("multiple stages");
      addQuestion(multiStageQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At: Month").click();
      saveDashboard();
      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Quarter").should("be.visible");
        cy.findByText(multiStageQuestionDetails.name).click();
      });
      queryBuilderMain().findByText("Created At: Quarter").should("be.visible");
      backToDashboard();
      editDashboard();
      removeQuestion();

      cy.log("no breakout");
      addQuestion(noBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("No valid fields").should("be.visible");
      dashboardParametersDoneButton().click();
      removeQuestion();

      cy.log("breakout by expression");
      addQuestion(expressionBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("No valid fields").should("be.visible");
      dashboardParametersDoneButton().click();
      removeQuestion();

      cy.log("breakout by a column with a binning strategy");
      addQuestion(binningBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("No valid fields").should("be.visible");
      dashboardParametersDoneButton().click();
      removeQuestion();

      cy.log("native query");
      addQuestion(nativeQuestionWithParameterDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard()
        .findByText(/Add a variable to this question/)
        .should("be.visible");
    });

    it("should connect a parameter to a model", () => {
      createQuestion({ ...singleBreakoutQuestionDetails, type: "model" });
      createNativeQuestion({ ...nativeQuestionDetails, type: "model" });
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        visitDashboard(dashboard.id),
      );
      editDashboard();
      addTemporalUnitParameter();

      cy.log("MBQL model");
      addQuestion(singleBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("No valid fields").should("be.visible");
      dashboardParametersDoneButton().click();
      removeQuestion();
    });

    it("should connect a parameter to a metric", () => {
      createQuestion({ ...singleBreakoutQuestionDetails, type: "metric" });
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        visitDashboard(dashboard.id),
      );
      editDashboard();
      addTemporalUnitParameter();

      addQuestion(singleBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At").click();
      saveDashboard();
      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      queryBuilderHeader()
        .findByText(`${singleBreakoutQuestionDetails.name} by Created At: Year`)
        .should("be.visible");
    });

    it("should connect multiple parameters to a card with multiple breakouts and drill thru", () => {
      createQuestion(multiBreakoutQuestionDetails);
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        visitDashboard(dashboard.id),
      );

      editDashboard();
      addQuestion(multiBreakoutQuestionDetails.name);
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().findAllByText("Created At").eq(0).click();
      addTemporalUnitParameter();
      getDashboardCard().findByText("Select…").click();
      popover().findAllByText("Created At").eq(1).click();
      saveDashboard();

      filterWidget().eq(0).click();
      popover().findByText("Year").click();
      filterWidget().eq(1).click();
      popover().findByText("Week").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText("April 24, 2022").should("be.visible");
        cy.findByText("May 1, 2022").should("be.visible");
        cy.findByText(multiBreakoutQuestionDetails.name).click();
      });
      appBar()
        .should("contain.text", "Started from")
        .should("contain.text", multiBreakoutQuestionDetails.name);
      queryBuilderMain().within(() => {
        cy.findByText("Product → Created At: Week").should("be.visible");
        cy.findByText("2022").should("be.visible");
        cy.findByText("2023").should("be.visible");
      });
    });

    it("should connect a parameter to multiple questions within a dashcard and drill thru", () => {
      createDashboardWithMultiSeriesCard().then(dashboard =>
        visitDashboard(dashboard.id),
      );

      editDashboard();
      addTemporalUnitParameter();
      getDashboardCard()
        .findAllByText("Select…")
        .should("have.length", 2)
        .eq(0)
        .click();
      popover().findByText("Created At").click();
      getDashboardCard().findByText("Select…").click();
      popover().findByText("Created At").click();
      saveDashboard();

      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().within(() => {
        cy.findByText("Q1 2023").should("be.visible");
        cy.findByText("Question 1").click();
      });
      appBar()
        .should("contain.text", "Started from")
        .should("contain.text", "Question 1");
      queryBuilderHeader()
        .findByText("Count by Created At: Quarter")
        .should("be.visible");
      backToDashboard();

      getDashboardCard().within(() => {
        cy.findByText("Q1 2023").should("be.visible");
        cy.findByText("Question 2").click();
      });
      appBar()
        .should("contain.text", "Started from")
        .should("contain.text", "Question 2");
      queryBuilderHeader()
        .findByText("Count by Created At: Quarter")
        .should("be.visible");
    });
  });

  describe("parameter settings", () => {
    it("should be able to set available temporal units", () => {
      createDashboardWithCard().then(dashboard => visitDashboard(dashboard.id));

      editDashboard();
      editParameter(parameterDetails.name);
      dashboardParameterSidebar().findByText("All").click();
      popover().within(() => {
        cy.findByLabelText("Select none").click();
        cy.findByLabelText("Month").click();
        cy.findByLabelText("Year").click();
        cy.findByLabelText("Minute").click();
      });
      saveDashboard();

      filterWidget().click();
      popover().within(() => {
        cy.findByText("Minute").should("not.exist");
        cy.findByText("Day").should("not.exist");
        cy.findByText("Month").should("be.visible");
        cy.findByText("Year").should("be.visible").click();
      });
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should clear the default value if it is no longer within the allowed unit list", () => {
      createDashboardWithCard().then(dashboard => visitDashboard(dashboard.id));

      cy.log("set the default value");
      editDashboard();
      editParameter(parameterDetails.name);
      dashboardParameterSidebar().findByText("No default").click();
      popover().findByText("Year").click();

      cy.log("exclude an unrelated temporal unit");
      dashboardParameterSidebar().findByText("All").click();
      popover().findByLabelText("Month").click();
      dashboardParameterSidebar().findByText("No default").should("not.exist");

      cy.log("exclude the temporal unit used for the default value");
      popover().findByLabelText("Year").click();
      dashboardParameterSidebar().findByText("No default").should("be.visible");
    });

    it("should be able to set the default value and make it required", () => {
      createDashboardWithCard().then(dashboard =>
        cy.wrap(dashboard.id).as("dashboardId"),
      );
      visitDashboard("@dashboardId");

      cy.log("set the default value");
      editDashboard();
      editParameter(parameterDetails.name);
      dashboardParameterSidebar().findByText("No default").click();
      popover().findByText("Year").click();
      saveDashboard();
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard().findByText("Created At: Year").should("be.visible");

      cy.log("clear the default value");
      clearFilterWidget();
      getDashboardCard().findByText("Created At: Month").should("be.visible");

      cy.log("reload the dashboard and check the default value is applied");
      visitDashboard("@dashboardId");
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard().findByText("Created At: Year").should("be.visible");

      cy.log("make the parameter required");
      editDashboard();
      editParameter(parameterDetails.name);
      dashboardParameterSidebar().findByText("Always require a value").click();
      saveDashboard();

      cy.log("change the parameter value and reset it to the default value");
      filterWidget().click();
      popover().findByText("Quarter").click();
      getDashboardCard().findByText("Created At: Quarter").should("be.visible");
      resetFilterWidgetToDefault();
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });
  });

  describe("query string parameters", () => {
    it("should be able to parse the parameter value from the url", () => {
      createDashboardWithCard().then(dashboard => {
        visitDashboard(dashboard.id, { params: { unit_of_time: "year" } });
      });
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });
  });

  describe("permissions", () => {
    it("should add a temporal unit parameter and connect it to a card and drill thru", () => {
      createDashboardWithCard().then(dashboard => {
        cy.signIn("nodata");
        visitDashboard(dashboard.id);
      });
      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      cy.findByTestId("TableInteractive-root")
        .findByText("Created At: Year")
        .should("be.visible");
    });
  });

  describe("embedding", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    });

    it("should be able to use temporal unit parameters in a public dashboard", () => {
      createDashboardWithCard().then(dashboard => {
        cy.request("POST", `/api/dashboard/${dashboard.id}/public_link`).then(
          ({ body: { uuid } }) => {
            cy.signOut();
            cy.visit(`/public/dashboard/${uuid}`);
          },
        );
      });

      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should be able to use temporal unit parameters in a embedded dashboard", () => {
      createDashboardWithCard({
        enable_embedding: true,
        embedding_params: {
          [parameterDetails.slug]: "enabled",
        },
      }).then(dashboard => {
        visitEmbeddedPage({
          resource: { dashboard: dashboard.id },
          params: {},
        });
      });

      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });
  });
});

function backToDashboard() {
  cy.findByLabelText(`Back to ${dashboardDetails.name}`).click();
}

function addTemporalUnitParameter() {
  cy.findByTestId("dashboard-header")
    .findByLabelText("Add a Unit of Time widget")
    .click();
}

function addQuestion(name) {
  cy.findByLabelText("Add questions").click();
  cy.findByTestId("add-card-sidebar").findByText(name).click();
}

function removeQuestion() {
  getDashboardCard().icon("close").click({ force: true });
}

function editParameter(name) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function createDashboardWithCard(dashboardDetails = {}) {
  return createQuestion(singleBreakoutQuestionDetails).then(
    ({ body: card }) => {
      return cy
        .createDashboard({
          ...dashboardDetails,
          parameters: [parameterDetails],
        })
        .then(({ body: dashboard }) => {
          return addOrUpdateDashboardCard({
            dashboard_id: dashboard.id,
            card_id: card.id,
            card: {
              parameter_mappings: [getParameterMapping(card)],
            },
          }).then(() => dashboard);
        });
    },
  );
}

function createDashboardWithMultiSeriesCard() {
  return cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    return createQuestion({
      ...singleBreakoutQuestionDetails,
      name: "Question 1",
      display: "line",
    }).then(({ body: card1 }) => {
      return createQuestion({
        ...singleBreakoutQuestionDetails,
        name: "Question 2",
        display: "line",
      }).then(({ body: card2 }) => {
        addOrUpdateDashboardCard({
          card_id: card1.id,
          dashboard_id: dashboard.id,
          card: {
            series: [
              {
                id: card2.id,
              },
            ],
          },
        }).then(() => dashboard);
      });
    });
  });
}
