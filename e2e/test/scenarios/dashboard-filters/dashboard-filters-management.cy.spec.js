import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  filterWidget,
  editDashboard,
  saveDashboard,
  visitDashboard,
  sidebar,
  getDashboardCard,
  addOrUpdateDashboardCard,
} from "e2e/support/helpers";
import { createMockParameter } from "metabase-types/api/mocks";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > management", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("Disconnect from cards", () => {
    it("should reset existing filter mappings", () => {
      const locationFilter = createMockParameter({
        name: "Location",
        slug: "location",
        id: "5aefc725",
        type: "string/=",
        sectionId: "location",
      });

      const textFilter = createMockParameter({
        name: "Text",
        slug: "string",
        id: "5aefc726",
        type: "string/=",
        sectionId: "string",
      });

      const questionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };

      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails: {
          parameters: [locationFilter, textFilter],
        },
      }).then(({ body: { card_id, dashboard_id } }) => {
        addOrUpdateDashboardCard({
          card_id,
          dashboard_id,
          card: {
            parameter_mappings: [
              {
                parameter_id: locationFilter.id,
                card_id,
                target: ["dimension", ["field", PEOPLE.STATE, null]],
              },

              {
                parameter_id: textFilter.id,
                card_id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
            ],
          },
        });

        visitDashboard(dashboard_id);
      });

      cy.log("verify filter is there");
      filterWidget().should("contain", "Location").and("contain", "Text");

      editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Location")
        .click();

      getDashboardCard().contains("Person.State");

      cy.log("Disconnect cards");
      sidebar().findByText("Disconnect from cards").click();

      getDashboardCard().should("not.contain", "Person.State");

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Text")
        .click();

      getDashboardCard().should("contain", "Person.Name");

      saveDashboard();

      filterWidget().should("contain", "Text").and("not.contain", "Location");
    });
  });
});
