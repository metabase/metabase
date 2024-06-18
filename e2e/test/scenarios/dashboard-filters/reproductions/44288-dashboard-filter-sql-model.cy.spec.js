import {
  createNativeQuestion,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  selectDashboardFilter,
  updateDashboardCards,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
} from "e2e/support/helpers";

describe.skip("issue 44288", () => {
  const modelDetails = {
    name: "SQL model",
    type: "model",
    native: { query: "SELECT * FROM PRODUCTS" },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "27454068",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function mapFilter() {
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText(parameterDetails.name)
      .click();
    selectDashboardFilter(getDashboardCard(), "CATEGORY");
  }

  function verifyFilter() {
    filterWidget().click();
    popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Gadget");
      cy.button("Add filter").click();
    });
    getDashboardCard().within(() => {
      cy.findAllByText("Gadget").should("have.length.above", 1);
      cy.findByText("Doohickey").should("not.exist");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Widget").should("not.exist");
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    createNativeQuestion(modelDetails).then(({ body: card }) => {
      cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
        updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [{ card_id: card.id }],
        });
        cy.wrap(dashboard.id).as("dashboardId");
      });
    });
    cy.signOut();
  });

  it("should allow filtering a SQL model in a dashboard (metabase#44288)", () => {
    cy.log("regular dashboards");
    cy.signInAsNormalUser();
    visitDashboard("@dashboardId");
    editDashboard();
    mapFilter();
    saveDashboard();
    verifyFilter();
    cy.signOut();

    cy.log("public dashboards");
    cy.signInAsAdmin();
    cy.get("@dashboardId").then(dashboardId =>
      visitPublicDashboard(dashboardId),
    );
    verifyFilter();

    cy.log("embedded dashboards");
    cy.get("@dashboardId").then(dashboardId =>
      visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    verifyFilter();
  });
});
