/**
 * Cross-version test: Instance setup
 *
 * This must be the first test to run. It completes the Metabase setup wizard
 * in the source phase, and verifies the admin can authenticate in both phases.
 *
 * Uses credentials from e2e/support/cypress_data.js so cy.signInAsAdmin() works.
 */

import { USERS } from "e2e/support/cypress_data";

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = USERS.admin;

describe("Cross-version: Instance setup", () => {
  it("setup: completes the setup wizard", { tags: ["@source"] }, () => {
    cy.visit("/");

    cy.request("GET", "/api/session/properties").then(({ body }) => {
      const setupToken = body["setup-token"];

      // Setup token should exist on a fresh instance
      expect(setupToken).to.be.a("string");

      cy.request("POST", "/api/setup", {
        token: setupToken,
        user: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          first_name: "Admin",
          last_name: "CrossVersion",
        },
        prefs: {
          site_name: "CrossVersion Test",
          site_locale: "en",
          allow_tracking: false,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
      });
    });
  });

  it("verify: admin can authenticate", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });
    cy.request("GET", "/api/user/current").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.email).to.eq(ADMIN_EMAIL);
    });
  });
});
