import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const { MeasureEditor } = H.DataModel;
const { ORDERS_ID } = SAMPLE_DATABASE;

const MEASURE_NAME = "A measure";

describe("scenarios > data studio > measures > queries", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("measures queries", () => {
    it("should be able to create a measure with an aggregation without columns", () => {
      cy.log("create a new measure");
      H.DataStudio.Tables.visitNewMeasurePage(ORDERS_ID);
      MeasureEditor.getNameInput().type(MEASURE_NAME);
      MeasureEditor.getAggregationPlaceholder().click();
      H.popover().findByText("Count of rows").click();
      MeasureEditor.getSaveButton().click();
      H.undoToast().should("contain.text", "Measure created");

      cy.log("verify measure works in query builder");
      verifyMeasureInQueryBuilder({
        tableId: ORDERS_ID,
        scalarValue: "18,760",
      });
    });
  });
});

function verifyMeasureInQueryBuilder({
  tableId,
  scalarValue,
}: {
  tableId: TableId;
  scalarValue: string;
}) {
  cy.log("verify measure works in query builder");
  H.openTable({ table: tableId, mode: "notebook" });
  H.summarize({ mode: "notebook" });
  H.popover().findByText("Measures").click();
  H.popover().findByText(MEASURE_NAME).click();
  H.visualize();
  H.queryBuilderMain()
    .findByTestId("scalar-value")
    .should("have.text", scalarValue);
  H.assertQueryBuilderRowCount(1);
}
