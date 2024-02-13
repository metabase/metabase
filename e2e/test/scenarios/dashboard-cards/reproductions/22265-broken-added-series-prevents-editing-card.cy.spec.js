import { editDashboard, restore, visitDashboard } from "e2e/support/helpers";

const baseQuestion = {
  name: "Base question",
  display: "scalar",
  native: {
    query: "SELECT 1",
  },
};

const invalidQuestion = {
  name: "Invalid question",
  display: "scalar",
  native: {
    query: "SELECT 1",
  },
};

describe("issue 22265", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/card/*/series?limit=*").as("seriesQuery");
  });

  it("should allow editing dashcard series when added series are broken (metabase#22265)", () => {
    cy.createNativeQuestion(invalidQuestion, {
      wrapId: true,
      idAlias: "invalidQuestionId",
    });
    cy.createNativeQuestionAndDashboard({ questionDetails: baseQuestion }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
            },
          ],
        });

        cy.wrap(dashboard_id).as("dashboardId");
        visitDashboard(dashboard_id);
      },
    );

    editDashboard();
    cy.findByTestId("add-series-button").click({ force: true });
    cy.wait("@seriesQuery");

    cy.findByTestId("add-series-modal").within(() => {
      cy.icon("warning").should("not.exist");
      cy.findByLabelText(invalidQuestion.name).should("exist").click();
      cy.button("Done").click();
    });

    cy.button("Save").click();
    cy.button("Saving…").should("not.exist");

    cy.log("Update the added series' question so that it's broken");
    const questionDetailUpdate = {
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT --2",
          "template-tags": {},
        },
        database: 1,
      },
    };
    cy.get("@invalidQuestionId").then(invalidQuestionId => {
      cy.request("PUT", `/api/card/${invalidQuestionId}`, questionDetailUpdate);
    });

    visitDashboard("@dashboardId");
    editDashboard();
    cy.findByTestId("add-series-button").click({ force: true });
    cy.wait("@seriesQuery");

    cy.findByTestId("add-series-modal").within(() => {
      cy.findByLabelText(invalidQuestion.name).should("exist");
      cy.icon("warning").should("not.exist");
    });
  });
});
