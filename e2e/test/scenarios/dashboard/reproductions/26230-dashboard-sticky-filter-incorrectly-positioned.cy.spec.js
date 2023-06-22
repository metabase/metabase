import {
  addOrUpdateDashboardCard,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

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

function prepareAndVisitDashboards() {
  cy.createDashboard({
    name: "dashboard with a tall card",
    parameters: [
      {
        id: "12345678",
        name: "Text",
        slug: "text",
        type: "string/=",
        sectionId: "string",
      },
    ],
  }).then(({ body: { id } }) => {
    createTextDashcard(id);
    bookmarkDashboard(id);
  });

  cy.createDashboard({
    name: "dashboard with a tall card 2",
    parameters: [
      {
        id: "87654321",
        name: "Text",
        slug: "text",
        type: "string/=",
        sectionId: "string",
      },
    ],
  }).then(({ body: { id } }) => {
    createTextDashcard(id);
    bookmarkDashboard(id);
    visitDashboard(id);
  });
}

function bookmarkDashboard(dashboardId) {
  cy.request("POST", `/api/bookmark/dashboard/${dashboardId}`);
}

function createTextDashcard(id) {
  addOrUpdateDashboardCard({
    dashboard_id: id,
    card_id: null,
    card: {
      size_x: 5,
      size_y: 20,
      visualization_settings: {
        virtual_card: {
          name: null,
          display: "text",
          visualization_settings: {},
          dataset_query: {},
          archived: false,
        },
        text: "I am a tall card",
      },
    },
  });
}
