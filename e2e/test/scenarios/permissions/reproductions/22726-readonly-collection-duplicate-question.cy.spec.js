import {
  restore,
  popover,
  visitQuestion,
  openQuestionActions,
  getFullName,
} from "e2e/support/helpers";
import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { nocollection } = USERS;

const { ALL_USERS_GROUP } = USER_GROUPS;

describe("issue 22726", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createCard");

    restore();
    cy.signInAsAdmin();

    // Let's give all users a read only access to "Our analytics"
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "read" },
    });

    cy.signIn("nocollection");
  });

  it("should offer to duplicate a question in a view-only collection (metabase#22726)", () => {
    visitQuestion(ORDERS_QUESTION_ID);

    openQuestionActions();
    popover().findByText("Duplicate").click();
    cy.findByTextEnsureVisible(
      `${getFullName(nocollection)}'s Personal Collection`,
    );

    cy.button("Duplicate").click();
    cy.wait("@createCard");
  });
});
