import {
  restore,
  visitEmbeddedPage,
  visitDashboard,
  visitQuestion,
} from "e2e/support/helpers";

const dashboardFilter = {
  name: "Equal to",
  slug: "equal_to",
  id: "c269ebe1",
  type: "number/=",
  sectionId: "number",
};

const dashboardDetails = {
  name: "25031",
  parameters: [dashboardFilter],
};

const defaultFilterValues = [undefined, "10"];

defaultFilterValues.forEach(value => {
  const conditionalPartOfTestTitle = value
    ? "and the required filter with the default value"
    : "";

  describe("issues 20845, 25031", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/card/*").as("publishChanges");

      restore();
      cy.signInAsAdmin();

      const questionDetails = getQuestionDetails(value);

      cy.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, dashboard_id, card_id } }) => {
        cy.wrap(card_id).as("questionId");
        cy.wrap(dashboard_id).as("dashboardId");

        visitQuestion(card_id);

        // Connect dashbaord filter to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              card_id,
              id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["variable", ["template-tag", "qty_locked"]],
                },
              ],
            },
          ],
        });
      });
    });

    it(`QUESTION: locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#20845)`, () => {
      cy.get("@questionId").then(questionId => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            qty_locked: "locked",
          },
        });

        // This issue is not possible to reproduce using UI from this point on.
        // We have to manually send the payload in order to make sure it works for both strings and integers.
        ["string", "integer"].forEach(type => {
          cy.log(
            `Make sure it works with ${type.toUpperCase()} in the payload`,
          );

          visitEmbeddedPage({
            resource: { question: questionId },
            params: {
              qty_locked: type === "string" ? "15" : 15, // IMPORTANT: integer
            },
          });
        });

        cy.findByTestId("column-header").should("contain", "COUNT(*)");
        cy.findByTestId("cell-data").should("contain", "5");
      });
    });

    it(`DASHBOARD: locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#25031)`, () => {
      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId);
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
          embedding_params: {
            [dashboardFilter.slug]: "locked",
          },
        });

        // This issue is not possible to reproduce using UI from this point on.
        // We have to manually send the payload in order to make sure it works for both strings and integers.
        ["string", "integer"].forEach(type => {
          cy.log(
            `Make sure it works with ${type.toUpperCase()} in the payload`,
          );

          const payload = {
            resource: { dashboard: dashboardId },
            params: {
              [dashboardFilter.slug]: type === "string" ? "15" : 15, // IMPORTANT: integer
            },
          };

          visitEmbeddedPage(payload);

          // wait for the results to load
          cy.contains(dashboardDetails.name);
          cy.get(".CardVisualization")
            .should("contain", "COUNT(*)")
            .and("contain", "5");
        });
      });
    });
  });
});

/**
 * @param {string} defaultValue - The default value for the defined filter
 * @returns object
 */
function getQuestionDetails(defaultValue = undefined) {
  return {
    name: "20845",
    native: {
      "template-tags": {
        qty_locked: {
          id: "6bd8d7be-bd5b-382c-cfa2-683461891663",
          name: "qty_locked",
          "display-name": "Qty locked",
          type: "number",
          required: defaultValue ? true : false,
          default: defaultValue,
        },
      },
      query:
        "select count(*) from orders where true [[AND quantity={{qty_locked}}]]",
    },
  };
}
