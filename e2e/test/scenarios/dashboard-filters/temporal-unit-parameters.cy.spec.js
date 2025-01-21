import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    breakout: [
      [
        "expression",
        "Date",
        { "base-type": "type/DateTime", "temporal-unit": "day" },
      ],
    ],
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

const nativeTimeQuestionDetails = {
  name: "SQL time",
  display: "table",
  native: {
    query: "SELECT CAST('10:00' AS TIME) AS TIME",
  },
};

const getNativeTimeQuestionBasedQuestionDetails = card => ({
  query: {
    "source-table": `card__${card.id}`,
    aggregation: [["count"]],
    breakout: [["field", "TIME", { "base-type": "type/Time" }]],
  },
});

const parameterDetails = {
  id: "1",
  name: "Time grouping",
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
    cy.restore();
    cy.signInAsNormalUser();
  });

  describe("mapping targets", () => {
    it("should connect a parameter to a question and drill thru", () => {
      cy.createQuestion(noBreakoutQuestionDetails);
      cy.createQuestion(singleBreakoutQuestionDetails);
      cy.createQuestion(multiBreakoutQuestionDetails);
      cy.createQuestion(multiStageQuestionDetails);
      cy.createQuestion(expressionBreakoutQuestionDetails);
      cy.createQuestion(binningBreakoutQuestionDetails);
      cy.createNativeQuestion(nativeQuestionWithDateParameterDetails);
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        cy.visitDashboard(dashboard.id),
      );
      cy.editDashboard();
      addTemporalUnitParameter();

      cy.log("single breakout");
      addQuestion(singleBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findByText("Created At").click();
      cy.saveDashboard();
      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      cy.tableInteractive().findByText("Created At: Year").should("be.visible");
      backToDashboard();
      cy.editDashboard();
      removeQuestion();

      cy.log("multiple breakouts");
      addQuestion(multiBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover()
        .findAllByText("Created At")
        .should("have.length", 2)
        .eq(0)
        .click();
      cy.saveDashboard();
      cy.filterWidget().click();
      cy.popover().findByText("Quarter").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Q2 2022").should("be.visible");
        cy.findByText(multiBreakoutQuestionDetails.name).click();
      });
      cy.tableInteractive()
        .findByText("Created At: Quarter")
        .should("be.visible");
      backToDashboard();
      cy.editDashboard();
      removeQuestion();

      cy.log("multiple stages");
      addQuestion(multiStageQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findByText("Created At: Month").click();
      cy.saveDashboard();
      cy.filterWidget().click();
      cy.popover().findByText("Quarter").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Created At: Month: Quarter").should("be.visible");
        cy.findByText(multiStageQuestionDetails.name).click();
      });
      cy.tableInteractive()
        .findByText("Created At: Month: Quarter")
        .should("be.visible");
      backToDashboard();
      cy.editDashboard();
      removeQuestion();

      cy.log("no breakout");
      addQuestion(noBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("No valid fields").should("be.visible");
      cy.dashboardParametersDoneButton().click();
      removeQuestion();

      cy.log("breakout by expression");
      addQuestion(expressionBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findByText("Date").click();
      cy.saveDashboard();
      cy.filterWidget().click();
      cy.popover().findByText("Quarter").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Date: Quarter").should("be.visible");
        cy.findByText(expressionBreakoutQuestionDetails.name).click();
      });
      cy.tableInteractive().findByText("Date: Quarter").should("be.visible");
      backToDashboard();
      cy.editDashboard();
      removeQuestion();

      cy.log("breakout by a column with a binning strategy");
      addQuestion(binningBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("No valid fields").should("be.visible");
      cy.dashboardParametersDoneButton().click();
      removeQuestion();

      cy.log("native query");
      addQuestion(nativeQuestionWithDateParameterDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard()
        .findByText(/Add a variable to this question/)
        .should("be.visible");
    });

    it("should connect a parameter to a model", () => {
      cy.createQuestion({ ...singleBreakoutQuestionDetails, type: "model" });
      cy.createNativeQuestion({ ...nativeQuestionDetails, type: "model" });
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        cy.visitDashboard(dashboard.id),
      );
      cy.editDashboard();
      addTemporalUnitParameter();

      cy.log("MBQL model");
      addQuestion(singleBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("No valid fields").should("be.visible");
      cy.dashboardParametersDoneButton().click();
      removeQuestion();
    });

    it("should connect a parameter to a metric", () => {
      cy.createQuestion({ ...singleBreakoutQuestionDetails, type: "metric" });
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        cy.visitDashboard(dashboard.id),
      );
      cy.editDashboard();
      addTemporalUnitParameter();

      addQuestion(singleBreakoutQuestionDetails.name);
      editParameter(parameterDetails.name);
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findByText("Created At").click();
      cy.saveDashboard();
      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      cy.queryBuilderHeader()
        .findByText(`${singleBreakoutQuestionDetails.name} by Created At: Year`)
        .should("be.visible");
    });

    it("should connect multiple parameters to a card with multiple breakouts and drill thru", () => {
      cy.createQuestion(multiBreakoutQuestionDetails);
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        cy.visitDashboard(dashboard.id),
      );

      cy.editDashboard();
      addQuestion(multiBreakoutQuestionDetails.name);
      addTemporalUnitParameter();
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findAllByText("Created At").eq(0).click();
      addTemporalUnitParameter();
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findAllByText("Created At").eq(1).click();
      cy.saveDashboard();

      cy.filterWidget().eq(0).click();
      cy.popover().findByText("Year").click();
      cy.filterWidget().eq(1).click();
      cy.popover().findByText("Week").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText("April 24, 2022").should("be.visible");
        cy.findByText("May 1, 2022").should("be.visible");
        cy.findByText(multiBreakoutQuestionDetails.name).click();
      });
      cy.appBar()
        .should("contain.text", "Started from")
        .should("contain.text", multiBreakoutQuestionDetails.name);
      cy.tableInteractive().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText("Product → Created At: Week").should("be.visible");
      });
    });

    it("should connect multiple parameters to the same column in a card and drill thru, with the last parameter taking priority", () => {
      cy.createQuestion(singleBreakoutQuestionDetails);
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) =>
        cy.visitDashboard(dashboard.id),
      );

      cy.editDashboard();
      addQuestion(singleBreakoutQuestionDetails.name);
      addTemporalUnitParameter();
      cy.selectDashboardFilter(cy.getDashboardCard(), "Created At");
      addTemporalUnitParameter();
      cy.selectDashboardFilter(cy.getDashboardCard(), "Created At");
      cy.saveDashboard();

      cy.filterWidget().eq(0).click();
      cy.popover().findByText("Quarter").click();
      cy.filterWidget().eq(1).click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().within(() => {
        // metabase#44684
        // should be "Created At: Year" and "2022" because the last parameter is "Year"
        cy.findByText("Created At: Quarter").should("be.visible");
        cy.findByText("Q2 2022").should("be.visible");
        cy.findByText(singleBreakoutQuestionDetails.name).click();
      });
      cy.appBar()
        .should("contain.text", "Started from")
        .should("contain.text", singleBreakoutQuestionDetails.name);
      cy.tableInteractive().within(() => {
        cy.findByText("Created At: Year").should("be.visible");
        cy.findByText("2022").should("be.visible");
      });
    });

    it("should connect a parameter to multiple questions within a dashcard and drill thru", () => {
      createDashboardWithMultiSeriesCard().then(dashboard =>
        cy.visitDashboard(dashboard.id),
      );

      cy.editDashboard();
      addTemporalUnitParameter();
      cy.getDashboardCard()
        .findAllByText("Select…")
        .should("have.length", 2)
        .eq(0)
        .click();
      cy.popover().findByText("Created At").click();
      cy.getDashboardCard().findByText("Select…").click();
      cy.popover().findByText("Created At").click();
      cy.saveDashboard();

      cy.filterWidget().click();
      cy.popover().findByText("Quarter").click();
      cy.getDashboardCard().within(() => {
        cy.findByText("Q1 2023").should("be.visible");
        cy.findByText("Question 1").click();
      });
      cy.appBar()
        .should("contain.text", "Started from")
        .should("contain.text", "Question 1");
      cy.queryBuilderHeader()
        .findByText("Count by Created At: Quarter")
        .should("be.visible");
      backToDashboard();

      cy.getDashboardCard().within(() => {
        cy.findByText("Q1 2023").should("be.visible");
        cy.findByText("Question 2").click();
      });
      cy.appBar()
        .should("contain.text", "Started from")
        .should("contain.text", "Question 2");
      cy.queryBuilderHeader()
        .findByText("Count by Created At: Quarter")
        .should("be.visible");
    });
  });

  describe("click behaviors", () => {
    it("should pass a temporal unit with 'update dashboard filter' click behavior", () => {
      createDashboardWithMappedQuestion({
        extraQuestions: [nativeUnitQuestionDetails],
      }).then(dashboard => {
        cy.wrap(dashboard.id).as("dashboardId");
        cy.visitDashboard(dashboard.id);
      });

      cy.log("unsupported column types are ignored");
      cy.editDashboard();
      cy.getDashboardCard(0)
        .findByLabelText("Click behavior")
        .click({ force: true });
      cy.sidebar().within(() => {
        cy.log("datetime columns cannot be mapped");
        cy.findByText("Created At: Month").click();
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
      cy.getDashboardCard(1)
        .findByLabelText("Click behavior")
        .click({ force: true });
      cy.sidebar().within(() => {
        cy.findByText("UNIT").click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByText(parameterDetails.name).click();
      });
      cy.popover().findByText("UNIT").click();
      cy.saveDashboard();

      cy.log("verify click behavior with a valid temporal unit");

      // this is done to bypass race condition problem, the root cause for it is
      // described in `updateDashboardAndCards` from frontend/src/metabase/dashboard/actions/save.js
      cy.visitDashboard("@dashboardId");

      cy.getDashboardCard(1).findByText("year").click();

      cy.getDashboardCard(0)
        .findByText("Created At: Year", { timeout: 10000 })
        .should("be.visible");

      cy.filterWidget().findByText("Year").should("be.visible");

      cy.log("verify that invalid temporal units are ignored");
      cy.getDashboardCard(1).findByText("invalid").click();
      cy.filterWidget()
        .findByText(/invalid/i)
        .should("not.exist");
      cy.getDashboardCard(0)
        .findByText("Created At: Month")
        .should("be.visible");

      cy.log("verify that recovering from an invalid temporal unit works");
      cy.getDashboardCard(1).findByText("year").click();
      cy.filterWidget().findByText("Year").should("be.visible");
      cy.getDashboardCard(0)
        .findByText("Created At: Year")
        .should("be.visible");
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
      cy.visitDashboard("@sourceDashboardId");

      cy.log("setup click behavior");
      cy.editDashboard();
      cy.getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      cy.sidebar().within(() => {
        cy.findByText("UNIT").click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      cy.modal().findByText("Target dashboard").click();
      cy.sidebar().findByText(parameterDetails.name).click();
      cy.popover().findByText("UNIT").click();
      cy.saveDashboard();

      cy.log("verify that invalid temporal units are ignored");
      cy.getDashboardCard().findByText("invalid").click();
      cy.dashboardHeader().findByText("Target dashboard").should("be.visible");
      cy.filterWidget()
        .findByText(/invalid/i)
        .should("not.exist");
      cy.getDashboardCard()
        .findByText("Created At: Month")
        .should("be.visible");

      cy.log("verify click behavior with a valid temporal unit");
      cy.visitDashboard("@sourceDashboardId");
      cy.getDashboardCard().findByText("year").click();
      cy.dashboardHeader().findByText("Target dashboard").should("be.visible");
      cy.filterWidget().findByText("Year").should("be.visible");
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
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
      cy.visitDashboard("@sourceDashboardId");

      cy.log("setup click behavior");
      cy.editDashboard();
      cy.getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      cy.sidebar().within(() => {
        cy.findByText("UNIT").click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("URL").click();
      });
      cy.modal().findByText("Values you can reference").click();
      cy.popover().within(() => {
        cy.findByText("UNIT").should("be.visible");
        cy.findByText(parameterDetails.name).should("not.exist");
      });
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.modal().within(() => {
          cy.findByPlaceholderText("e.g. http://acme.com/id/{{user_id}}").type(
            `http://localhost:4000/dashboard/${targetDashboardId}?${parameterDetails.slug}={{UNIT}}`,
            { parseSpecialCharSequences: false },
          );
          cy.button("Done").click();
        });
      });
      cy.saveDashboard();

      cy.log("verify click behavior with a temporal valid unit");
      cy.getDashboardCard().findByText("year").click();
      cy.dashboardHeader().findByText("Target dashboard").should("be.visible");
      cy.filterWidget().findByText("Year").should("be.visible");
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");

      cy.log("verify that invalid temporal units are ignored");
      cy.visitDashboard("@sourceDashboardId");
      cy.getDashboardCard().findByText("invalid").click();
      cy.dashboardHeader().findByText("Target dashboard").should("be.visible");
      cy.filterWidget()
        .findByText(/invalid/i)
        .should("not.exist");
      cy.getDashboardCard()
        .findByText("Created At: Month")
        .should("be.visible");
    });

    it("should not allow to use temporal unit parameter values with SQL queries", () => {
      cy.createNativeQuestion(nativeQuestionWithTextParameterDetails);
      createDashboardWithMappedQuestion().then(dashboard =>
        cy.visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior only with a temporal unit parameter");
      cy.editDashboard();
      cy.getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      cy.sidebar().within(() => {
        cy.findByText("Count").click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      cy.modal()
        .findByText(nativeQuestionWithTextParameterDetails.name)
        .click();
      cy.sidebar().findByText("No available targets").should("be.visible");

      cy.log("setup click behavior with a text parameter");
      cy.setFilter("Text or Category");
      cy.dashboardParametersDoneButton().click();
      cy.getDashboardCard()
        .findByLabelText("Click behavior")
        .click({ force: true });
      cy.sidebar().within(() => {
        cy.findByText(/Count goes to/).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Category").click();
      });
      cy.popover().within(() => {
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
      }).then(({ dashboard }) => cy.visitDashboard(dashboard.id));
      cy.editDashboard();
      addTemporalUnitParameter();

      cy.log("new mapping");
      cy.selectDashboardFilter(cy.getDashboardCard(1), "Created At");
      cy.undoToast().should("not.exist");

      cy.log("new card");
      addQuestion(noBreakoutQuestionDetails.name);
      cy.undoToast().should("not.exist");
    });

    it("should auto-wire to cards with breakouts on column selection", () => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [
          noBreakoutQuestionDetails,
          singleBreakoutQuestionDetails,
          multiBreakoutQuestionDetails,
        ],
      }).then(({ dashboard }) => cy.visitDashboard(dashboard.id));
      cy.editDashboard();
      addTemporalUnitParameter();

      cy.selectDashboardFilter(cy.getDashboardCard(1), "Created At");
      cy.undoToast().button("Auto-connect").click();
      cy.saveDashboard();

      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard(1).findByText("Created At: Year").should("exist");
      cy.getDashboardCard(2).findByText("Created At: Year").should("exist");
    });

    it("should auto-wire to cards with breakouts after a new card is added", () => {
      cy.createQuestion(multiBreakoutQuestionDetails);
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [noBreakoutQuestionDetails, singleBreakoutQuestionDetails],
      }).then(({ dashboard }) => cy.visitDashboard(dashboard.id));
      cy.editDashboard();
      addTemporalUnitParameter();

      cy.selectDashboardFilter(cy.getDashboardCard(1), "Created At");
      cy.undoToast().should("not.exist");
      addQuestion(multiBreakoutQuestionDetails.name);
      cy.undoToast().button("Auto-connect").click();
      cy.saveDashboard();

      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard(1).findByText("Created At: Year").should("exist");
      cy.getDashboardCard(2).findByText("Created At: Year").should("exist");
    });

    it("should not overwrite parameter mappings for a card when doing auto-wiring", () => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [
          noBreakoutQuestionDetails,
          singleBreakoutQuestionDetails,
          multiBreakoutQuestionDetails,
        ],
      }).then(({ dashboard }) => cy.visitDashboard(dashboard.id));
      cy.getDashboardCard(1).within(() => {
        cy.findByText("199").should("not.exist");
      });
      cy.editDashboard();

      cy.log("add a regular parameter");
      cy.setFilter("Text or Category", "Is");
      cy.selectDashboardFilter(cy.getDashboardCard(0), "Category");
      cy.undoToast().button("Auto-connect").click();

      cy.log("add a temporal unit parameter");
      addTemporalUnitParameter();
      cy.selectDashboardFilter(cy.getDashboardCard(1), "Created At");
      cy.undoToastList().last().button("Auto-connect").click();
      cy.saveDashboard();

      cy.log("verify data with 2 parameters");
      cy.filterWidget().eq(0).click();
      cy.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });
      cy.filterWidget().eq(1).click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard(1).within(() => {
        cy.findByText("199").should("exist"); // sample filtered data
        cy.findByText("Created At: Year").should("be.visible");
      });

      cy.log("verify data without the first parameter");
      cy.filterWidget().eq(0).icon("close").click();
      cy.getDashboardCard(1).within(() => {
        cy.findByText("199").should("not.exist"); // sample filtered data
        cy.findByText("Created At: Year").should("be.visible");
      });
    });
  });

  describe("parameter settings", () => {
    it("should be able to set available temporal units", () => {
      createDashboardWithMappedQuestion().then(dashboard =>
        cy.visitDashboard(dashboard.id),
      );

      cy.editDashboard();
      editParameter(parameterDetails.name);
      cy.dashboardParameterSidebar().findByText("All").click();
      cy.popover().within(() => {
        cy.findByLabelText("Select none").click();
        cy.findByLabelText("Month").click();
        cy.findByLabelText("Year").click();
        cy.findByLabelText("Minute").click();
      });
      cy.dashboardParametersDoneButton().click();
      cy.saveDashboard();

      cy.filterWidget().click();
      cy.popover().within(() => {
        cy.findByText("Minute").should("not.exist");
        cy.findByText("Day").should("not.exist");
        cy.findByText("Month").should("be.visible");
        cy.findByText("Year").should("be.visible").click();
      });
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should clear the default value if it is no longer within the allowed unit list", () => {
      createDashboardWithMappedQuestion().then(dashboard =>
        cy.visitDashboard(dashboard.id),
      );

      cy.log("set the default value");
      cy.editDashboard();
      editParameter(parameterDetails.name);
      cy.dashboardParameterSidebar().findByText("No default").click();
      cy.popover().findByText("Year").click();

      cy.log("exclude an unrelated temporal unit");
      cy.dashboardParameterSidebar().findByText("All").click();
      cy.popover().findByLabelText("Month").click();
      cy.dashboardParameterSidebar()
        .findByText("No default")
        .should("not.exist");

      cy.log("exclude the temporal unit used for the default value");
      cy.popover().findByLabelText("Year").click();
      cy.dashboardParameterSidebar()
        .findByText("No default")
        .should("be.visible");
    });

    it("should be able to set the default value and make it required", () => {
      createDashboardWithMappedQuestion().then(dashboard =>
        cy.wrap(dashboard.id).as("dashboardId"),
      );
      cy.visitDashboard("@dashboardId");

      cy.log("set the default value");
      cy.editDashboard();
      editParameter(parameterDetails.name);
      cy.dashboardParameterSidebar().findByText("No default").click();
      cy.popover().findByText("Year").click();
      cy.saveDashboard();
      cy.filterWidget().findByText("Year").should("be.visible");
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");

      cy.log("clear the default value");
      cy.clearFilterWidget();
      cy.getDashboardCard()
        .findByText("Created At: Month")
        .should("be.visible");

      cy.log("reload the dashboard and check the default value is applied");
      cy.visitDashboard("@dashboardId");
      cy.filterWidget().findByText("Year").should("be.visible");
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");

      cy.log("make the parameter required");
      cy.editDashboard();
      editParameter(parameterDetails.name);
      cy.dashboardParameterSidebar()
        .findByText("Always require a value")
        .click();
      cy.saveDashboard();

      cy.log("change the parameter value and reset it to the default value");
      cy.filterWidget().click();
      cy.popover().findByText("Quarter").click();
      cy.getDashboardCard()
        .findByText("Created At: Quarter")
        .should("be.visible");
      cy.resetFilterWidgetToDefault();
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should show an error message when an incompatible temporal unit is used", () => {
      cy.log("setup dashboard with a time column");
      cy.createNativeQuestion(nativeTimeQuestionDetails).then(
        ({ body: card }) => {
          cy.createDashboardWithQuestions({
            questions: [getNativeTimeQuestionBasedQuestionDetails(card)],
          }).then(({ dashboard }) => {
            cy.visitDashboard(dashboard.id);
          });
        },
      );
      cy.editDashboard();
      addTemporalUnitParameter();
      cy.selectDashboardFilter(cy.getDashboardCard(), "TIME");
      cy.saveDashboard();

      cy.log("use an invalid temporal unit");
      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().should(
        "contain.text",
        "This chart can not be broken out by the selected unit of time: year.",
      );

      cy.log("use an valid temporal unit");
      cy.filterWidget().click();
      cy.popover().findByText("Minute").click();
      cy.getDashboardCard().findByText("TIME: Minute").should("be.visible");
    });
  });

  describe("query string parameters", () => {
    it("should be able to parse the parameter value from the url", () => {
      createDashboardWithMappedQuestion().then(dashboard => {
        cy.visitDashboard(dashboard.id, { params: { unit_of_time: "year" } });
      });
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
    });

    it("should ignore invalid temporal unit values from the url", () => {
      createDashboardWithMappedQuestion().then(dashboard => {
        cy.visitDashboard(dashboard.id, {
          params: { unit_of_time: "invalid" },
        });
      });
      cy.filterWidget().within(() => {
        cy.findByText(parameterDetails.name).should("be.visible");
        cy.findByText(/invalid/i).should("not.exist");
      });
      cy.getDashboardCard()
        .findByText("Created At: Month")
        .should("be.visible");
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
        cy.visitDashboard(dashboard.id, { params: { unit_of_time: "year" } });
      });
      cy.filterWidget().findByText("Year").should("be.visible");
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
    });
  });

  describe("permissions", () => {
    it("should add a temporal unit parameter and connect it to a card and drill thru", () => {
      createDashboardWithMappedQuestion().then(dashboard => {
        cy.signIn("nodata");
        cy.visitDashboard(dashboard.id);
      });
      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().within(() => {
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
      cy.updateSetting("enable-public-sharing", true);
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

      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
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
        cy.visitEmbeddedPage({
          resource: { dashboard: dashboard.id },
          params: {},
        });
      });

      cy.filterWidget().click();
      cy.popover().findByText("Year").click();
      cy.getDashboardCard().findByText("Created At: Year").should("be.visible");
    });
  });
});

function backToDashboard() {
  cy.findByLabelText(`Back to ${dashboardDetails.name}`).click();
}

function addTemporalUnitParameter() {
  cy.setFilter("Time grouping");
}

function addQuestion(name) {
  cy.findByTestId("dashboard-header").icon("add").click();
  cy.findByTestId("add-card-sidebar").findByText(name).click();
}

function removeQuestion() {
  cy.getDashboardCard().icon("close").click({ force: true });
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
      return cy
        .updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: card.id,
              parameter_mappings: [getParameterMapping(card)],
            },
            ...extraCards.map(({ id }) => ({ card_id: id })),
          ],
        })
        .then(() => dashboard);
    });
}

function createDashboardWithMultiSeriesCard() {
  return cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    return cy
      .createQuestion({
        ...singleBreakoutQuestionDetails,
        name: "Question 1",
        display: "line",
      })
      .then(({ body: card1 }) => {
        return cy
          .createQuestion({
            ...singleBreakoutQuestionDetails,
            name: "Question 2",
            display: "line",
          })
          .then(({ body: card2 }) => {
            cy.updateDashboardCards({
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
