import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const xlsx = require("xlsx");
const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const questionDetails = {
  name: "18219",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
};

const testCases = [
  { type: "csv", sheetName: "Sheet1" },
  { type: "xlsx", sheetName: "Query result" },
];

describe.skip("issue 18219", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should format temporal units on export (metabase#18219)", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept("POST", `/api/card/${id}/query`).as("cardQuery");
      cy.visit(`/question/${id}`);

      // Wait for `result_metadata` to load
      cy.wait("@cardQuery");

      cy.findByText("Created At: Year");
      cy.findByText("2016");
      cy.findByText("744");

      cy.icon("download").click();

      cy.wrap(testCases).each(({ type, sheetName }) => {
        cy.log(`downloading a ${type} file`);
        const endpoint = `/api/card/${id}/query/${type}`;

        cy.request({
          url: endpoint,
          method: "POST",
          encoding: "binary",
        }).then(resp => {
          const workbook = xlsx.read(resp.body, {
            type: "binary",
            raw: true,
          });

          const A1 = workbook.Sheets[sheetName]["A1"];
          const A2 = workbook.Sheets[sheetName]["A2"];

          expect(A1.v).to.eq("Created At: Year");

          if (type === "csv") {
            expect(A2.v).to.eq("2016");
          }

          if (type === "xlsx") {
            /**
             * Depending on how we end up solving this issue,
             * the following assertion on the cell type might not be correct.
             * It's very likely we'll format temporal breakouts as strings.
             * I.e. we have to take into account Q1, Q2, etc.
             */
            // expect(A2.t).to.eq("n");

            /**
             * Because of the excel date format, we cannot assert on the raw value `v`.
             * Rather, we have to do it on the parsed value `w`.
             */
            expect(A2.w).to.eq("2016");
          }
        });
      });
    });
  });
});
