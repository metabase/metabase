import { restore, visitDashboard, filterWidget } from "e2e/support/helpers";

const questionDetails = {
  name: "25374",
  native: {
    "template-tags": {
      num: {
        id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
        name: "num",
        "display-name": "Num",
        type: "number",
        default: null,
      },
    },
    query: "select count(*) from orders where id in ({{num}})",
  },
  parameters: [
    {
      id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
      type: "number/=",
      target: ["variable", ["template-tag", "num"]],
      name: "Num",
      slug: "num",
      default: null,
    },
  ],
};

const filterDetails = {
  name: "Equal to",
  slug: "equal_to",
  id: "10c0d4ba",
  type: "number/=",
  sectionId: "number",
};

const dashboardDetails = {
  name: "25374D",
  parameters: [filterDetails],
};

describe("issue 25374", () => {
  beforeEach(() => {
    cy.intercept("POST", `/api/card/*/query`).as("cardQuery");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      // Connect filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: filterDetails.id,
                card_id,
                target: ["variable", ["template-tag", "num"]],
              },
            ],
          },
        ],
      });

      visitDashboard(dashboard_id);

      filterWidget().type("1,2,3{enter}");
      cy.findByDisplayValue("1,2,3");

      cy.get(".CardVisualization")
        .should("contain", "COUNT(*)")
        .and("contain", "3");

      cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    });
  });

  it("should pass comma-separated values down to the connected question (metabase#25374-1)", () => {
    // Drill-through and go to the question
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    cy.get(".cellData").should("contain", "COUNT(*)").and("contain", "3");

    cy.location("search").should("eq", "?num=1%2C2%2C3");
  });

  it("should retain comma-separated values on refresh (metabase#25374-2)", () => {
    cy.reload();

    // Make sure filter widget still has all the values
    cy.findByDisplayValue("1,2,3");

    // Make sure the result in the card is correct
    cy.get(".CardVisualization")
      .should("contain", "COUNT(*)")
      .and("contain", "3");

    // Make sure URL search params are correct
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
  });
});
