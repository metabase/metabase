import {
  dashboardHeader,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  rightSidebar,
  undoToast,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Products table",
  query: { "source-table": PRODUCTS_ID },
};

const filter = {
  name: "Category",
  slug: "category",
  id: "2a12e66c",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [filter],
};

const toastTimeout = 20000;

describe("scenarios > dashboards > filters > auto apply", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
  });

  it("should display a toast when a dashboard takes longer than 15s to load", () => {
    cy.clock();
    createDashboard();
    visitSlowDashboard({ [filter.slug]: "Gadget" });

    cy.tick(toastTimeout);
    cy.wait("@cardQuery");
    undoToast().within(() => {
      cy.button("Turn off").click();
      cy.wait("@updateDashboard");
    });
    dashboardHeader().within(() => {
      cy.icon("info").click();
    });
    rightSidebar().within(() => {
      cy.findByLabelText("Auto-apply filters").should("not.be.checked");
    });
    filterWidget().within(() => {
      cy.findByText("Gadget").should("be.visible");
    });
  });

  it("should not display the toast when auto applying filters is disabled", () => {
    cy.clock();
    createDashboard({ auto_apply_filters: false });
    visitSlowDashboard({ [filter.slug]: "Gadget" });

    cy.tick(toastTimeout);
    cy.wait("@cardQuery");
    undoToast().should("not.exist");
  });

  it("should not display the toast if there are no parameter values", () => {
    cy.clock();
    createDashboard();
    visitSlowDashboard();

    cy.tick(toastTimeout);
    cy.wait("@cardQuery");
    undoToast().should("not.exist");
  });

  it("should not display the same toast twice for a dashboard", () => {
    cy.clock();
    createDashboard();
    visitSlowDashboard({ [filter.slug]: "Gadget" });

    cy.tick(toastTimeout);
    cy.wait("@cardQuery");
    undoToast().within(() => {
      cy.button("Turn off").should("be.visible");
      cy.icon("close").click();
    });
    filterWidget().within(() => {
      cy.findByText("Gadget").click();
    });
    popover().within(() => {
      cy.findByText("Widget").click();
      cy.findByText("Update filter").click();
    });

    cy.tick(toastTimeout);
    cy.wait("@cardQuery");
    undoToast().should("not.exist");
  });
});

const createDashboard = (dashboardOpts = {}) => {
  cy.createQuestionAndDashboard({
    questionDetails,
    dashboardDetails: { ...dashboardDetails, ...dashboardOpts },
  }).then(({ body: card }) => {
    cy.editDashboardCard(card, getParameterMapping(card));
    cy.wrap(card.dashboard_id).as("dashboardId");
  });
};

const getParameterMapping = ({ card_id }) => ({
  parameter_mappings: [
    {
      card_id,
      parameter_id: filter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ],
});

const visitSlowDashboard = (params = {}) => {
  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
    return Cypress.Promise.delay().then(() => req.reply());
  }).as("cardQuery");

  cy.get("@dashboardId").then(dashboardId => {
    return cy.visit({
      url: `/dashboard/${dashboardId}`,
      qs: params,
    });
  });

  getDashboardCard().should("be.visible");
};
