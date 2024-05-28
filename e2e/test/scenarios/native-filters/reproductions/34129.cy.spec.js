import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS } = SAMPLE_DATABASE;

const parameter = {
  name: "Relative Date",
  slug: "relative_date",
  id: "3952592",
  type: "date/relative",
  sectionId: "date",
};

const templateTag = {
  type: "dimension",
  name: "time",
  id: "301a329f-5a83-40df-898b-236078025cbe",
  "display-name": "Time",
  dimension: ["field", ORDERS.CREATED_AT, null],
  "widget-type": "date/month-year",
};

const questionDetails = {
  name: "issue 34129",
  native: {
    query:
      "select min(CREATED_AT), max(CREATED_AT), count(*) from ORDERS where {{ time }}",
    "template-tags": {
      [templateTag.name]: templateTag,
    },
  },
};

const dashboardDetails = {
  parameters: [parameter],
};

const getParameterMapping = (cardId, parameterId) => ({
  card_id: cardId,
  parameter_id: parameterId,
  target: ["dimension", ["template-tag", templateTag.name]],
});

describe("issue 34129", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("/api/card/*/query").as("cardQuery");
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should support mismatching date filter parameter values when navigating from a dashboard (metabase#34129)", () => {
    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: card }) => {
      const { card_id, dashboard_id } = card;
      const mapping = getParameterMapping(card_id, parameter.id);
      cy.editDashboardCard(card, { parameter_mappings: [mapping] });
      visitDashboard(dashboard_id);
      cy.wait("@dashcardQuery");
    });

    filterWidget().click();
    popover().findByText("Today").click();
    cy.wait("@dashcardQuery");

    getDashboardCard().findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    filterWidget().findByText("Today").should("exist");
  });
});
