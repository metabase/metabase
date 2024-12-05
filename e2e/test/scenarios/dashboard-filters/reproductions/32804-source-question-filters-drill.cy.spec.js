import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("issue 32804", () => {
  const question1Details = {
    name: "Q1",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    name: "Number",
    slug: "number",
    id: "27454068",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  const getQuestion2Details = card => ({
    name: "Q2",
    query: {
      "source-table": `card__${card.id}`,
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        "Gadget",
      ],
    },
  });

  const getParameterMapping = card => ({
    card_id: card.id,
    parameter_id: parameterDetails.id,
    target: [
      "dimension",
      ["field", PRODUCTS.RATING, { "base-type": "type/Integer" }],
    ],
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should retain source query filters when drilling-thru from a dashboard (metabase#32804)", () => {
    H.createQuestion(question1Details).then(({ body: card1 }) => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [getQuestion2Details(card1)],
      }).then(({ dashboard, questions: [card2] }) => {
        H.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: card2.id,
              parameter_mappings: [getParameterMapping(card2)],
            },
          ],
        });
        H.visitDashboard(dashboard.id, {
          params: { [parameterDetails.slug]: "4" },
        });
      });
    });
    H.filterWidget().findByText("4").should("be.visible");
    H.getDashboardCard(0).findByText("Q2").click();
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").should("be.visible");
      cy.findByText("Rating is equal to 4").should("be.visible");
    });
  });
});
