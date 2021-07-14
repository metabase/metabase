import { restore, filterWidget } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

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
    cy.createQuestion({
      name: "15694",
      query: { "source-table": PEOPLE_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("15694D").then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              name: "Location",
              slug: "location",
              id: "5aefc725",
              type: "string/=",
              sectionId: "location",
            },
          ],
        });
        // Add card to the dashboard
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to the card
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 12,
                sizeY: 9,
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: "5aefc725",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PEOPLE.STATE, null]],
                  },
                ],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}?location=AK&location=CA`);
        filterWidget()
          .contains(/\{0\}/)
          .should("not.exist");
      });
    });
  });
});
