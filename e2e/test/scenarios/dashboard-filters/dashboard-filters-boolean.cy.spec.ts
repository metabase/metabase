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
const DASHBOARD_NAME = "Test dashboard";
const COLUMN_NAME = "Boolean";
const PARAMETER_NAME = "Boolean parameter";

describe(
  "scenarios > dashboard > filters > number",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore(`${DIALECT}-writable`);
      H.resetTestTable({ type: DIALECT, table: TABLE_NAME });
      cy.signInAsAdmin();
      H.resyncDatabase({ tableName: TABLE_NAME });
    });

    describe("mbql queries", () => {
      it("should allow to map a boolean parameter to a boolean column of an MBQL query and drill-thru", () => {
        createQuestionAndDashboard().then(({ dashboardId }) =>
          H.visitDashboard(dashboardId),
        );
        H.editDashboard();
        createAndMapParameter();
        H.saveDashboard();
        testParameterWidget({
          allRowCountText: "200 rows",
          trueRowCountText: "1 row",
          falseRowCountText: "199 rows",
        });
        testDrillThru({
          trueRowCount: 1,
          isNative: false,
        });
      });

      it("should allow to use a 'Update dashboard filter' click behavior", () => {
        createQuestionAndDashboard().then(({ dashboardId }) =>
          H.visitDashboard(dashboardId),
        );

        cy.log("set up click behavior");
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
        H.popover().findByText(COLUMN_NAME).click();
        H.saveDashboard();

        cy.log("assert click behavior");
        H.getDashboardCard().findAllByText("true").first().click();
        H.filterWidget().findByText("true").should("be.visible");
        H.getDashboardCard().findByText("1 row").should("be.visible");
        H.getDashboardCard().findAllByText("true").first().click();
        H.filterWidget().findByText("true").should("not.exist");
        H.getDashboardCard().findByText("200 rows").should("be.visible");
      });

      it("should allow to use a 'Go to a custom destination - Saved question' click behavior", () => {
        createQuestionAndDashboard().then(({ dashboardId }) =>
          H.visitDashboard(dashboardId),
        );

        cy.log("set up click behavior");
        H.editDashboard();
        createAndMapParameter();
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
      });
    });

    describe("native queries", () => {
      it("should allow to map a boolean parameter to a boolean field filter of a SQL query and drill-thru", () => {
        createNativeQuestionAndDashboard().then(({ dashboardId }) =>
          H.visitDashboard(dashboardId),
        );
        H.editDashboard();
        createAndMapParameter();
        H.saveDashboard();
        testParameterWidget({
          allRowCountText: "2 rows",
          trueRowCountText: "1 row",
          falseRowCountText: "1 row",
        });
        testDrillThru({
          trueRowCount: 1,
          isNative: true,
        });
      });
    });
  },
);

function createQuestionAndDashboard({
  questionName = QUESTION_NAME,
  dashboardName = DASHBOARD_NAME,
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
        Boolean: ["=", ["field", PRODUCTS.ID, null], 1],
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

function createNativeQuestionAndDashboard({
  questionName = QUESTION_NAME,
  dashboardName = DASHBOARD_NAME,
} = {}) {
  cy.log("create dashboard");

  return H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    return H.getFieldId({ tableId, name: "boolean" }).then((fieldId) => {
      const questionDetails: NativeQuestionDetails = {
        name: questionName,
        database: WRITABLE_DB_ID,
        native: {
          query: `select * from ${TABLE_NAME} where {{boolean}}`,
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

function createAndMapParameter({
  columnName = COLUMN_NAME,
  parameterName = PARAMETER_NAME,
} = {}) {
  cy.log("parameter mapping");
  H.setFilter("Boolean", undefined, parameterName);
  H.selectDashboardFilter(H.getDashboardCard(), columnName);
  H.dashboardParametersDoneButton().click();
}

function testParameterWidget({
  allRowCountText,
  trueRowCountText,
  falseRowCountText,
}: {
  allRowCountText: string;
  trueRowCountText: string;
  falseRowCountText: string;
}) {
  cy.log("parameter widget");
  H.getDashboardCard().findByText(allRowCountText).should("be.visible");
  H.filterWidget().click();
  H.popover().button("Add filter").click();
  H.getDashboardCard().findByText(trueRowCountText).should("be.visible");
  H.filterWidget().icon("close").click();
  H.getDashboardCard().findByText(allRowCountText).should("be.visible");
  H.filterWidget().click();
  H.popover().within(() => {
    cy.findByText("False").click();
    cy.findByText("Add filter").click();
  });
  H.getDashboardCard().findByText(falseRowCountText).should("be.visible");
  H.filterWidget().click();
  H.popover().within(() => {
    cy.findByText("True").click();
    cy.findByText("Update filter").click();
  });
  H.getDashboardCard().findByText(trueRowCountText).should("be.visible");
  H.filterWidget().icon("close").click();
}

function testDrillThru({
  columnName = COLUMN_NAME,
  trueRowCount,
  isNative,
}: {
  columnName?: string;
  trueRowCount: number;
  isNative: boolean;
}) {
  cy.log("drill-thru");
  H.filterWidget().click();
  H.popover().button("Add filter").click();
  H.getDashboardCard().findByText(QUESTION_NAME).click();
  H.assertQueryBuilderRowCount(trueRowCount);

  if (isNative) {
    H.filterWidget().findByText("true").should("be.visible");
  } else {
    H.queryBuilderFiltersPanel()
      .findByText(`${columnName} is true`)
      .should("be.visible");
  }
}
