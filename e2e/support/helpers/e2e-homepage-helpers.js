import { navigationSidebar } from "./e2e-ui-elements-helpers";

export function visitHomepage({ homeText = "Home" } = {}) {
  cy.visit("/");

  cy.wait("@sessionProperties");

  // make sure page is loaded
  cy.findByText("loading").should("not.exist");

  navigationSidebar().findByText(homeText).should("exist");
}
