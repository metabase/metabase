import { restore, signInAsAdmin } from "__support__/cypress";

const xlsx = require("xlsx");

// csv and Excel files have different sheet names, so define them here and we'll reuse it throughout
const testCases = [
  { type: "csv", firstSheetName: "Sheet1" },
  { type: "xlsx", firstSheetName: "Query result" },
];

describe("scenarios > question > download", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
  });

  it("downloads Excel and CSV files", () => {
    // let's download a binary file

    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Orders, Count").click();
    cy.contains("18,760");
    cy.get(".Icon-download").click();

    // Programatically issue download requests for this query for both CSV and Excel

    cy.wrap(testCases).each(testCase => {
      const downloadClassName = `.Icon-${testCase.type}`;
      const endpoint = `/api/dataset/${testCase.type}`;
      const sheetName = testCase.firstSheetName;

      cy.log(`downloading a ${testCase.type} file`);

      cy.get(downloadClassName)
        .parent()
        .parent()
        .get('input[name="query"]')
        .invoke("val")
        .then(download_query_params => {
          cy.request({
            url: endpoint,
            method: "POST",
            form: true,
            body: { query: download_query_params },
            encoding: "binary",
          }).then(resp => {
            const workbook = xlsx.read(resp.body, { type: "binary" });

            expect(workbook.SheetNames[0]).to.eq(sheetName);
            expect(workbook.Sheets[sheetName]["A1"].v).to.eq("Count");
            expect(workbook.Sheets[sheetName]["A2"].v).to.eq(18760);
          });
        });
    });
  });
});
