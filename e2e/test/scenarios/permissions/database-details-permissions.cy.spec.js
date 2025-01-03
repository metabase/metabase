import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const DETAILS_PERMISSION_INDEX = 4;

H.describeEE(
  "scenarios > admin > permissions > database details permissions",
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    it("allows database managers to see and edit database details but not to delete a database (metabase#22293)", () => {
      // As an admin, grant database details permissions to all users
      cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
      H.modifyPermission("All Users", DETAILS_PERMISSION_INDEX, "Yes");

      cy.button("Save changes").click();

      H.modal().within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Are you sure you want to do this?");
        cy.button("Yes").click();
      });

      H.assertPermissionForItem("All Users", DETAILS_PERMISSION_INDEX, "Yes");

      // Normal user should now have the ability to manage databases
      cy.signInAsNormalUser();

      cy.visit("/");
      cy.icon("gear").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Admin settings").should("be.visible").click();

      cy.location("pathname").should("eq", "/admin/databases");

      cy.get("nav")
        .should("contain", "Databases")
        .and("not.contain", "Settings")
        .and("not.contain", "Data Model");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sample Database").click();

      cy.findByTestId("database-actions-panel")
        .should("contain", "Sync database schema now")
        .and("contain", "Re-scan field values now")
        .and("contain", "Discard saved field values")
        .and("not.contain", "Remove this database");

      cy.request({
        method: "DELETE",
        url: `/api/database/${SAMPLE_DB_ID}`,
        failOnStatusCode: false,
      }).then(({ status }) => {
        expect(status).to.eq(403);
      });

      cy.log(
        "should not allow access to the database/create page (metabase-private#236)",
      );
      cy.visit("/admin/databases/create");
      cy.findByRole("img", { name: /key/ }).should("exist");
      cy.findByRole("status").should(
        "contain.text",
        "Sorry, you don’t have permission to see that.",
      );
    });
  },
);
