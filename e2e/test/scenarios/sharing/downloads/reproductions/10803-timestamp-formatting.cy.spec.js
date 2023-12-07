import {
  restore,
  downloadAndAssert,
  runNativeQuery,
} from "e2e/support/helpers";

const testCases = ["csv", "xlsx"];

describe("issue 10803", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "10803",
        native: {
          query:
            "SELECT cast(parsedatetime('2026-06-03', 'yyyy-MM-dd') AS timestamp) AS \"birth_date\", cast(parsedatetime('2026-06-03 23:41:23', 'yyyy-MM-dd HH:mm:ss') AS timestamp) AS \"created_at\"",
        },
      },
      { visitQuestion: true, wrapId: true },
    );
  });

  testCases.forEach(fileType => {
    it(`should format the date properly for ${fileType} in saved questions (metabase#10803)`, () => {
      cy.get("@questionId").then(questionId => {
        downloadAndAssert(
          { fileType, questionId, logResults: true, raw: true },
          testWorkbookDatetimes,
        );
      });
    });

    it(`should format the date properly for ${fileType} in unsaved questions`, () => {
      // Add a space at the end of the query to make it "dirty"
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
        expect(sheet["A2"].v).to.eq("2026-06-03T00:00:00");
        expect(sheet["B2"].v).to.eq("2026-06-03T23:41:23");
      } else if (fileType === "xlsx") {
        // We tell the xlsx library to read raw and not parse dates
        // So for the _date_ format we expect an integer
        // And for timestamp, we expect a float
        expect(sheet["A2"].v).to.eq(46176);
        expect(sheet["B2"].v).to.eq(46176.98707175926);
      }
    }
  });
});
