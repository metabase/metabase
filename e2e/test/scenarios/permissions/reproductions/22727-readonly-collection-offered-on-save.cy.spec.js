import { restore, visitQuestion, popover } from "e2e/support/helpers";
import { USER_GROUPS, ORDERS_QUESTION_ID } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

describe("issue 22727", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Let's give all users a read only access to "Our analytics"
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "read" },
    });

    cy.signIn("nocollection");
  });

  it("should not offer to save question in view only collection (metabase#22727, metabase#20717)", () => {
    // It is important to start from a saved question and to alter it.
    // We already have a reproduction that makes sure "Our analytics" is not offered when starting from an ad-hoc question (table).
    visitQuestion(ORDERS_QUESTION_ID);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("31.44").click();
    popover().contains("=").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.get(".Modal").within(() => {
      // This part reproduces https://github.com/metabase/metabase/issues/20717
      cy.findByText(/^Replace original qeustion/).should("not.exist");

      // This part is an actual repro for https://github.com/metabase/metabase/issues/22727
      cy.findByTestId("select-button-content")
        .invoke("text")
        .should("not.eq", "Our analytics");
    });
  });
});
