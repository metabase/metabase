import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, main, popover } from "e2e/support/helpers";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const QUERY = {
  "source-table": REVIEWS_ID,
  expressions: {
    "Custom Reviewer": ["field", REVIEWS.REVIEWER, null],
  },
  fields: [
    ["field", REVIEWS.ID, { "base-type": "type/BigInteger" }],
    ["field", REVIEWS.REVIEWER, { "base-type": "type/Text" }],
    ["expression", "Custom Reviewer", { "base-type": "type/Text" }],
  ],
};

describe("issue 32032", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion({ query: QUERY }, { visitQuestion: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow quick filter drills on custom columns", () => {
    cy.findByTestId("TableInteractive-root")
      .findAllByText("xavier")
      .eq(1)
      .click();
    popover().findByText("Is xavier").click();
    cy.wait("@dataset");
    main()
      .findByText(/There was a problem/i)
      .should("not.exist");
    cy.findByTestId("TableInteractive-root")
      .findAllByText("xavier")
      .should("have.length", 2);
  });
});
