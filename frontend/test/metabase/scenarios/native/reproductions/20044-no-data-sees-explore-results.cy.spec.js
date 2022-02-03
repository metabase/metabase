import { restore } from "__support__/e2e/cypress";

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
      cy.intercept("POST", `/api/card/${id}/query`).as("cardQuery");

      cy.signIn("nodata");

      cy.visit(`/question/${id}`);
      cy.wait("@cardQuery");

      cy.get(".cellData").contains("1");
      cy.findByText("Explore results").should("not.exist");
    });
  });
});
