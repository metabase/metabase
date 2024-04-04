import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  describeEE,
  modal,
  assertPermissionForItem,
  selectSidebarItem,
  modifyPermission,
  assertPermissionTable,
  isPermissionDisabled,
  setTokenFeatures,
  restore,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;

const DATA_ACCESS_PERMISSION_INDEX = 0;

describe(
  "scenarios > admin > permissions > view data > granular",
  { tags: "@OSS" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should not allow making permissions granular in the either database or group focused view", () => {
      cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

      cy.get("main")
        .findByText("All Users")
        .closest("tr")
        .within(() => {
          isPermissionDisabled(DATA_ACCESS_PERMISSION_INDEX, "Can view", true);
        });

      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

      cy.get("main")
        .findByText("Sample Database")
        .closest("tr")
        .within(() => {
          isPermissionDisabled(DATA_ACCESS_PERMISSION_INDEX, "Can view", true);
        });
    });
  },
);

describeEE("scenarios > admin > permissions > view data > granular", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");
  });

  it("should allow making permissions granular in the database focused view", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Granular");

    cy.url().should(
      "include",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    makeOrdersSandboxed();

    selectSidebarItem("All Users");

    assertPermissionTable([
      ["Sample Database", "Granular", "No", "1 million rows", "No", "No"],
    ]);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?").should("exist");
      cy.contains(
        "All Users will be given access to 1 table in Sample Database",
      ).should("exist");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
    });
  });

  it("should allow making permissions granular in the group focused view", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    modifyPermission(
      "Sample Database",
      DATA_ACCESS_PERMISSION_INDEX,
      "Granular",
    );

    cy.url().should(
      "include",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    makeOrdersSandboxed();

    selectSidebarItem("All Users");

    assertPermissionTable([
      ["Sample Database", "Granular", "No", "1 million rows", "No", "No"],
    ]);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?").should("exist");
      cy.contains(
        "All Users will be given access to 1 table in Sample Database",
      ).should("exist");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
    });
  });

  it("should infer parent permissions if all granular permissions are equal", () => {
    // TODO: this feature (not test) is broken when changing permissions for all schemas to the samve value

    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    modifyPermission(
      "Sample Database",
      DATA_ACCESS_PERMISSION_INDEX,
      "Granular",
    );

    makeOrdersSandboxed();

    selectSidebarItem("All Users");

    assertPermissionTable([
      ["Sample Database", "Granular", "No", "1 million rows", "No", "No"],
    ]);

    cy.findByTestId("permission-table")
      .find("tbody > tr")
      .contains("Sample Database")
      .closest("a")
      .click();

    modifyPermission("Orders", DATA_ACCESS_PERMISSION_INDEX, "Can view");

    selectSidebarItem("All Users");

    assertPermissionTable([
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No"],
    ]);
  });

  it("should set a new default for children if parent is currently selected to a top-level only permission before going granular", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    modifyPermission(
      "Sample Database",
      DATA_ACCESS_PERMISSION_INDEX,
      "Blocked",
    );

    modifyPermission(
      "Sample Database",
      DATA_ACCESS_PERMISSION_INDEX,
      "Granular",
    );

    assertPermissionForItem("Orders", DATA_ACCESS_PERMISSION_INDEX, "Can view");
  });
});

function makeOrdersSandboxed() {
  modifyPermission("Orders", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

  modal().within(() => {
    cy.findByText("Change access to this database to granular?");
    cy.button("Change").click();
  });

  cy.url().should(
    "include",
    `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${ORDERS_ID}/segmented`,
  );

  cy.findByText("Grant sandboxed access to this table");
  cy.button("Save").should("be.disabled");

  cy.findByText("Pick a column").click();
  cy.findByText("User ID").click();

  cy.findByText("Pick a user attribute").click();
  cy.findByText("attr_uid").click();
  cy.button("Save").click();
}
