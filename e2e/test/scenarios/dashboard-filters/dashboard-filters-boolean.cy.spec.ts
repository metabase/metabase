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

    it("should allow to map a boolean parameter to a boolean column of an MBQL query", () => {
      createQuestionAndDashboard();
      mapParameter({ columnName: "Boolean" });
      testParameterWidget({
        allRowCountText: "200 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "199 rows",
      });
      testDrillThru({
        columnName: "Boolean",
        trueRowCount: 1,
        isNative: false,
      });
    });

    it("should allow to map a boolean parameter to a boolean field filter of a SQL query", () => {
      createNativeQuestionAndDashboard();
      mapParameter({ columnName: "Boolean" });
      testParameterWidget({
        allRowCountText: "2 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "1 row",
      });
      testDrillThru({
        columnName: "Boolean",
        trueRowCount: 1,
        isNative: true,
      });
    });
  },
);

function createQuestionAndDashboard() {
  const questionDetails: StructuredQuestionDetails = {
    name: QUESTION_NAME,
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Boolean: ["=", ["field", PRODUCTS.ID, null], 1],
      },
    },
  };
  const dashboardDetails: DashboardDetails = {
    name: DASHBOARD_NAME,
  };
  H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
    ({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    },
  );
}

function createNativeQuestionAndDashboard() {
  cy.log("create dashboard");

  H.getTableId({ name: TABLE_NAME }).then((tableId) => {
    H.getFieldId({ tableId, name: "boolean" }).then((fieldId) => {
      const questionDetails: NativeQuestionDetails = {
        name: QUESTION_NAME,
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
        name: DASHBOARD_NAME,
      };
      H.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });
    });
  });
}

function mapParameter({ columnName }: { columnName: string }) {
  cy.log("parameter mapping");
  H.editDashboard();
  H.setFilter("Boolean");
  H.selectDashboardFilter(H.getDashboardCard(), columnName);
  H.saveDashboard();
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
  columnName,
  trueRowCount,
  isNative,
}: {
  columnName: string;
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
