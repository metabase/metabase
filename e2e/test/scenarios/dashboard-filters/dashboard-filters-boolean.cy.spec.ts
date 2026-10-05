const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DashboardDetails,
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const DIALECT = "postgres";
const TABLE_NAME = "many_data_types";
const QUESTION_NAME = "Test question";
const QUESTION_2_NAME = "Test question 2";
const DASHBOARD_NAME = "Test dashboard";
const DASHBOARD_2_NAME = "Test dashboard 2";
const PARAMETER_NAME = "Boolean parameter";
const COLUMN_NAME = "Boolean";
const FIELD_NAME = "boolean";

describe("scenarios > dashboard > filters > boolean", () => {
  describe("mbql queries", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should allow to map a boolean parameter to a boolean column of an MBQL query, update it with a click behavior, and drill-thru", () => {
      createQuestionAndDashboard().then(({ dashboardId }) =>
        H.visitDashboard(dashboardId),
      );
      H.editDashboard();
      createAndMapParameter();
      H.showDashboardCardActions();
      cy.findByLabelText("Click behavior").click();
      H.sidebar().within(() => {
        cy.findByText(COLUMN_NAME).click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByTestId("unset-click-mappings")
          .findByText(PARAMETER_NAME)
          .click();
      });
      H.selectDropdown().findByText(COLUMN_NAME).click();
      H.saveDashboard();

      cy.log("'Update a dashboard filter' click behavior");
      H.getDashboardCard().findAllByText("true").first().click();
      H.filterWidget().findByText("True").should("be.visible");
      H.getDashboardCard().findByText("1 row").should("be.visible");
      H.getDashboardCard().findAllByText("true").first().click();
      H.filterWidget().findByText("True").should("not.exist");
      H.getDashboardCard().findByText("200 rows").should("be.visible");

      testParameterWidget({
        allRowCountText: "200 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "199 rows",
        hasBooleanColumn: true,
      });

      cy.log("drill-thru");
      H.filterWidget().click();
      H.popover().button("Add filter").click();
      H.getDashboardCard().findByText(QUESTION_NAME).click();
      H.assertQueryBuilderRowCount(1);
      H.queryBuilderFiltersPanel()
        .findByText(`${COLUMN_NAME} is true`)
        .should("be.visible");
    });

    it("should allow to use a 'Go to a custom destination - Saved question' click behavior", () => {
      createQuestionAndDashboard().then(({ dashboardId }) =>
        H.visitDashboard(dashboardId),
      );

      cy.log("set up click behavior");
      H.editDashboard();
      H.showDashboardCardActions();
      cy.findByLabelText("Click behavior").click();
      H.sidebar().within(() => {
        cy.findByText(COLUMN_NAME).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      H.entityPickerModal().findByText(QUESTION_NAME).click();
      H.sidebar()
        .findByTestId("unset-click-mappings")
        .findByText(COLUMN_NAME)
        .click();
      H.selectDropdown().findByText(COLUMN_NAME).click();
      H.saveDashboard();

      cy.log("assert click behavior");
      H.getDashboardCard().findAllByText("true").first().click();
      H.queryBuilderFiltersPanel()
        .findByText(`${COLUMN_NAME} is true`)
        .should("be.visible");
      H.assertTableRowsCount(1);
    });

    it("should allow to use a 'Go to a custom destination - Dashboard' click behavior with a column or a parameter", () => {
      setupDashboardClickBehavior();

      cy.log("column source passes the clicked value");
      H.getDashboardCard().findAllByText("true").first().click();
      H.dashboardHeader().findByText(DASHBOARD_NAME).should("be.visible");
      H.filterWidget().findByText("True").should("be.visible");
      H.getDashboardCard().findByText("1 row").should("be.visible");

      cy.log(
        "parameter source passes the filter value, not the clicked row's true",
      );
      cy.go("back");
      H.dashboardHeader().findByText(DASHBOARD_2_NAME).should("be.visible");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByText("False").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard(1).findByText("199 rows").should("be.visible");
      H.getDashboardCard(0).findByText("200 rows").should("be.visible");
      H.getDashboardCard(0).findAllByText("1").first().click();
      H.dashboardHeader().findByText(DASHBOARD_NAME).should("be.visible");
      H.filterWidget().findByText("False").should("be.visible");
      H.getDashboardCard().findByText("199 rows").should("be.visible");
    });
  });

  describe("native queries with field filters", { tags: "@external" }, () => {
    beforeEach(() => {
      H.restore(`${DIALECT}-writable`);
      H.resetTestTable({ type: DIALECT, table: TABLE_NAME });
      cy.signInAsAdmin();
      H.resyncDatabase({ tableName: TABLE_NAME });
    });

    it("should allow to map a boolean parameter to a boolean field filter of a SQL query, use it in click behaviors, and drill-thru", () => {
      createNativeQuestionWithFieldFilterAndDashboard().then(
        ({ dashboardId, questionId }) => {
          H.visitDashboard(dashboardId);
          H.editDashboard();
          createAndMapParameter();

          cy.log(
            "set up a saved question click behavior on the boolean column",
          );
          H.showDashboardCardActions();
          cy.findByLabelText("Click behavior").click();
          H.sidebar().within(() => {
            cy.findByText(FIELD_NAME).click();
            cy.findByText("Go to a custom destination").click();
            cy.findByText("Saved question").click();
          });
          H.entityPickerModal().findByText(QUESTION_NAME).click();
          H.sidebar()
            .findByTestId("unset-click-mappings")
            .findByText(COLUMN_NAME)
            .click();
          H.selectDropdown().findByText(FIELD_NAME).click();

          cy.log("set up a URL click behavior on the id column");
          H.sidebar().icon("chevronleft").click();
          H.sidebar().within(() => {
            cy.findByText("id").click();
            cy.findByText("Go to a custom destination").click();
            cy.findByText("URL").click();
          });
          H.modal().within(() => {
            cy.findByPlaceholderText(
              "e.g. http://acme.com/id/{{user_id}}",
            ).type(
              `http://localhost:4000/question/${questionId}?boolean={{${FIELD_NAME}}}`,
              { parseSpecialCharSequences: false },
            );
            cy.button("Done").click();
          });
          H.saveDashboard();
        },
      );

      cy.log("assert the saved question click behavior");
      H.getDashboardCard().findAllByText("true").first().click();
      H.assertTableRowsCount(1);
      H.filterWidget().findByText("True").should("be.visible");

      cy.log("assert the URL click behavior with the second row's value");
      cy.go("back");
      H.getDashboardCard().findByText("2").click();
      H.assertTableRowsCount(1);
      H.filterWidget().findByText("False").should("be.visible");

      cy.go("back");
      H.dashboardHeader().findByText(DASHBOARD_NAME).should("be.visible");
      testParameterWidget({
        allRowCountText: "2 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "1 row",
        hasBooleanColumn: true,
      });

      cy.log("drill-thru");
      H.filterWidget().click();
      H.popover().button("Add filter").click();
      H.getDashboardCard().findByText(QUESTION_NAME).click();
      H.queryBuilderHeader().findByText(QUESTION_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
      H.filterWidget().findByText("True").should("be.visible");
    });
  });

  describe("native queries with variables", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should allow to map a boolean parameter to a boolean variable of a SQL query and drill-thru", () => {
      createNativeQuestionWithVariableAndDashboard().then(({ dashboardId }) =>
        H.visitDashboard(dashboardId),
      );
      H.editDashboard();
      createAndMapParameter();
      H.saveDashboard();

      testParameterWidget({
        allRowCountText: "200 rows",
        trueRowCountText: "53 rows",
        falseRowCountText: "54 rows",
        hasBooleanColumn: false,
      });

      H.filterWidget().click();
      H.popover().button("Add filter").click();
      H.getDashboardCard().findByText(QUESTION_NAME).click();
      H.queryBuilderHeader().findByText(QUESTION_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(53);
      H.filterWidget().findByText("True").should("be.visible");
    });
  });
});

function createQuestionAndDashboard({
  questionName = QUESTION_NAME,
  dashboardName = DASHBOARD_NAME,
}: {
  questionName?: string;
  dashboardName?: string;
} = {}) {
  const questionDetails: StructuredQuestionDetails = {
    name: questionName,
    query: {
      fields: [
        ["field", PRODUCTS.ID, null],
        ["expression", "Boolean"],
      ],
      "source-table": PRODUCTS_ID,
      expressions: {
        [COLUMN_NAME]: ["=", ["field", PRODUCTS.ID, null], 1],
      },
    },
  };
  const dashboardDetails: DashboardDetails = {
    name: dashboardName,
  };
  return H.createQuestionAndDashboard({
    questionDetails,
    dashboardDetails,
  }).then(({ body: { dashboard_id }, questionId }) => {
    return { dashboardId: dashboard_id, questionId };
  });
}

function createNativeQuestionWithFieldFilterAndDashboard({
  questionName = QUESTION_NAME,
  dashboardName = DASHBOARD_NAME,
} = {}) {
  cy.log("create dashboard");

  return H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    return H.getFieldId({ tableId, name: FIELD_NAME }).then((fieldId) => {
      const questionDetails: NativeQuestionDetails = {
        name: questionName,
        database: WRITABLE_DB_ID,
        native: {
          query: `select id, boolean from ${TABLE_NAME} where {{boolean}}`,
          "template-tags": {
            boolean: {
              id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
              name: "boolean",
              "display-name": "Boolean",
              type: "dimension",
              dimension: ["field", fieldId, null],
              "widget-type": "boolean/=",
              default: null,
            },
          },
        },
      };
      const dashboardDetails: DashboardDetails = {
        name: dashboardName,
      };
      return H.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { dashboard_id }, questionId }) => {
        return { dashboardId: dashboard_id, questionId };
      });
    });
  });
}

function createNativeQuestionWithVariableAndDashboard() {
  cy.log("create a dashboard");

  const questionDetails: NativeQuestionDetails = {
    name: QUESTION_NAME,
    native: {
      query:
        "select id from products [[where category = (case when {{boolean}} then 'Gadget' else 'Widget' end)]]",
      "template-tags": {
        boolean: {
          id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
          name: "boolean",
          "display-name": "Boolean",
          type: "boolean",
          default: null,
        },
      },
    },
  };
  const dashboardDetails: DashboardDetails = {
    name: DASHBOARD_NAME,
  };
  return H.createNativeQuestionAndDashboard({
    questionDetails,
    dashboardDetails,
  }).then(({ body: { dashboard_id, id }, questionId }) => {
    return {
      dashboardId: Number(dashboard_id),
      dashcardId: id,
      questionId,
    };
  });
}

function createAndMapParameter({
  columnName = COLUMN_NAME,
  parameterName = PARAMETER_NAME,
  dashcardIndex = 0,
} = {}) {
  cy.log("parameter mapping");
  H.setFilter("Boolean", undefined, parameterName);
  H.selectDashboardFilter(H.getDashboardCard(dashcardIndex), columnName);
  H.dashboardParametersDoneButton().click();
}

function setupDashboardClickBehavior() {
  cy.log("setup target dashboard");
  createQuestionAndDashboard({
    dashboardName: DASHBOARD_NAME,
    questionName: QUESTION_NAME,
  }).then(({ dashboardId }) => {
    H.visitDashboard(dashboardId);
    H.editDashboard();
    createAndMapParameter();
    H.saveDashboard();
  });

  cy.log(
    "set up click behavior on an unfiltered card, with the parameter mapped to a second card",
  );
  createQuestionAndDashboard({
    dashboardName: DASHBOARD_2_NAME,
    questionName: QUESTION_2_NAME,
  }).then(({ dashboardId, questionId }) => {
    H.updateDashboardCards({
      dashboard_id: dashboardId,
      cards: [{ card_id: questionId }, { card_id: questionId, col: 12 }],
    });
    H.visitDashboard(dashboardId);
    H.editDashboard();
    createAndMapParameter({ dashcardIndex: 1 });
    H.showDashboardCardActions();
    cy.findByLabelText("Click behavior").click();
    addDashboardDestination({
      columnName: COLUMN_NAME,
      sourceName: COLUMN_NAME,
    });
    H.sidebar().icon("chevronleft").click();
    addDashboardDestination({
      columnName: "ID",
      sourceName: PARAMETER_NAME,
    });
    H.saveDashboard();
  });
}

function addDashboardDestination({
  columnName,
  sourceName,
}: {
  columnName: string;
  sourceName: string;
}) {
  H.sidebar().within(() => {
    cy.findByText(columnName).click();
    cy.findByText("Go to a custom destination").click();
    cy.findByText("Dashboard").click();
  });
  H.entityPickerModal().within(() => {
    cy.findByText(DASHBOARD_NAME).click();
  });
  H.sidebar().findByText(PARAMETER_NAME).click();
  H.selectDropdown().findByText(sourceName).click();
}

function testParameterWidget({
  allRowCountText,
  trueRowCountText,
  falseRowCountText,
  hasBooleanColumn,
}: {
  allRowCountText: string;
  trueRowCountText: string;
  falseRowCountText: string;
  hasBooleanColumn: boolean;
}) {
  const assertBooleanCells = (value: boolean) => {
    if (hasBooleanColumn) {
      H.getDashboardCard().within(() => {
        cy.findAllByText(String(value)).first().should("be.visible");
        cy.findByText(String(!value)).should("not.exist");
      });
    }
  };

  cy.log("parameter widget");
  H.getDashboardCard().findByText(allRowCountText).should("be.visible");
  H.filterWidget().click();
  H.popover().button("Add filter").click();
  H.getDashboardCard().findByText(trueRowCountText).should("be.visible");
  assertBooleanCells(true);
  H.filterWidget().icon("close").click();
  H.getDashboardCard().findByText(allRowCountText).should("be.visible");
  H.filterWidget().click();
  H.popover().within(() => {
    cy.findByText("False").click();
    cy.findByText("Add filter").click();
  });
  H.getDashboardCard().findByText(falseRowCountText).should("be.visible");
  assertBooleanCells(false);
  H.filterWidget().click();
  H.popover().within(() => {
    cy.findByText("True").click();
    cy.findByText("Update filter").click();
  });
  H.getDashboardCard().findByText(trueRowCountText).should("be.visible");
  assertBooleanCells(true);
  H.filterWidget().icon("close").click();
}
