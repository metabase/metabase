import {
  restore,
  downloadAndAssert,
  runNativeQuery,
} from "__support__/e2e/cypress";

const testCases = ["csv", "xlsx"];

describe("scenarios > question > download", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  testCases.forEach(fileType => {
    it(`downloads ${fileType} file`, () => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("Orders, Count").click();

      cy.contains("18,760");

      downloadAndAssert({ fileType }, sheet => {
        expect(sheet["A1"].v).to.eq("Count");
        expect(sheet["A2"].v).to.eq(18760);
      });
    });
  });

  describe("metabase#10803", () => {
    let questionId;

    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      cy.createNativeQuestion({
        name: "10803",
        native: {
          query:
            "SELECT PARSEDATETIME('2020-06-03', 'yyyy-MM-dd') AS \"birth_date\", PARSEDATETIME('2020-06-03 23:41:23', 'yyyy-MM-dd hh:mm:ss') AS \"created_at\"",
          "template-tags": {},
        },
      }).then(({ body }) => {
        questionId = body.id;

        cy.intercept("POST", `/api/card/${questionId}/query`).as("cardQuery");
        cy.visit(`/question/${questionId}`);

        cy.wait("@cardQuery");
      });
    });

    testCases.forEach(fileType => {
      it(`should format the date properly for ${fileType} in saved questions`, () => {
        downloadAndAssert(
          { fileType, questionId, logResults: true, raw: true },
          testWorkbookDatetimes,
        );
      });

      it(`should format the date properly for ${fileType} in unsaved questions`, () => {
        // Add a space at the end of the query to make it "dirty"
        cy.contains(/open editor/i).click();
        cy.get(".ace_editor").type("{movetoend} ");

        runNativeQuery();
        downloadAndAssert({ fileType, raw: true }, testWorkbookDatetimes);
      });

      function testWorkbookDatetimes(sheet) {
        expect(sheet["A1"].v).to.eq("birth_date");
        expect(sheet["B1"].v).to.eq("created_at");

        // Excel and CSV will have different formats
        if (fileType === "csv") {
          expect(sheet["A2"].v).to.eq("2020-06-03");
          expect(sheet["B2"].v).to.eq("2020-06-03T23:41:23");
        } else if (fileType === "xlsx") {
          // We tell the xlsx library to read raw and not parse dates
          // So for the _date_ format we expect an integer
          // And for timestamp, we expect a float
          expect(sheet["A2"].v).to.eq(43985);
          expect(sheet["B2"].v).to.eq(43985.98707175926);
        }
      }
    });
  });
});
