import {
  editDashboard,
  modal,
  restore,
  visitDashboard,
  visitQuestion,
} from "e2e/support/helpers";

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
    query: "SELECT --1",
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
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
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
      cy.findByLabelText(invalidQuestion.name).should("exist");
      cy.icon("warning").should("not.exist");
      cy.button("Done").click();
    });

    cy.button("Save").click();
    cy.button("Saving…").should("not.exist");

    cy.get("@invalidQuestionId").then(invalidQuestionId => {
      visitQuestion(invalidQuestionId);
      cy.icon("expand").click();
      cy.get(".ace_content").type("{backspace}--2");
      cy.findByTestId("native-query-editor-sidebar")
        .button("Get Answer")
        .click();
      cy.findByText("Save").click();
    });

    modal().findByText("Save").click();

    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
    });

    editDashboard();
    cy.findByTestId("add-series-button").click({ force: true });
    cy.wait("@seriesQuery");

    cy.findByTestId("add-series-modal").within(() => {
      cy.findByLabelText(invalidQuestion.name).should("exist");
      cy.icon("warning").should("not.exist");
    });
  });
});
