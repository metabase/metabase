import {
  restore,
  visitDashboard,
  editDashboard,
  saveDashboard,
} from "__support__/e2e/cypress";

const Q1 = {
  name: "21665 Q1",
  native: { query: "select 1" },
  display: "scalar",
};

const Q2 = {
  name: "21665 Q2",
  native: { query: "select 2" },
  display: "scalar",
};

describe.skip("issue 21665", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails: Q1,
      dashboardDetails: { name: "21665D" },
    }).then(({ body: { id } }) => {
      cy.intercept(
        "GET",
        `/api/dashboard/${id}`,
        cy.spy().as("dashboardLoaded"),
      ).as("getDashboard");

      cy.wrap(id).as("dashboardId");

      cy.createNativeQuestion(Q2);

      visitDashboard(id);
      editDashboard();
    });

    cy.findByTestId("add-series-button").click({ force: true });

    cy.findByText(Q2.name).click();

    cy.get(".AddSeriesModal").within(() => {
      cy.button("Done").click();
    });

    saveDashboard();
    cy.wait("@getDashboard");
  });

  it("multi-series cards shouldnt cause frontend to reload (metabase#21665)", () => {
    editQ2NativeQuery("select --");

    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
    });

    /**
     * WARNING!
     * Until this issue gets resolved, you will have to manually stop this test EVEN AFTER IT FAILS!
     * It will send your browser in the infinite loop and can eventually freeze your browser or even the whole system if left unattended.
     *
     * TODO:
     * Once this issue gets fixed, please remove the arbitrary wait and replace it with the positive assertion.
     */

    cy.wait(1000);

    cy.get("@dashboardLoaded").should("have.been.calledThrice");
  });
});

function editQ2NativeQuery(query) {
  cy.request("PUT", "/api/card/5", {
    dataset_query: {
      type: "native",
      native: { query },
      database: 1,
    },
  });
}
