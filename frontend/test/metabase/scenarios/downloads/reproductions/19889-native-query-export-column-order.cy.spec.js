import { restore, downloadAndAssert } from "__support__/e2e/cypress";

let questionId;

const questionDetails = {
  name: "19889",
  native: {
    query: 'select 1 "column a", 2 "column b", 3 "column c"',
  },
};

const testCases = ["csv", "xlsx"];

describe("issue 19889", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      questionId = id;

      cy.intercept("POST", `/api/card/${questionId}/query`).as("cardQuery");
      cy.visit(`/question/${questionId}`);

      cy.wait("@cardQuery");

      // Reorder columns a and b
      cy.findByText("column a")
        .trigger("mousedown", 0, 0, { force: true })
        .trigger("mousemove", 5, 5, { force: true })
        .trigger("mousemove", 100, 0, { force: true })
        .trigger("mouseup", 100, 0, { force: true });
      cy.findByText("Started from").click(); // Give DOM some time to update
    });
  });

  testCases.forEach(fileType => {
    it(`should order columns correctly in saved native query exports`, () => {
      saveAndOverwrite();

      downloadAndAssert({ fileType, questionId, raw: true }, sheet => {
        expect(sheet["A1"].v).to.equal("column b");
        expect(sheet["B1"].v).to.equal("column a");
        expect(sheet["C1"].v).to.equal("column c");
      });
    });

    it(`should order columns correctly in unsaved native query exports`, () => {
      downloadAndAssert({ fileType, raw: true }, sheet => {
        expect(sheet["A1"].v).to.equal("column b");
        expect(sheet["B1"].v).to.equal("column a");
        expect(sheet["C1"].v).to.equal("column c");
      });
    });

    it(`should order columns correctly in saved native query exports when the query was modified but not re-run before save (#19889)`, () => {
      cy.contains(/open editor/i).click();
      cy.get(".ace_editor").type(
        '{selectall}select 1 "column x", 2 "column y", 3 "column c"',
      );

      saveAndOverwrite();

      cy.visit(`/question/${questionId}`);
      cy.wait("@cardQuery");
      downloadAndAssert({ fileType, questionId, raw: true }, sheet => {
        expect(sheet["A1"].v).to.equal("column x");
        expect(sheet["B1"].v).to.equal("column y");
        expect(sheet["C1"].v).to.equal("column c");
      });
    });
  });
});

function saveAndOverwrite() {
  cy.findByText("Save").click();
  cy.button("Save").click();
}
