import {
  assertPermissionTable,
  createTestRoles,
  describeEE,
  isPermissionDisabled,
  modifyPermission,
  openNativeEditor,
  popover,
  restore,
  runNativeQuery,
} from "e2e/support/helpers";
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const PG_DB_ID = 2;
const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describeEE("impersonated permission", () => {
  describe("admins", () => {
    beforeEach(() => {
      restore("postgres-12");
      createTestRoles({ type: "postgres" });
      cy.signInAsAdmin();
    });

    it("can set impersonated permissions", () => {
      cy.visit("/admin/permissions/data/group/1");

      // Check there is no Impersonated option on H2
      cy.get("main").findByText("No self-service").click();
      popover().findByText("Impersonated").should("not.exist");

      // Set impersonated access on Postgres database
      modifyPermission(
        "QA Postgres12",
        DATA_ACCESS_PERMISSION_INDEX,
        "Impersonated",
      );

      selectImpersonatedAttribute("role");
      saveImpersonationSettings();
      savePermissions();

      assertPermissionTable([
        [
          "Sample Database",
          "No self-service",
          "No",
          "1 million rows",
          "No",
          "No",
        ],
        ["QA Postgres12", "Impersonated", "Yes", "1 million rows", "No", "No"],
      ]);

      // Checking it shows the right state on the tables level
      cy.get("main").findByText("QA Postgres12").click();

      assertPermissionTable([
        ["Accounts", "Impersonated", "Yes", "1 million rows", "No", "No"],
        [
          "Analytic Events",
          "Impersonated",
          "Yes",
          "1 million rows",
          "No",
          "No",
        ],
        ["Feedback", "Impersonated", "Yes", "1 million rows", "No", "No"],
        ["Invoices", "Impersonated", "Yes", "1 million rows", "No", "No"],
        ["Orders", "Impersonated", "Yes", "1 million rows", "No", "No"],
        ["People", "Impersonated", "Yes", "1 million rows", "No", "No"],
        ["Products", "Impersonated", "Yes", "1 million rows", "No", "No"],
        ["Reviews", "Impersonated", "Yes", "1 million rows", "No", "No"],
      ]);

      // Return back to the database view
      cy.get("main").findByText("All Users group").click();

      // Edit impersonated permission
      modifyPermission(
        "QA Postgres12",
        DATA_ACCESS_PERMISSION_INDEX,
        "Edit Impersonated",
      );

      selectImpersonatedAttribute("attr_uid");
      saveImpersonationSettings();
      savePermissions();

      assertPermissionTable([
        [
          "Sample Database",
          "No self-service",
          "No",
          "1 million rows",
          "No",
          "No",
        ],
        ["QA Postgres12", "Impersonated", "Yes", "1 million rows", "No", "No"],
      ]);

      // Checking table permissions when the native access is disabled for impersonated users
      modifyPermission("QA Postgres12", NATIVE_QUERIES_PERMISSION_INDEX, "No");
      cy.get("main").findByText("QA Postgres12").click();

      cy.get("main")
        .findByText("Orders")
        .closest("tr")
        .within(() => {
          isPermissionDisabled(
            DATA_ACCESS_PERMISSION_INDEX,
            "Impersonated",
            true,
          ).click();
          isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", true);

          cy.findAllByText("No").eq(0).realHover();
        });

      // eslint-disable-next-line no-unscoped-text-selectors
      cy.findByText(
        "Native query editor access requires full data access.",
      ).should("not.exist");

      // Return back to the database view
      cy.get("main").findByText("All Users group").click();

      // Change from impersonated permission
      modifyPermission(
        "QA Postgres12",
        DATA_ACCESS_PERMISSION_INDEX,
        "No self-service",
      );

      assertPermissionTable([
        [
          "Sample Database",
          "No self-service",
          "No",
          "1 million rows",
          "No",
          "No",
        ],
        [
          "QA Postgres12",
          "No self-service",
          "No",
          "1 million rows",
          "No",
          "No",
        ],
      ]);
    });

    it("impersonation modal should be positioned behind the page leave confirmation modal", () => {
      // Try leaving the page
      cy.visit("/admin/permissions/data/group/1");

      modifyPermission(
        "QA Postgres12",
        DATA_ACCESS_PERMISSION_INDEX,
        "Impersonated",
      );

      selectImpersonatedAttribute("role");
      saveImpersonationSettings();

      modifyPermission(
        "QA Postgres12",
        DATA_ACCESS_PERMISSION_INDEX,
        "Edit Impersonated",
      );

      cy.findByRole("dialog").findByText("Edit settings").click();

      // Page leave confirmation should be on top
      cy.findAllByRole("dialog")
        .eq(0)
        .as("leaveConfirmation")
        .findByText("Discard your unsaved changes?")
        .should("be.visible");

      // Cancel
      cy.get("@leaveConfirmation").findByText("Cancel").click();

      // Ensure the impersonation modal is still open
      cy.findByRole("dialog")
        .findByText("Map a user attribute to database roles")
        .should("be.visible");

      // Go to settings
      cy.findByRole("dialog").findByText("Edit settings").click();
      cy.get("@leaveConfirmation").findByText("Discard changes").click();

      cy.focused().should("have.attr", "placeholder", "username");
    });
  });

  describe("impersonated users", () => {
    const setImpersonatedPermission = () => {
      cy.updatePermissionsGraph(
        {
          [ALL_USERS_GROUP]: {
            1: { data: { schemas: "all", native: "write" } },
            [PG_DB_ID]: {
              data: { schemas: "impersonated", native: "write" },
            },
          },
        },
        [
          {
            db_id: PG_DB_ID,
            group_id: ALL_USERS_GROUP,
            attribute: "role",
          },
        ],
      );
    };

    beforeEach(() => {
      restore("postgres-12");
      createTestRoles({ type: "postgres" });
      cy.signInAsAdmin();

      setImpersonatedPermission();

      cy.signInAsImpersonatedUser();
    });

    it("have limited access", () => {
      cy.visit(`/browse/${PG_DB_ID}`);

      // No access through the visual query builder
      cy.get("main").within(() => {
        cy.findByText("Reviews").click();
        cy.findByText("There was a problem with your question");
        cy.findByText("Show error details").click();
        cy.findByText("ERROR: permission denied for table reviews");
      });

      // Has access to allowed tables
      cy.visit(`/browse/${PG_DB_ID}`);

      cy.get("main").findByText("Orders").click();
      cy.findAllByTestId("header-cell").contains("Subtotal");

      // No access through the native query builder
      openNativeEditor({ databaseName: "QA Postgres12" }).type(
        "select * from reviews",
      );
      runNativeQuery();

      cy.findByTestId("query-builder-main").within(() => {
        cy.findByText("An error occurred in your query");
        cy.findByText("ERROR: permission denied for table reviews");
      });

      // Has access to other tables
      cy.get("@editor")
        .type("{selectall}{backspace}", { delay: 50 })
        .type("select * from orders");

      runNativeQuery();

      cy.findAllByTestId("header-cell").contains("subtotal");
    });
  });
});

function savePermissions() {
  cy.get("main").findByText("Save changes").click();
  cy.findByRole("dialog").findByText("Yes").click();
}

function selectImpersonatedAttribute(attribute) {
  cy.findByRole("dialog").within(() => {
    cy.findByTestId("select-button").click();
  });

  popover().findByText(attribute).click();
}

function saveImpersonationSettings() {
  cy.findByRole("dialog").findByText("Save").click();
}
