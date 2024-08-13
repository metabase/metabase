import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  modal,
  describeEE,
  assertPermissionForItem,
  modifyPermission,
  setTokenFeatures,
} from "e2e/support/helpers";

const DETAILS_PERMISSION_INDEX = 4;

describeEE(
  "scenarios > admin > permissions > database details permissions",
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("allows database managers to see and edit database details but not to delete a database (metabase#22293)", () => {
      // As an admin, grant database details permissions to all users
      cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
      modifyPermission("All Users", DETAILS_PERMISSION_INDEX, "Yes");

      cy.button("Save changes").click();

      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Are you sure you want to do this?");
        cy.button("Yes").click();
      });

      assertPermissionForItem("All Users", DETAILS_PERMISSION_INDEX, "Yes");

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
    });
  },
);
