import { popover, restore, visitQuestionAdhoc } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID, USER_GROUPS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ALL_USERS_GROUP } = USER_GROUPS;
const { PEOPLE_ID } = SAMPLE_DATABASE;

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

    cy.findByText("Save").click();
    cy.findByText("No Collection Tableton's Personal Collection").click();

    popover().within(() => {
      cy.findByText("Our analytics").should("not.exist");
      cy.findByText("Collections").should("be.visible");
    });
  });
});
