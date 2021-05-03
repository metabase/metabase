import { restore } from "__support__/e2e/cypress";

const xlsx = require("xlsx");

// csv and Excel files have different sheet names, so define them here and we'll reuse it throughout
const testCases = [
  { type: "csv", firstSheetName: "Sheet1" },
  { type: "xlsx", firstSheetName: "Query result" },
];

function testWorkbookDatetimes(workbook, download_type, sheetName) {
  expect(workbook.SheetNames[0]).to.eq(sheetName);
  expect(workbook.Sheets[sheetName]["A1"].v).to.eq("birth_date");
  expect(workbook.Sheets[sheetName]["B1"].v).to.eq("created_at");

  // Excel and CSV will have different formats
  if (download_type === "csv") {
    expect(workbook.Sheets[sheetName]["A2"].v).to.eq("2020-06-03");
    expect(workbook.Sheets[sheetName]["B2"].v).to.eq("2020-06-03T23:41:23");
  } else if (download_type === "xlsx") {
    // We tell the xlsx library to read raw and not parse dates
    // So for the _date_ format we expect an integer
    // And for timestamp, we expect a float
    expect(workbook.Sheets[sheetName]["A2"].v).to.eq(43985);
    expect(workbook.Sheets[sheetName]["B2"].v).to.eq(43985.98707175926);
  }
}

describe("scenarios > question > download", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("downloads Excel and CSV files", () => {
    // let's download a binary file

    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Orders, Count").click();
    cy.contains("18,760");
    cy.icon("download").click();

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

  describe("metabase#10803", () => {
    let questionId;

    beforeEach(() => {
      cy.createNativeQuestion({
        name: "10803",
        native: {
          query:
            "SELECT PARSEDATETIME('2020-06-03', 'yyyy-MM-dd') AS \"birth_date\", PARSEDATETIME('2020-06-03 23:41:23', 'yyyy-MM-dd hh:mm:ss') AS \"created_at\"",
          "template-tags": {},
        },
      }).then(({ body }) => {
        questionId = body.id;
      });
    });

    describe("for saved questions", () => {
      it("should format the date properly", () => {
        cy.wrap(testCases).each(testCase => {
          cy.log(`downloading a ${testCase.type} file`);
          const endpoint = `/api/card/${questionId}/query/${testCase.type}`;

          cy.request({
            url: endpoint,
            method: "POST",
            encoding: "binary",
          }).then(resp => {
            const workbook = xlsx.read(resp.body, {
              type: "binary",
              raw: true,
            });

            testWorkbookDatetimes(
              workbook,
              testCase.type,
              testCase.firstSheetName,
            );
          });
        });
      });
    });

    describe("for unsaved questions", () => {
      it("should format the date properly", () => {
        // Go to the existing question "10803"
        cy.visit(`/question/${questionId}`);
        cy.contains(/open editor/i).click();
        cy.get(".ace_editor").type("{movetoend} "); // Adds a space at the end of the query to make it "dirty"
        cy.icon("play")
          .first()
          .click();
        cy.icon("download").click();

        cy.wrap(testCases).each(testCase => {
          cy.log(`downloading a ${testCase.type} file`);
          const downloadClassName = `.Icon-${testCase.type}`;
          const endpoint = `/api/dataset/${testCase.type}`;

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
                const workbook = xlsx.read(resp.body, {
                  type: "binary",
                  raw: true,
                });

                testWorkbookDatetimes(
                  workbook,
                  testCase.type,
                  testCase.firstSheetName,
                );
              });
            });
        });
      });
    });
  });
});
