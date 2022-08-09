import {
  restore,
  visualize,
  withDatabase,
  adhocQuestionHash,
  summarize,
} from "__support__/e2e/helpers";

const MONGO_DB_ID = 2;

describe("issue 13097", () => {
  beforeEach(() => {
    restore("mongo-4");
    cy.signInAsAdmin();

    withDatabase(MONGO_DB_ID, ({ PEOPLE_ID }) => {
      const questionDetails = {
        dataset_query: {
          type: "query",
          query: { "source-table": PEOPLE_ID, limit: 5 },
          database: MONGO_DB_ID,
        },
      };

      const hash = adhocQuestionHash(questionDetails);

      cy.visit(`/question/notebook#${hash}`);
    });
  });

  it("should correctly apply distinct count on multiple columns (metabase#13097)", () => {
    summarize({ mode: "notebook" });

    cy.findByText("Number of distinct values of ...").click();
    cy.findByText("City").click();

    cy.findAllByTestId("notebook-cell-item").find(".Icon-add").click();

    cy.findByText("Number of distinct values of ...").click();
    cy.findByText("State").click();

    visualize();

    // cy.log("Reported failing on stats ~v0.36.3");
    cy.get(".cellData")
      .should("have.length", 4)
      .and("contain", "Distinct values of City")
      .and("contain", "1,966")
      .and("contain", "Distinct values of State")
      .and("contain", "49");
  });
});
