import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { restore, visitDashboard } from "e2e/support/helpers";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

describe("issue 26230", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    prepareAndVisitDashboards();
  });

  it("should not preserve the sticky filter behavior when navigating to the second dashboard (metabase#26230)", () => {
    cy.findByRole("main").scrollTo("bottom"); // This line is essential for the reproduction!

    cy.button("Toggle sidebar").click();
    cy.findByRole("main")
      .findByDisplayValue("dashboard with a tall card 2")
      .should("not.be.visible");

    cy.findByTestId("dashboard-parameters-widget-container").should(
      "have.css",
      "position",
      "sticky",
    );

    cy.intercept("GET", "/api/dashboard/*").as("loadDashboard");
    cy.findByRole("listitem", { name: "dashboard with a tall card" }).click();
    cy.wait("@loadDashboard");
  });
});

const FILTER_1 = {
  id: "12345678",
  name: "Text",
  slug: "text",
  type: "string/=",
  sectionId: "string",
};

const FILTER_2 = {
  id: "87654321",
  name: "Text",
  slug: "text",
  type: "string/=",
  sectionId: "string",
};

function prepareAndVisitDashboards() {
  cy.createDashboard({
    name: "dashboard with a tall card",
    parameters: [FILTER_1],
  }).then(({ body: { id } }) => {
    createDashCard(id, FILTER_1);
    bookmarkDashboard(id);
  });

  cy.createDashboard({
    name: "dashboard with a tall card 2",
    parameters: [FILTER_2],
  }).then(({ body: { id } }) => {
    createDashCard(id, FILTER_2);
    bookmarkDashboard(id);
    visitDashboard(id);
  });
}

function bookmarkDashboard(dashboardId) {
  cy.request("POST", `/api/bookmark/dashboard/${dashboardId}`);
}

function createDashCard(dashboardId, mappedFilter) {
  cy.request("PUT", `/api/dashboard/${dashboardId}`, {
    dashcards: [
      createMockDashboardCard({
        id: -dashboardId,
        dashboard_id: dashboardId,
        size_x: 5,
        size_y: 20,
        card_id: ORDERS_QUESTION_ID,
        parameter_mappings: [
          {
            parameter_id: mappedFilter.id,
            card_id: ORDERS_QUESTION_ID,
            target: [
              "dimension",
              [
                "field",
                PEOPLE.NAME,
                { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
              ],
            ],
          },
        ],
      }),
    ],
  });
}
