import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  updateDashboardCards,
  visitDashboard,
  filterWidget,
  editDashboard,
  setFilter,
  saveDashboard,
  selectDashboardFilter,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const filterDetails = {
  name: "ID Column",
  slug: "id",
  id: "11d79abe",
  type: "id",
  sectionId: "id",
};

const question1Details = {
  name: "Q1",
  query: { "source-table": PRODUCTS_ID, limit: 2 },
};

const question2Details = {
  name: "Q2",
  query: { "source-table": ORDERS_ID, limit: 2 },
};

const questionWithFilter = {
  name: "Question with Filter",
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    limit: 2,
    filter: [">", ["field", ORDERS.TOTAL, null], 100],
  },
};

const dashboardDetails = {
  name: "Filters",
  parameters: [filterDetails],
};

describe("issue 8030", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not reload dashboard cards not connected to a filter (metabase#8030)", () => {
    createQuestionsAndDashboard().then(
      ({ dashboard_id, card1_id, card2_id }) => {
        interceptRequests({ dashboard_id, card1_id, card2_id });
        setFilterMapping({ dashboard_id, card1_id, card2_id }).then(() => {
          cy.visit(`/dashboard/${dashboard_id}`);
          cy.wait("@getDashboard");
          cy.wait("@getCardQuery1");
          cy.wait("@getCardQuery2");

          cy.findByText(filterDetails.name).click();
          popover().within(() => {
            // the filter is connected only to the first card
            cy.get("input").type("1{enter}");
            cy.findByText("Add filter").click();
          });
          cy.wait("@getCardQuery1");
          cy.get("@getCardQuery1.all").should("have.length", 2);
          cy.get("@getCardQuery2.all").should("have.length", 1);
        });
      },
    );
  });
});

describe("issue 32444", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not reload dashboard cards not connected to a filter (metabase#32444)", () => {
    cy.createDashboardWithQuestions({
      questions: [question1Details, questionWithFilter],
    }).then(({ dashboard }) => {
      cy.intercept(
        "POST",
        `/api/dashboard/${dashboard.id}/dashcard/*/card/*/query`,
      ).as("getCardQuery");

      visitDashboard(dashboard.id);
      editDashboard(dashboard.id);

      cy.get("@getCardQuery.all").should("have.length", 2);

      setFilter("Text or Category", "Is");
      selectDashboardFilter(cy.findAllByTestId("dashcard").first(), "Title");
      cy.findAllByTestId("dashcard")
        .eq(1)
        .findByLabelText("Disconnect")
        .click();

      saveDashboard();

      cy.wait("@getCardQuery");
      cy.get("@getCardQuery.all").should("have.length", 4);

      addFilterValue("Aerodynamic Bronze Hat");

      cy.wait("@getCardQuery");
      cy.get("@getCardQuery.all").should("have.length", 5);
    });
  });
});

const createQuestionsAndDashboard = () => {
  return cy
    .createQuestion(question1Details)
    .then(({ body: { id: card1_id } }) => {
      return cy
        .createQuestion(question2Details)
        .then(({ body: { id: card2_id } }) => {
          return cy
            .createDashboard(dashboardDetails)
            .then(({ body: { id: dashboard_id } }) => {
              return { dashboard_id, card1_id, card2_id };
            });
        });
    });
};

const setFilterMapping = ({ dashboard_id, card1_id, card2_id }) => {
  return updateDashboardCards({
    dashboard_id,
    cards: [
      {
        card_id: card1_id,
        row: 0,
        col: 0,
        size_x: 5,
        size_y: 4,
        parameter_mappings: [
          {
            parameter_id: filterDetails.id,
            card_id: card1_id,
            target: ["dimension", ["field", PRODUCTS.ID, null]],
          },
        ],
      },
      {
        card_id: card2_id,
        row: 0,
        col: 4,
        size_x: 5,
        size_y: 4,
        parameter_mappings: [
          {
            parameter_id: filterDetails.id,
            card_id: card1_id,
            target: ["dimension", ["field", ORDERS.ID, null]],
          },
        ],
      },
    ].filter(Boolean),
  });
};

const interceptRequests = ({ dashboard_id, card1_id, card2_id }) => {
  cy.intercept("GET", `/api/dashboard/${dashboard_id}`).as("getDashboard");
  cy.intercept(
    "POST",
    `/api/dashboard/${dashboard_id}/dashcard/*/card/${card1_id}/query`,
  ).as("getCardQuery1");
  cy.intercept(
    "POST",
    `/api/dashboard/${dashboard_id}/dashcard/*/card/${card2_id}/query`,
  ).as("getCardQuery2");
};

function addFilterValue(value) {
  filterWidget().click();
  cy.findByText(value).click();
  cy.button("Add filter").click();
}
