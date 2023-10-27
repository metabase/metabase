import { restore, downloadAndAssert } from "e2e/support/helpers";

const questionDetails = {
  name: "28834",
  native: {
    query: 'select 1 "column a"',
  },
};

describe("metabase#28834", () => {
  // I have a test for saved native questions in `QueryBuilder.unit.spec.tsx`.
  // Initially, this test was planned as a unit test, but with some technical
  // difficulties, I've decided to test with Cypress instead.

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, {
      loadMetadata: true,
      wrapId: true,
    });

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();
    cy.get(".ace_editor").should("be.visible").type(', select 2 "column b"');
  });

  it("should be able to export unsaved native query results as CSV even after the query has changed", () => {
    const fileType = "csv";
    downloadAndAssert({ fileType, raw: true }, sheet => {
      expect(sheet["A1"].v).to.equal("column a");
      expect(sheet["A2"].v).to.equal("1");
      expect(sheet["A3"]).to.be.undefined;
    });
  });

  it("should be able to export unsaved native query results as XLSX even after the query has changed", () => {
    const fileType = "xlsx";
    downloadAndAssert({ fileType, raw: true }, sheet => {
      expect(sheet["A1"].v).to.equal("column a");
      expect(sheet["A2"].v).to.equal(1);
      expect(sheet["A3"]).to.be.undefined;
    });
  });
});
