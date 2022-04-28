import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const filterDetails = {
  name: "ID",
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
};

describe("issue 22197", () => {
  beforeEach(() => {
    restore();
  });

  it("should not reload cards in a dashboard when corresponding filters are not changed (metabase#22197)", () => {
    createDashboard().then(({ dashboard_id }) => {
      cy.visit(`/dashboard/${dashboard_id}`);
      cy.wait("@getDashboard");
      cy.wait("@getCardQuery1");
      cy.wait("@getCardQuery2");
    });
  });
});

const createDashboard = () => {
  return cy
    .createDashboard(dashboardDetails)
    .then(({ body: { id: dashboard_id } }) => {
      cy.createQuestion(question1Details).then(({ body: { id: card1_id } }) => {
        cy.createQuestion(question2Details).then(
          ({ body: { id: card2_id } }) => {
            cy.addFilterToDashboard({
              filter: filterDetails,
              dashboard_id,
            });

            cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
              cardId: card1_id,
              sizeX: 8,
              sizeY: 6,
              parameter_mappings: [
                {
                  parameter_id: filterDetails.id,
                  card_id: card1_id,
                  target: ["dimension", ["field", PRODUCTS.ID, null]],
                },
              ],
            });

            cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
              cardId: card2_id,
              sizeX: 8,
              sizeY: 6,
              parameter_mappings: [
                {
                  parameter_id: filterDetails.id,
                  card_id: card1_id,
                  target: ["dimension", ["field", ORDERS.ID, null]],
                },
              ],
            });

            cy.intercept("GET", `/api/dashboard/${dashboard_id}`).as(
              "getDashboard",
            );

            cy.intercept(
              "POST",
              `/api/dashboard/${dashboard_id}/dashcard/*/card/${card1_id}/query`,
            ).as("getCardQuery1");

            cy.intercept(
              "POST",
              `/api/dashboard/${dashboard_id}/dashcard/*/card/${card2_id}/query`,
            ).as("getCardQuery2");

            return { dashboard_id };
          },
        );
      });
    });
};
