import { restore, startNewQuestion } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Orders model",
  query: { "source-table": ORDERS_ID },
  dataset: true,
};

describe("issue 25537", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/collection/*/items?*").as("getCollectionContent");
  });

  it("should be able to pick a saved model when using a non-english locale (metabase#25537)", () => {
    setLocale("de");
    cy.createQuestion(questionDetails);

    startNewQuestion();
    cy.icon("model").click();
    cy.wait("@getCollectionContent");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questionDetails.name).should("exist");
  });
});

const setLocale = locale => {
  cy.request("GET", "/api/user/current").then(({ body: { id: user_id } }) => {
    cy.request("PUT", `/api/user/${user_id}`, { locale });
  });
};
