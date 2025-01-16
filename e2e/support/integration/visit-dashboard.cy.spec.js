import { USERS } from "e2e/support/cypress_data";

import { setup } from "./visit-dashboard";

describe("visitDashboard e2e helper", () => {
  Object.keys(Cypress._.omit(USERS, "sandboxed")).forEach(user => {
    context(`${user.toUpperCase()}`, () => {
      beforeEach(() => {
        cy.restore();
        cy.signInAsAdmin();

        setup();

        if (user !== "admin") {
          cy.signIn(user);
        }
      });

      it("should work on an empty dashboard", () => {
        cy.visitDashboard("@emptyDashboard");
      });

      it("should work on a dashboard with markdown card", () => {
        cy.visitDashboard("@markdownOnly");
      });

      it("should work on a dashboard with a model", () => {
        cy.visitDashboard("@modelDashboard");
      });

      it("should work on a dashboard with a GUI question", () => {
        cy.visitDashboard("@guiDashboard");
      });

      it("should work on a dashboard with a native question", () => {
        cy.visitDashboard("@nativeDashboard");
      });

      it("should work on a dashboard with multiple cards (including markdown, models, pivot tables, GUI and native)", () => {
        cy.visitDashboard("@multiDashboard");
      });
    });
  });
});
