import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  getFullName,
  entityPickerModal,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;
const { PEOPLE_ID } = SAMPLE_DATABASE;
const { nocollection } = USERS;

describe("issue 23981", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Let's revoke access to "Our analytics" from "All users"
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "none" },
    });

    cy.signIn("nocollection");
  });

  it("should not show the root collection name in breadcrumbs if the user does not have access to it (metabase#23981)", () => {
    visitQuestionAdhoc({
      name: "23981",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
        },
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${getFullName(nocollection)}'s Personal Collection`).click();

    entityPickerModal().within(() => {
      cy.findByText("Our analytics").should("not.exist");
      cy.log('ensure that "Collections" is not selectable');
      cy.findByText("Collections").should("be.visible").click();
      cy.button("Select").should("be.disabled");
    });
  });
});
