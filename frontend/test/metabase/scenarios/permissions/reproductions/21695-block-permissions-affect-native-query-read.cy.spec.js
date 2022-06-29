import { restore, visitDashboard, describeEE } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID, USER_GROUPS } from "__support__/e2e/cypress_data";

const { ALL_USERS_GROUP, NOSQL_GROUP } = USER_GROUPS;

const questionDetails = {
  name: "21695",
  native: { query: "select * from orders limit 5" },
};

describeEE("issue 21695", () => {
  beforeEach(() => {
    // TODO:
    // Remove this line to unskip repro once the issue gets fixed.
    cy.skipOn(true);

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails,
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");
    });

    // Block data access to the sample database for all users.
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "block", native: "none" } },
      },
    });

    // Keep in mind that NOSQL_GROUP has unrestricted access to the sample database.
    // That access level is more specific and should win over the ALL_USERS_GROUP.

    // Let's just give NOSQL_GROUP a collection read access so that they can view the dashboard.
    cy.updateCollectionGraph({
      [NOSQL_GROUP]: { root: "read" },
    });
  });

  it("block permissions for all users should not prevent users with sufficient permissions to read native query (metabase#21695)", () => {
    cy.signIn("nosql");

    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
    });

    cy.get(".Card")
      .findByText(questionDetails.name)
      .click();

    cy.wait("@cardQuery").then(({ response: { body } }) => {
      expect(body.error).not.to.exist;
    });

    cy.findByText("This question is written in SQL.");
    cy.findByText(/Open editor/i).should("not.exist");
  });
});
