import {
  restore,
  downloadAndAssert,
  startNewQuestion,
  visualize,
} from "__support__/e2e/helpers";

const testCases = ["csv", "xlsx"];

describe("scenarios > question > download", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  testCases.forEach(fileType => {
    it(`downloads ${fileType} file`, () => {
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("Orders, Count").click();

      visualize();
      cy.contains("18,760");

      downloadAndAssert({ fileType }, sheet => {
        expect(sheet["A1"].v).to.eq("Count");
        expect(sheet["A2"].v).to.eq(18760);
      });
    });
  });
});
