import { restore, visitDashboard } from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";

import { setup } from "./visit-dashboard";

describe(`visitDashboard e2e helper`, () => {
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
        cy.get("@emptyDashboard").then(id => {
          visitDashboard(id);
        });
      });

      it("should work on a dashboard with markdown card", () => {
        cy.get("@markdownOnly").then(id => {
          visitDashboard(id);
        });
      });

      it("should work on a dashboard with a model", () => {
        cy.get("@modelDashboard").then(id => {
          visitDashboard(id);
        });
      });

      it("should work on a dashboard with a GUI question", () => {
        cy.get("@guiDashboard").then(id => {
          visitDashboard(id);
        });
      });

      it("should work on a dashboard with a native question", () => {
        cy.get("@nativeDashboard").then(id => {
          visitDashboard(id);
        });
      });

      it("should work on a dashboard with multiple cards (including markdown, models, pivot tables, GUI and native)", () => {
        cy.get("@multiDashboard").then(id => {
          visitDashboard(id);
        });
      });
    });
  });
});
