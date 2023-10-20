import {
  restore,
  visitAlias,
  popover,
  filterWidget,
  queryBuilderHeader,
  queryBuilderMain,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "18061",
  query: {
    "source-table": PEOPLE_ID,
    expressions: {
      CClat: [
        "case",
        [
          [
            [">", ["field", PEOPLE.ID, null], 1],
            ["field", PEOPLE.LATITUDE, null],
          ],
        ],
      ],
      CClong: [
        "case",
        [
          [
            [">", ["field", PEOPLE.ID, null], 1],
            ["field", PEOPLE.LONGITUDE, null],
          ],
        ],
      ],
    },
    filter: ["<", ["field", PEOPLE.ID, null], 3],
  },
  display: "map",
  visualization_settings: {
    "map.latitude_column": "CClat",
    "map.longitude_column": "CClong",
  },
};

const filter = {
  name: "Category",
  slug: "category",
  id: "749a03b5",
  type: "category",
};

const dashboardDetails = { name: "18061D", parameters: [filter] };

describe("issue 18061", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id, card_id } = dashboardCard;

        // Enable sharing
        cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`).then(
          ({ body: { uuid } }) => {
            cy.wrap(`/public/dashboard/${uuid}`).as("publicLink");
          },
        );

        cy.wrap(`/question/${card_id}`).as(`questionUrl`);
        cy.wrap(`/dashboard/${dashboard_id}`).as(`dashboardUrl`);

        cy.intercept("POST", `/api/card/${card_id}/query`).as("cardQuery");
        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
        ).as("dashCardQuery");
        cy.intercept("GET", `/api/card/${card_id}`).as("getCard");

        const mapFilterToCard = {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: ["dimension", ["field", PEOPLE.SOURCE, null]],
            },
          ],
        };

        cy.editDashboardCard(dashboardCard, mapFilterToCard);
      },
    );
  });

  context("scenario 1: question with a filter", () => {
    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061-1)", () => {
      visitAlias("@questionUrl");

      cy.wait("@getCard");
      cy.wait("@cardQuery");

      cy.window().then(w => (w.beforeReload = true));

      queryBuilderHeader().findByTestId("filters-visibility-control").click();
      cy.findByTestId("qb-filters-panel")
        .findByText("ID is less than 3")
        .click();
      popover().within(() => {
        cy.findByDisplayValue("3").type("{backspace}2");
        cy.button("Update filter").click();
      });

      queryBuilderMain().findByText("Something went wrong").should("not.exist");

      cy.findByTestId("qb-filters-panel")
        .findByText("ID is less than 2")
        .should("be.visible");
      cy.get(".PinMap").should("be.visible");

      cy.window().should("have.prop", "beforeReload", true);
    });
  });

  context("scenario 2: dashboard with a filter", () => {
    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061-2)", () => {
      visitAlias("@dashboardUrl");

      cy.wait("@dashCardQuery");

      addFilter("Twitter");

      cy.wait("@dashCardQuery");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Something went wrong").should("not.exist");

      cy.location("search").should("eq", "?category=Twitter");
    });
  });

  context("scenario 3: publicly shared dashboard with a filter", () => {
    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061-3)", () => {
      visitAlias("@publicLink");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18061D");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18061");
      cy.get(".PinMap");

      addFilter("Twitter");
      cy.location("search").should("eq", "?category=Twitter");
      cy.findAllByTestId("no-results-image");
      cy.get(".PinMap").should("not.exist");
    });
  });
});

function addFilter(filter) {
  filterWidget().click();
  popover().contains(filter).click();
  cy.button("Add filter").click();
}
