import { restore, visitQuestion } from "__support__/e2e/helpers";

const questionDetails = {
  name: "20044",
  native: {
    query: "select 1",
  },
};

describe("issue 20044", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("nodata user should not see 'Explore results' (metabase#20044)", () => {
    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.signIn("nodata");

      visitQuestion(id);

      cy.get(".cellData").contains("1");
      cy.findByText("Explore results").should("not.exist");
    });
  });
});
