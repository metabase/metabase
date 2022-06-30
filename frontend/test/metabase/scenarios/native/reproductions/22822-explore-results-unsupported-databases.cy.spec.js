import { restore } from "__support__/e2e/helpers";

const MONGO_DB_ID = 2;

const questionDetails = {
  name: "22822",
  database: MONGO_DB_ID,
  native: {
    query: '[{"$sort": {"id": 1}}, {"$limit": 2}]',
    collection: "products",
  },
};

describe("issue 22822", () => {
  beforeEach(() => {
    restore("mongo-4");
    cy.signInAsAdmin();
  });

  it("should not show 'Explore Results' for databases that do not support nested queries (metabase#22822)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByTextEnsureVisible("Rustic Paper Wallet");
    cy.findByText("Explore results").should("not.exist");
  });
});
