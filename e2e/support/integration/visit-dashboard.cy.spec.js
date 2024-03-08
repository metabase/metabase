import { USERS } from "e2e/support/cypress_data";
import { restore, visitDashboard } from "e2e/support/helpers";

import { setup } from "./visit-dashboard";

describe("visitDashboard e2e helper", () => {
  Object.keys(Cypress._.omit(USERS, "sandboxed")).forEach(user => {
    context(`${user.toUpperCase()}`, () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        setup();

        if (user !== "admin") {
          cy.signIn(user);
        }
      });

      it("should work on an empty dashboard", () => {
        visitDashboard("@emptyDashboard");
      });

      it("should work on a dashboard with markdown card", () => {
        visitDashboard("@markdownOnly");
      });

      it("should work on a dashboard with a model", () => {
        visitDashboard("@modelDashboard");
      });

      it("should work on a dashboard with a GUI question", () => {
        visitDashboard("@guiDashboard");
      });

      it("should work on a dashboard with a native question", () => {
        visitDashboard("@nativeDashboard");
      });

      it("should work on a dashboard with multiple cards (including markdown, models, pivot tables, GUI and native)", () => {
        visitDashboard("@multiDashboard");
      });
    });
  });
});
