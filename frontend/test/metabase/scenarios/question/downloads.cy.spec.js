import { restore, analyzeRawXML } from "__support__/e2e/cypress";

const xlsx = require("xlsx");

// csv and Excel files have different sheet names, so define them here and we'll reuse it throughout
const testCases = [{ type: "csv", firstSheetName: "Sheet1" }, { type: "xlsx" }];

function testWorkbookDatetimes(payload, download_type, sheetName) {
  // Excel and CSV will have different formats
  if (download_type === "csv") {
    const workbook = xlsx.read(payload, {
      type: "binary",
      raw: true,
    });

    expect(workbook.SheetNames[0]).to.eq(sheetName);
    expect(workbook.Sheets[sheetName]["A1"].v).to.eq("birth_date");
    expect(workbook.Sheets[sheetName]["B1"].v).to.eq("created_at");

    expect(workbook.Sheets[sheetName]["A2"].v).to.eq("2020-06-03");
    expect(workbook.Sheets[sheetName]["B2"].v).to.eq("2020-06-03T23:41:23");
  } else if (download_type === "xlsx") {
    analyzeRawXML(payload, xml => {
      const A1 = xml.querySelector("[r='A1']");
      const B1 = xml.querySelector("[r='B1']");
      const A2 = xml.querySelector("[r='A2']");
      const B2 = xml.querySelector("[r='A2']");

      expect(A1).to.contain("birth_date");
      expect(B1).to.contain("created_at");

      expect(A2).to.contain("43985.0");
      expect(B2).to.contain("43985.98707175926");
    });
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

    cy.wrap(testCases).each(({ type, firstSheetName }) => {
      const downloadClassName = `.Icon-${type}`;
      const endpoint = `/api/dataset/${type}`;
      const sheetName = firstSheetName;

      cy.log(`downloading a ${type} file`);

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
          }).then(({ body: payload }) => {
            if (type === "csv") {
              const workbook = xlsx.read(payload, { type: "binary" });

              expect(workbook.SheetNames[0]).to.eq(sheetName);
              expect(workbook.Sheets[sheetName]["A1"].v).to.eq("Count");
              expect(workbook.Sheets[sheetName]["A2"].v).to.eq(18760);
            }

            if (type === "xlsx") {
              analyzeRawXML(payload, xml => {
                const A1 = xml.querySelector("[r='A1']");
                const A2 = xml.querySelector("[r='A2']");

                expect(A1).to.contain("Count");
                expect(A1.getAttribute("t")).to.eq("inlineStr");

                expect(A2).to.contain("18760.0");
                expect(A2.getAttribute("t")).to.eq("n");
              });
            }
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
          }).then(({ body: payload }) => {
            testWorkbookDatetimes(
              payload,
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

        cy.wrap(testCases).each(({ type, firstSheetName }) => {
          cy.log(`downloading a ${type} file`);
          const downloadClassName = `.Icon-${type}`;
          const endpoint = `/api/dataset/${type}`;

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
              }).then(({ body: payload }) => {
                testWorkbookDatetimes(payload, type, firstSheetName);
              });
            });
        });
      });
    });
  });
});
