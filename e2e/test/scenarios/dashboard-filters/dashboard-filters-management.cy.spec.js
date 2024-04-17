import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  filterWidget,
  editDashboard,
  saveDashboard,
  visitDashboard,
  sidebar,
  getDashboardCard,
  updateDashboardCards,
  popover,
} from "e2e/support/helpers";
import { createMockParameter } from "metabase-types/api/mocks";

const { PEOPLE, PEOPLE_ID, ORDERS_ID } = SAMPLE_DATABASE;

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

      const peopleQuestionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };
      const ordersQuestionDetails = {
        query: { "source-table": ORDERS_ID, limit: 5 },
      };

      cy.createDashboardWithQuestions({
        dashboardDetails: {
          parameters: [locationFilter, textFilter],
        },
        questions: [peopleQuestionDetails, ordersQuestionDetails],
      }).then(({ dashboard, questions: cards }) => {
        const [peopleCard, ordersCard] = cards;

        updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: peopleCard.id,
              parameter_mappings: [
                {
                  parameter_id: locationFilter.id,
                  card_id: peopleCard.id,
                  target: ["dimension", ["field", PEOPLE.STATE, null]],
                },
                {
                  parameter_id: textFilter.id,
                  card_id: peopleCard.id,
                  target: ["dimension", ["field", PEOPLE.NAME, null]],
                },
              ],
            },
            {
              card_id: ordersCard.id,
              parameter_mappings: [
                {
                  parameter_id: locationFilter.id,
                  card_id: ordersCard.id,
                  target: ["dimension", ["field", PEOPLE.CITY, null]],
                },
                {
                  parameter_id: textFilter.id,
                  card_id: ordersCard.id,
                  target: ["dimension", ["field", PEOPLE.NAME, null]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard.id);
      });

      cy.log("verify filters are there");
      filterWidget().should("contain", "Location").and("contain", "Text");

      editDashboard();

      selectFilter("Location");

      getDashboardCard().contains("Person.State");
      getDashboardCard(1).contains("User.City");

      cy.log("Disconnect cards");
      sidebar().findByText("Disconnect from cards").click();

      getDashboardCard().should("not.contain", "Person.State");
      getDashboardCard(1).should("not.contain", "User.City");

      selectFilter("Text");

      getDashboardCard().should("contain", "Person.Name");
      getDashboardCard(1).should("contain", "User.Name");

      saveDashboard();

      filterWidget().should("contain", "Text").and("not.contain", "Location");
    });
  });

  describe("change parameter type", () => {
    it("should reset existing filter mappings", () => {
      createDashboardWithFilterAndQuestionMapped();

      selectFilter("Text");

      getDashboardCard().should("contain", "Person.Name");

      cy.log("change filter type");

      sidebar().findByDisplayValue("Text or Category").click();

      popover().findByText("Number").click();

      getDashboardCard().should("not.contain", "Person.Name");

      saveDashboard();

      filterWidget().should("not.exist");
    });

    it("should preselect default value for every type of filter", () => {
      createDashboardWithFilterAndQuestionMapped();

      selectFilter("Text");

      cy.log("verify Text default value: Is");
      sidebar().findByDisplayValue("Is").should("exist");

      sidebar().findByDisplayValue("Text or Category").click();
      popover().findByText("Number").click();

      cy.log("verify Number default value: Between");
      sidebar().findByDisplayValue("Between").should("exist");

      sidebar().findByDisplayValue("Number").click();
      popover().findByText("ID").click();

      cy.log("verify ID doesn't render operator select");
      sidebar().findAllByRole("searchbox").should("have.length", 1);

      sidebar().findByDisplayValue("ID").click();
      popover().findByText("Time").click();

      cy.log("verify Date default value: All Options");
      sidebar().findByDisplayValue("All Options").should("exist");

      sidebar().findByDisplayValue("Time").click();
      popover().findByText("Location").click();

      cy.log("verify Date default value: Is");
      sidebar().findByDisplayValue("Is").should("exist");
    });
  });

  describe("change parameter operator", () => {
    it("should not reset filter mappings", () => {
      createDashboardWithFilterAndQuestionMapped();

      selectFilter("Text");

      getDashboardCard().should("contain", "Person.Name");

      sidebar().findByDisplayValue("Is").click();

      popover().findByText("Contains").click();

      getDashboardCard().should("contain", "Person.Name");

      saveDashboard();

      filterWidget().should("contain", "Text");
    });
  });
});

function createDashboardWithFilterAndQuestionMapped() {
  const textFilter = createMockParameter({
    name: "Text",
    slug: "string",
    id: "5aefc726",
    type: "string/=",
    sectionId: "string",
  });

  const peopleQuestionDetails = {
    query: { "source-table": PEOPLE_ID, limit: 5 },
  };

  cy.createDashboardWithQuestions({
    dashboardDetails: {
      parameters: [textFilter],
    },
    questions: [peopleQuestionDetails],
  }).then(({ dashboard, questions: cards }) => {
    const [peopleCard] = cards;

    updateDashboardCards({
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: peopleCard.id,
          parameter_mappings: [
            {
              parameter_id: textFilter.id,
              card_id: peopleCard.id,
              target: ["dimension", ["field", PEOPLE.NAME, null]],
            },
          ],
        },
      ],
    });

    visitDashboard(dashboard.id);
  });

  editDashboard();
}

function selectFilter(name) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}
