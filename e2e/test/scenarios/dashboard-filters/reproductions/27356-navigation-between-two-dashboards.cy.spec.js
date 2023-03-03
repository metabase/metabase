import {
  restore,
  openNavigationSidebar,
  visitDashboard,
} from "e2e/support/helpers";

const ratingFilter = {
  name: "Text",
  slug: "text",
  id: "5dfco74e",
  type: "string/=",
  sectionId: "string",
};

const paramDashboard = {
  name: "Dashboard With Params",
  parameters: [ratingFilter],
};

const regularDashboard = {
  name: "Dashboard Without Params",
};

describe("issue 27356", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    restore();
    cy.signInAsAdmin();

    cy.createDashboard(paramDashboard).then(({ body: { id } }) => {
      cy.request("POST", `/api/bookmark/dashboard/${id}`);
    });

    cy.createDashboard(regularDashboard).then(({ body: { id } }) => {
      cy.request("POST", `/api/bookmark/dashboard/${id}`);
      visitDashboard(id);
    });
  });

  it("should seamlessly move between dashboards with or without filters without triggering an error (metabase#27356)", () => {
    openNavigationSidebar();

    cy.findByText(paramDashboard.name).click();
    cy.findByText("This dashboard is looking empty.");

    cy.findByText(regularDashboard.name).click();
    cy.findByText("This dashboard is looking empty.");

    cy.findByText(paramDashboard.name).click();
    cy.findByText("This dashboard is looking empty.");
  });
});
