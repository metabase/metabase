import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createMockParameter } from "metabase-types/api/mocks";

const { PEOPLE, PEOPLE_ID, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > management", () => {
  beforeEach(() => {
    cy.restore();
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

        cy.updateDashboardCards({
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

        cy.visitDashboard(dashboard.id);
      });

      cy.log("verify filters are there");
      cy.filterWidget().should("contain", "Location").and("contain", "Text");

      cy.editDashboard();

      selectFilter("Location");

      cy.getDashboardCard().contains("People.State");
      cy.getDashboardCard(1).contains("User.City");

      cy.log("Disconnect cards");
      cy.sidebar().findByText("Disconnect from cards").click();

      cy.getDashboardCard().should("not.contain", "People.State");
      cy.getDashboardCard(1).should("not.contain", "User.City");

      selectFilter("Text");

      cy.getDashboardCard().should("contain", "People.Name");
      cy.getDashboardCard(1).should("contain", "User.Name");

      cy.saveDashboard();

      cy.filterWidget()
        .should("contain", "Text")
        .and("not.contain", "Location");
    });
  });

  describe("change parameter type", () => {
    it("should reset existing filter mappings and default value", () => {
      createDashboardWithFilterAndQuestionMapped();

      selectFilter("Text");

      cy.getDashboardCard().should("contain", "People.Name");

      cy.log("change filter type");

      cy.sidebar().within(() => {
        // verifies default value presents
        cy.findByText("value to check default").should("exist");
        cy.findByDisplayValue("Text or Category").click();
      });

      cy.popover().findByText("Number").click();

      cy.sidebar().within(() => {
        // verifies no default value
        cy.findByText("No default").should("exist");
      });
      cy.getDashboardCard().should("not.contain", "People.Name");

      cy.saveDashboard();

      cy.filterWidget().should("not.exist");
    });

    it("should preselect default value for every type of filter", () => {
      createDashboardWithFilterAndQuestionMapped();

      selectFilter("Text");

      cy.log("verify Text default value: Is");
      cy.sidebar().findByDisplayValue("Is").should("exist");

      changeFilterType("Number");

      cy.log("verify Number default value: Between");
      verifyOperatorValue("Equal to");

      changeFilterType("ID");

      cy.log("verify ID doesn't render operator select");
      cy.sidebar().findAllByRole("searchbox").should("have.length", 1);

      changeFilterType("Date picker");

      cy.log("verify Date default value: All Options");
      verifyOperatorValue("All Options");

      changeFilterType("Location");

      cy.log("verify Date default value: Is");
      verifyOperatorValue("Is");
    });

    it("should use saved parameter value when user switches back to the saved filter type", () => {
      const textFilter = createMockParameter({
        name: "Text Text",
        slug: "string",
        id: "5aefc726",
        type: "string/does-not-contain",
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

        cy.updateDashboardCards({
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

        cy.visitDashboard(dashboard.id);
      });

      cy.editDashboard();

      selectFilter("Text Text");

      cy.sidebar().findByDisplayValue("Does not contain").should("exist");

      changeFilterType("Number");

      // default value for a number type
      cy.sidebar().findByDisplayValue("Equal to").should("exist");

      changeFilterType("Text or Category");

      cy.log("verify the saved parameter value is restored");
      cy.sidebar().within(() => {
        cy.findByDisplayValue("Does not contain").should("exist");
        cy.findByDisplayValue("Text or Category").should("exist");
        cy.findByDisplayValue("Text Text").should("exist");
      });
    });

    it("should restore parameter mappings when user switches back to the saved parameter type", () => {
      const textFilter = createMockParameter({
        name: "Text Text",
        slug: "string",
        id: "5aefc726",
        type: "string/does-not-contain",
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

        cy.updateDashboardCards({
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

        cy.visitDashboard(dashboard.id);
      });

      cy.editDashboard();

      selectFilter("Text Text");

      cy.sidebar().findByDisplayValue("Does not contain").should("exist");

      cy.getDashboardCard().should("contain", "People.Name");

      changeFilterType("Number");

      cy.log("verify that mapping is cleared");
      cy.getDashboardCard().should("not.contain", "People.Name");

      changeFilterType("Text or Category");

      cy.log("verify that mapping is restored");
      cy.getDashboardCard().should("contain", "People.Name");
    });
  });

  describe("change parameter operator", () => {
    it("should not reset filter mappings, but reset default value", () => {
      createDashboardWithFilterAndQuestionMapped();

      selectFilter("Text");

      // verifies default value is there
      cy.sidebar().findByText("value to check default").should("exist");

      cy.getDashboardCard().should("contain", "People.Name");

      changeOperator("Contains");

      cy.getDashboardCard().should("contain", "People.Name");

      // verifies default value does not exist
      cy.sidebar().findByText("No default").should("exist");

      cy.saveDashboard();

      cy.filterWidget().should("contain", "Text");
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
    default: "value to check default",
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

    cy.updateDashboardCards({
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

    cy.visitDashboard(dashboard.id);
  });

  cy.editDashboard();
}

function selectFilter(name) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function changeFilterType(type) {
  cy.sidebar().findByText("Filter or parameter type").next().click();
  cy.popover().findByText(type).click();
}

function changeOperator(operator) {
  cy.sidebar().findByText("Filter operator").next().click();
  cy.popover().findByText(operator).click();
}

function verifyOperatorValue(value) {
  cy.sidebar()
    .findByText("Filter operator")
    .next()
    .findByRole("searchbox")
    .should("have.value", value);
}
