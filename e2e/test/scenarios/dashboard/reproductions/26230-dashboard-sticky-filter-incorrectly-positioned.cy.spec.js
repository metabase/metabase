import { merge } from "icepick";
import { restore } from "e2e/support/helpers";

describe("issue 26230", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show dashboard header when navigate from the end of other long dashboard (metabase#26230)", () => {
    prepareAndVisitDashboards();

    cy.findByRole("main").scrollTo("bottom");
    cy.button("Toggle sidebar").click();
    cy.findByRole("main").within(() => {
      cy.findByDisplayValue("dashboard with a tall card 2").should(
        "not.be.visible",
      );
    });

    cy.findByRole("listitem", { name: "dashboard with a tall card" }).click();
    cy.findByRole("main").within(() => {
      cy.findByDisplayValue("dashboard with a tall card").should("be.visible");
    });
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
    cy.request(
      "POST",
      `/api/dashboard/${id}/cards`,
      createTextDashcard({
        col: 0,
        row: 0,
        size_x: 4,
        size_y: 20,
        visualization_settings: {
          text: "I am a tall card",
        },
      }),
    );
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
    cy.request(
      "POST",
      `/api/dashboard/${id}/cards`,
      createTextDashcard({
        col: 0,
        row: 0,
        size_x: 4,
        size_y: 20,
        visualization_settings: {
          text: "I am a tall card",
        },
      }),
    );
    bookmarkDashboard(id);
    cy.visit(`/dashboard/${id}`);
  });
}

function bookmarkDashboard(dashboardId) {
  cy.request("POST", `/api/bookmark/dashboard/${dashboardId}`);
}

/**
 *
 * @param {Partial<import('metabase-types/api').DashboardOrderedCard>} dashcardDetails
 * @returns
 */
function createTextDashcard(dashcardDetails) {
  const defaultDashcardDetails = {
    cardId: null,
    col: 0,
    row: 0,
    size_x: 4,
    size_y: 3,
    series: [],
    parameter_mappings: [],
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "text",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      text: "Edit me",
    },
  };

  return merge(defaultDashcardDetails, dashcardDetails);
}
