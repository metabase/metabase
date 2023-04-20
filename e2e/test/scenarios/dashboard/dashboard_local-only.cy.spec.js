import {
  restore,
  filterWidget,
  addOrUpdateDashboardCard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("LOCAL TESTING ONLY > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  /**
   * WARNING:
   *    https://github.com/metabase/metabase/issues/15656
   *    - We are currently not able to test translations in CI
   *    - DO NOT unskip this test even after the issue is fixed
   *    - To be used for local testing only
   *    - Make sure you have translation resources built first.
   *        - Run `./bin/i18n/build-translation-resources`
   *        - Then start the server and Cypress tests
   */

  it.skip("dashboard filter should not show placeholder for translated languages (metabase#15694)", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "fr" });
    });
    cy.createQuestionAndDashboard({
      questionDetails: {
        name: "15694",
        query: { "source-table": PEOPLE_ID },
      },
      dashboardDetails: {
        parameters: [
          {
            name: "Location",
            slug: "location",
            id: "5aefc725",
            type: "string/=",
            sectionId: "location",
          },
        ],
      },
    }).then(({ body: { card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          parameter_mappings: [
            {
              parameter_id: "5aefc725",
              card_id,
              target: ["dimension", ["field", PEOPLE.STATE, null]],
            },
          ],
        },
      });

      cy.visit(`/dashboard/${dashboard_id}?location=AK&location=CA`);
      filterWidget().contains(/\{0\}/).should("not.exist");
    });
  });
});
