import {
  dashboardHeader,
  filterWidget,
  getDashboardCard,
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

const dashboardFilter = {
  name: "Category",
  slug: "category",
  id: "2a12e66c",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [dashboardFilter],
};

const toastTimeout = 20000;

describe("scenarios > dashboards > filters > auto apply", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    createDashboard();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
  });

  it("should display toasts when a dashboard takes longer than 15s to load", () => {
    visitSlowDashboard({
      [dashboardFilter.slug]: "Gadget",
    });

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
});

const createDashboard = () => {
  cy.createQuestionAndDashboard({
    questionDetails,
    dashboardDetails,
  }).then(({ body: card }) => {
    cy.editDashboardCard(card, getParameterMapping(card));
    cy.wrap(card.dashboard_id).as("dashboardId");
  });
};

const getParameterMapping = ({ card_id }) => ({
  parameter_mappings: [
    {
      card_id,
      parameter_id: dashboardFilter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ],
});

const visitSlowDashboard = params => {
  cy.clock();

  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
    return Cypress.Promise.delay().then(() => req.reply());
  });

  cy.get("@dashboardId").then(dashboardId => {
    return cy.visit({
      url: `/dashboard/${dashboardId}`,
      qs: params,
    });
  });

  getDashboardCard().should("be.visible");
  cy.tick(toastTimeout);
};
