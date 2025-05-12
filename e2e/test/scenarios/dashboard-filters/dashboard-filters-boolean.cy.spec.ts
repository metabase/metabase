const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const DIALECT = "postgres";
const TEST_TABLE = "many_data_types";

describe(
  "scenarios > dashboard > filters > number",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore(`${DIALECT}-writable`);
      H.resetTestTable({ type: DIALECT, table: TEST_TABLE });
      cy.signInAsAdmin();
      H.resyncDatabase({ tableName: TEST_TABLE });
    });

    it("should allow to map a boolean parameter to a boolean column of an MBQL query", () => {
      cy.log("create dashboard");
      createQuestionAndDashboard();

      cy.log("parameter mapping");
      mapParameter({ columnName: "Boolean" });

      cy.log("parameter widget");
      testParameterWidget({
        allRowCountText: "200 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "199 rows",
      });

      cy.log("drill-thru");
      H.getDashboardCard().findByText("Q1").click();
      H.queryBuilderFiltersPanel()
        .findByText("Boolean is true")
        .should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });

    it("should allow to map a boolean parameter to a boolean field filter of a SQL query", () => {
      cy.log("create dashboard");
      createNativeQuestionAndDashboard();

      cy.log("parameter mapping");
      mapParameter({ columnName: "Boolean" });

      cy.log("parameter widget");
      testParameterWidget({
        allRowCountText: "2 rows",
        trueRowCountText: "1 row",
        falseRowCountText: "1 row",
      });

      cy.log("drill-thru");
      H.getDashboardCard().findByText("Q1").click();
      H.assertQueryBuilderRowCount(1);
      H.filterWidget().findByText("true").should("be.visible");
    });
  },
);

function createQuestionAndDashboard() {
  const questionDetails: StructuredQuestionDetails = {
    name: "Q1",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Boolean: ["=", ["field", PRODUCTS.ID, null], 1],
      },
    },
  };
  H.createQuestionAndDashboard({ questionDetails }).then(
    ({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    },
  );
}

function createNativeQuestionAndDashboard() {
  H.getTableId({ name: "many_data_types" }).then((tableId) => {
    H.getFieldId({ tableId, name: "boolean" }).then((fieldId) => {
      const questionDetails: NativeQuestionDetails = {
        name: "Q1",
        database: WRITABLE_DB_ID,
        native: {
          query: "select * from many_data_types where {{boolean}}",
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
      H.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          H.visitDashboard(dashboard_id);
        },
      );
    });
  });
}

function mapParameter({ columnName }: { columnName: string }) {
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
}
