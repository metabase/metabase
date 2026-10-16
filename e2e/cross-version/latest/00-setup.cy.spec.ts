/**
 * Cross-version test: Instance setup
 *
 * This must be the first test to run. It completes the Metabase setup wizard
 * in the source phase, and verifies the admin can authenticate in both phases.
 *
 * Uses credentials from e2e/support/cypress_data.js so cy.signInAsAdmin() works.
 */

import { USERS } from "e2e/support/cypress_data";

import { XV_DATABASE_NAME } from "../constants";

const { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = USERS.admin;

const { H } = cy;

describe("Cross-version: Instance setup", () => {
  it("setup: completes the setup wizard", { tags: ["@source"] }, () => {
    cy.visit("/");

    cy.request("GET", "/api/session/properties").then(({ body }) => {
      const setupToken = body["setup-token"];

      cy.log("Setup token must exist on a fresh instance");
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

      cy.request("GET", "/api/user/current").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.email).to.eq(ADMIN_EMAIL);

        cy.log("Dismiss `it's ok to play around` modal for admin");
        cy.request("PUT", `/api/user/${response.body.id}/modal/qbnewb`);
      });

      cy.request("POST", "/api/database", {
        name: XV_DATABASE_NAME,
        engine: "postgres",
        details: {
          host: "postgres",
          port: 5432,
          dbname: "sample",
          user: "metabase",
          password: "metabase",
        },
      }).then((response) => {
        expect(response.status).to.eq(200);

        const dbId = response.body.id;
        expect(dbId).to.be.a("number");

        cy.log("Wait for the initial sync so field ids are available");
        // Table names are matched verbatim and the QA sample data uses
        // lower-case identifiers. `withDatabase` upper-cases them again.
        H.resyncDatabase({
          dbId,
          tables: ["people", "orders", "products", "reviews"],
        });

        H.withDatabase(dbId, ({ ORDERS, PRODUCTS, REVIEWS }) => {
          cy.log("Remap display values to use foreign key as Product Title");
          cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
            name: "Product ID",
            type: "external",
            human_readable_field_id: PRODUCTS.TITLE,
          });

          cy.log("Remap rating to use custom values");
          cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
            type: "internal",
            name: "Rating",
          });

          cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
            values: [
              [1, "Awful"],
              [2, "Unpleasant"],
              [3, "Meh"],
              [4, "Enjoyable"],
              [5, "Perfecto"],
            ],
          });
        });
      });
    });
  });

  it("verify: admin can authenticate", { tags: ["@target"] }, () => {
    cy.signIn("admin", { skipCache: true });

    cy.visit("/browse/databases");
    cy.findByTestId("database-browser").contains(XV_DATABASE_NAME).click();

    cy.log("Verify REVIEWS.Rating values display custom remapping");
    cy.findAllByRole("link").filter(":contains(Reviews)").click();
    cy.findAllByRole("gridcell")
      .should("contain", "Enjoyable")
      .and("contain", "Perfecto");

    cy.go("back");
    cy.log("Verify ORDERS.ProductId FK is remapped to Product Title");
    cy.findAllByRole("link").filter(":contains(Orders)").click();
    cy.findAllByRole("gridcell")
      .should("contain", "Fantastic Wool Shirt")
      .and("contain", "Small Marble Hat");
  });
});
