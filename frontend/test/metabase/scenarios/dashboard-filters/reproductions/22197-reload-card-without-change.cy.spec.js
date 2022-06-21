import { restore, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

const dashboardDetails = {
  name: "Filters",
  parameters: [filterDetails],
};

describe("issue 22197", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not reload cards in a dashboard when corresponding filters are not changed (metabase#22197)", () => {
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
  return cy
    .request("POST", `/api/dashboard/${dashboard_id}/cards`, {
      cardId: card1_id,
      row: 0,
      col: 0,
      sizeX: 4,
      sizeY: 4,
      parameter_mappings: [
        {
          parameter_id: filterDetails.id,
          card_id: card1_id,
          target: ["dimension", ["field", PRODUCTS.ID, null]],
        },
      ],
    })
    .then(() => {
      return cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
        cardId: card2_id,
        row: 0,
        col: 4,
        sizeX: 4,
        sizeY: 4,
        parameter_mappings: [
          {
            parameter_id: filterDetails.id,
            card_id: card1_id,
            target: ["dimension", ["field", ORDERS.ID, null]],
          },
        ],
      });
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
