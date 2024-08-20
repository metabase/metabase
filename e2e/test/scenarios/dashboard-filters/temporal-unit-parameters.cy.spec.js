import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  appBar,
  clearFilterWidget,
  createNativeQuestion,
  createQuestion,
  dashboardHeader,
  dashboardParametersDoneButton,
  dashboardParameterSidebar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  modal,
  popover,
  queryBuilderHeader,
  queryBuilderMain,
  resetFilterWidgetToDefault,
  restore,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  sidebar,
  undoToast,
  undoToastList,
  updateDashboardCards,
  visitDashboard,
  visitEmbeddedPage,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const dashboardDetails = {
  name: "Test Dashboard",
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

const nativeQuestionWithTextParameterDetails = {
  name: "SQL query with a text parameter",
  display: "table",
  native: {
    query: "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}}",
    "template-tags": {
      category: {
        id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
        name: "category",
        "display-name": "Category",
        type: "text",
      },
    },
  },
};

const nativeQuestionWithDateParameterDetails = {
  name: "SQL query with a date parameter",
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

const nativeUnitQuestionDetails = {
  name: "SQL units",
  display: "table",
  native: {
    query:
      "SELECT 'month' AS UNIT " +
      "UNION ALL SELECT 'year' AS UNIT " +
      "UNION ALL SELECT 'invalid' AS UNIT",
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
      createNativeQuestion(nativeQuestionWithDateParameterDetails);
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
      addQuestion(nativeQuestionWithDateParameterDetails.name);
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
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText("April 24, 2022").should("be.visible");
        cy.findByText("May 1, 2022").should("be.visible");
      });
    });

    it("should connect multiple parameters to the same column in a card and drill thru, with the last parameter taking priority", () => {
      createQuestion(singleBreakoutQuestionDetails);
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        visitDashboard(dashboard.id),
      );

      editDashboard();
      addQuestion(singleBreakoutQuestionDetails.name);
      addTemporalUnitParameter();
      selectDashboardFilter(getDashboardCard(), "Created At");
      addTemporalUnitParameter();
      selectDashboardFilter(getDashboardCard(), "Created At");
      saveDashboard();

      filterWidget().eq(0).click();
      popover().findByText("Quarter").click();
      filterWidget().eq(1).click();
      popover().findByText("Year").click();
      getDashboardCard().within(() => {
        // metabase#44684
        // should be "Created At: Year" and "2022" because the last parameter is "Year"
        cy.findByText("Created At: Quarter").should("be.visible");
        cy.findByText("Q2 2022").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      appBar()
        .should("contain.text", "Started from")
        .should("contain.text", singleBreakoutQuestionDetails.name);
      queryBuilderMain().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText("2022").should("be.visible");
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

  describe("click behaviors", () => {
    it("should pass a temporal unit with 'update dashboard filter' click behavior", () => {
      createDashboardWithMappedQuestion({
        extraQuestions: [nativeUnitQuestionDetails],
      }).then(dashboard => visitDashboard(dashboard.id));

      cy.log("unsupported column types are ignored");
      editDashboard();
      getDashboardCard(0)
        .findByLabelText("Click behavior")
        .click({ force: true });
      sidebar().within(() => {
        cy.log("datetime columns cannot be mapped");
        cy.findByText("Created At").click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByText("No available targets").should("be.visible");
        cy.icon("chevronleft").click();

        cy.log("number columns cannot be mapped");
        cy.findByText("Count").click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByText("No available targets").should("be.visible");
        cy.button("Cancel").click();
      });

      cy.log("setup a valid click behavior with a text column");
      getDashboardCard(1)
        .findByLabelText("Click behavior")
        .click({ force: true });
      sidebar().within(() => {
        cy.findByText("UNIT").click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByText(parameterDetails.name).click();
      });
      popover().findByText("UNIT").click();
      saveDashboard();

      cy.log("verify click behavior with a valid temporal unit");
      getDashboardCard(1).findByText("year").click();
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard(0).findByText("Created At: Year").should("be.visible");

      cy.log("verify that invalid temporal units are ignored");
      getDashboardCard(1).findByText("invalid").click();
      filterWidget()
        .findByText(/invalid/i)
        .should("not.exist");
      getDashboardCard(0).findByText("Created At: Month").should("be.visible");

      cy.log("verify that recovering from an invalid temporal unit works");
      getDashboardCard(1).findByText("year").click();
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard(0).findByText("Created At: Year").should("be.visible");
    });

    it("should pass a temporal unit 'custom destination -> dashboard' click behavior", () => {
      createDashboardWithMappedQuestion({
        dashboardDetails: {
          name: "Target dashboard",
        },
      });
      cy.createDashboardWithQuestions({
        dashboardDetails: {
          name: "Source dashboard",
        },
        questions: [nativeUnitQuestionDetails],
      }).then(({ dashboard }) => cy.wrap(dashboard.id).as("sourceDashboardId"));
      visitDashboard("@sourceDashboardId");

      cy.log("setup click behavior");
      editDashboard();
      getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      sidebar().within(() => {
        cy.findByText("UNIT").click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      modal().findByText("Target dashboard").click();
      sidebar().findByText(parameterDetails.name).click();
      popover().findByText("UNIT").click();
      saveDashboard();

      cy.log("verify that invalid temporal units are ignored");
      getDashboardCard().findByText("invalid").click();
      dashboardHeader().findByText("Target dashboard").should("be.visible");
      filterWidget()
        .findByText(/invalid/i)
        .should("not.exist");
      getDashboardCard().findByText("Created At: Month").should("be.visible");

      cy.log("verify click behavior with a valid temporal unit");
      visitDashboard("@sourceDashboardId");
      getDashboardCard().findByText("year").click();
      dashboardHeader().findByText("Target dashboard").should("be.visible");
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should pass a temporal unit with 'custom destination -> url' click behavior", () => {
      createDashboardWithMappedQuestion({
        dashboardDetails: {
          name: "Target dashboard",
        },
      }).then(dashboard => cy.wrap(dashboard.id).as("targetDashboardId"));
      cy.createDashboardWithQuestions({
        dashboardDetails: {
          name: "Source dashboard",
        },
        questions: [nativeUnitQuestionDetails],
      }).then(({ dashboard }) => cy.wrap(dashboard.id).as("sourceDashboardId"));
      visitDashboard("@sourceDashboardId");

      cy.log("setup click behavior");
      editDashboard();
      getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      sidebar().within(() => {
        cy.findByText("UNIT").click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("URL").click();
      });
      modal().findByText("Values you can reference").click();
      popover().within(() => {
        cy.findByText("UNIT").should("be.visible");
        cy.findByText(parameterDetails.name).should("not.exist");
      });
      cy.get("@targetDashboardId").then(targetDashboardId => {
        modal().within(() => {
          cy.findByPlaceholderText("e.g. http://acme.com/id/{{user_id}}").type(
            `http://localhost:4000/dashboard/${targetDashboardId}?${parameterDetails.slug}={{UNIT}}`,
            { parseSpecialCharSequences: false },
          );
          cy.button("Done").click();
        });
      });
      saveDashboard();

      cy.log("verify click behavior with a temporal valid unit");
      getDashboardCard().findByText("year").click();
      dashboardHeader().findByText("Target dashboard").should("be.visible");
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard().findByText("Created At: Year").should("be.visible");

      cy.log("verify that invalid temporal units are ignored");
      visitDashboard("@sourceDashboardId");
      getDashboardCard().findByText("invalid").click();
      dashboardHeader().findByText("Target dashboard").should("be.visible");
      filterWidget()
        .findByText(/invalid/i)
        .should("not.exist");
      getDashboardCard().findByText("Created At: Month").should("be.visible");
    });

    it("should not allow to use temporal unit parameter values with SQL queries", () => {
      createNativeQuestion(nativeQuestionWithTextParameterDetails);
      createDashboardWithMappedQuestion().then(dashboard =>
        visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior only with a temporal unit parameter");
      editDashboard();
      getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      sidebar().within(() => {
        cy.findByText("Count").click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      modal().findByText(nativeQuestionWithTextParameterDetails.name).click();
      sidebar().findByText("No available targets").should("be.visible");

      cy.log("setup click behavior with a text parameter");
      setFilter("Text or Category");
      dashboardParametersDoneButton().click();
      getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      sidebar().within(() => {
        cy.findByText(/Count goes to/).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Category").click();
      });
      popover().within(() => {
        cy.findByText("Text").should("be.visible");
        cy.findByText(parameterDetails.name).should("not.exist");
      });
    });
  });

  describe("auto-wiring", () => {
    it("should not auto-wire to cards without breakout columns", () => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [noBreakoutQuestionDetails, singleBreakoutQuestionDetails],
      }).then(({ dashboard }) => visitDashboard(dashboard.id));
      editDashboard();
      addTemporalUnitParameter();

      cy.log("new mapping");
      selectDashboardFilter(getDashboardCard(1), "Created At");
      undoToast().should("not.exist");

      cy.log("new card");
      addQuestion(noBreakoutQuestionDetails.name);
      undoToast().should("not.exist");
    });

    it("should auto-wire to cards with breakouts on column selection", () => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [
          noBreakoutQuestionDetails,
          singleBreakoutQuestionDetails,
          multiBreakoutQuestionDetails,
        ],
      }).then(({ dashboard }) => visitDashboard(dashboard.id));
      editDashboard();
      addTemporalUnitParameter();

      selectDashboardFilter(getDashboardCard(1), "Created At");
      undoToast().button("Auto-connect").click();
      saveDashboard();

      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard(1).findByText("Created At: Year").should("exist");
      getDashboardCard(2).findByText("Created At: Year").should("exist");
    });

    it("should auto-wire to cards with breakouts after a new card is added", () => {
      createQuestion(multiBreakoutQuestionDetails);
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [noBreakoutQuestionDetails, singleBreakoutQuestionDetails],
      }).then(({ dashboard }) => visitDashboard(dashboard.id));
      editDashboard();
      addTemporalUnitParameter();

      selectDashboardFilter(getDashboardCard(1), "Created At");
      undoToast().should("not.exist");
      addQuestion(multiBreakoutQuestionDetails.name);
      undoToast().button("Auto-connect").click();
      saveDashboard();

      filterWidget().click();
      popover().findByText("Year").click();
      getDashboardCard(1).findByText("Created At: Year").should("exist");
      getDashboardCard(2).findByText("Created At: Year").should("exist");
    });

    it("should not overwrite parameter mappings for a card when doing auto-wiring", () => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [
          noBreakoutQuestionDetails,
          singleBreakoutQuestionDetails,
          multiBreakoutQuestionDetails,
        ],
      }).then(({ dashboard }) => visitDashboard(dashboard.id));
      getDashboardCard(1).within(() => {
        cy.findByText("199").should("not.exist");
      });
      editDashboard();

      cy.log("add a regular parameter");
      setFilter("Text or Category", "Is");
      selectDashboardFilter(getDashboardCard(0), "Category");
      undoToast().button("Auto-connect").click();

      cy.log("add a temporal unit parameter");
      addTemporalUnitParameter();
      selectDashboardFilter(getDashboardCard(1), "Created At");
      undoToastList().last().button("Auto-connect").click();
      saveDashboard();

      cy.log("verify data with 2 parameters");
      filterWidget().eq(0).click();
      popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });
      filterWidget().eq(1).click();
      popover().findByText("Year").click();
      getDashboardCard(1).within(() => {
        cy.findByText("199").should("exist"); // sample filtered data
        cy.findByText("Created At: Year").should("be.visible");
      });

      cy.log("verify data without the first parameter");
      filterWidget().eq(0).icon("close").click();
      getDashboardCard(1).within(() => {
        cy.findByText("199").should("not.exist"); // sample filtered data
        cy.findByText("Created At: Year").should("be.visible");
      });
    });
  });

  describe("parameter settings", () => {
    it("should be able to set available temporal units", () => {
      createDashboardWithMappedQuestion().then(dashboard =>
        visitDashboard(dashboard.id),
      );

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
      createDashboardWithMappedQuestion().then(dashboard =>
        visitDashboard(dashboard.id),
      );

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
      createDashboardWithMappedQuestion().then(dashboard =>
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
      createDashboardWithMappedQuestion().then(dashboard => {
        visitDashboard(dashboard.id, { params: { unit_of_time: "year" } });
      });
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should ignore invalid temporal unit values from the url", () => {
      createDashboardWithMappedQuestion().then(dashboard => {
        visitDashboard(dashboard.id, { params: { unit_of_time: "invalid" } });
      });
      filterWidget().within(() => {
        cy.findByText(parameterDetails.name).should("be.visible");
        cy.findByText(/invalid/i).should("not.exist");
      });
      getDashboardCard().findByText("Created At: Month").should("be.visible");
    });

    it("should accept temporal units outside of the allowlist if they are otherwise valid values from the url", () => {
      createDashboardWithMappedQuestion({
        dashboardDetails: {
          parameters: [
            {
              ...parameterDetails,
              temporal_units: ["month", "quarter"],
            },
          ],
        },
      }).then(dashboard => {
        visitDashboard(dashboard.id, { params: { unit_of_time: "year" } });
      });
      filterWidget().findByText("Year").should("be.visible");
      getDashboardCard().findByText("Created At: Year").should("be.visible");
    });
  });

  describe("permissions", () => {
    it("should add a temporal unit parameter and connect it to a card and drill thru", () => {
      createDashboardWithMappedQuestion().then(dashboard => {
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
      createDashboardWithMappedQuestion().then(dashboard => {
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
      createDashboardWithMappedQuestion({
        dashboardDetails: {
          enable_embedding: true,
          embedding_params: {
            [parameterDetails.slug]: "enabled",
          },
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
  cy.findByTestId("dashboard-header").icon("add").click();
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

function createDashboardWithMappedQuestion({
  dashboardDetails = {},
  extraQuestions = [],
} = {}) {
  return cy
    .createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [parameterDetails],
        ...dashboardDetails,
      },
      questions: [singleBreakoutQuestionDetails, ...extraQuestions],
    })
    .then(({ dashboard, questions: [card, ...extraCards] }) => {
      return updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: [getParameterMapping(card)],
          },
          ...extraCards.map(({ id }) => ({ card_id: id })),
        ],
      }).then(() => dashboard);
    });
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
        updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: card1.id,
              series: [
                {
                  id: card2.id,
                },
              ],
            },
          ],
        }).then(() => dashboard);
      });
    });
  });
}
