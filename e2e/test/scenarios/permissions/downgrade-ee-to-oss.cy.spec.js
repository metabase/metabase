import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  assertPermissionTable,
  modifyPermission,
  modal,
  restore,
  popover,
  describeEE,
  setTokenFeatures,
  isPermissionDisabled,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

const EE_DATA_ACCESS_PERMISSION_INDEX = 0;
const OSS_NATIVE_QUERIES_PERMISSION_INDEX = 0;

describeEE("scenarios > admin > permissions > downgrade ee to oss", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  // we have a case where users may be downgraded for not paying but then will sort out billing and upgrade back to EE again.
  // we want to make sure that the users can still modify create-queries permissions with view-data values that would
  // normally disable the input (e.g. blocked, legacy-no-self-service) in EE. when modifying a row like that, we want the
  // view-data permissions to go up to unrestricted.

  it("should allow users to edit permissions after downgrading EE to OSS", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    modifyPermission(
      "Sample Database",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Blocked",
    );
    cy.button("Save changes").click();
    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    setTokenFeatures("none").then(() => {
      cy.reload();

      assertPermissionTable([["Sample Database", "No"]]);
      isPermissionDisabled(OSS_NATIVE_QUERIES_PERMISSION_INDEX, "No", false);

      modifyPermission(
        "Sample Database",
        OSS_NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );
      cy.button("Save changes").click();
      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.button("Yes").click();
      });

      setTokenFeatures("all").then(() => {
        cy.reload();

        assertPermissionTable([
          [
            "Sample Database",
            "Can view",
            "Query builder and native",
            "No",
            "No",
            "No",
          ],
        ]);
      });
    });
  });

  // same context as other test, but also make sure that other rows with EE values are
  // unmodified if it's possible to keep their EE view-data values behind the scenes.
  // this will allow users to already have their old EE values when they go to upgrade again.
  it("should preserve unedited EE values in graph when OSS", () => {
    // starting as EE, set a EE only value in the graph
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    modifyPermission(
      "Sample Database",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Granular",
    );

    // set both people and orders tables to sandboxed (an EE only value)
    [
      ["Orders", "User ID"],
      ["People", "ID"],
    ].forEach(([tableName, colName]) => {
      modifyPermission(tableName, EE_DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

      cy.findByText("Pick a column").click();
      popover().within(() => {
        cy.findByText(colName).click();
      });
      cy.findByText("Pick a user attribute").click();
      popover().within(() => {
        cy.findByText("attr_uid").click();
      });
      cy.button("Save").click();
    });

    // save changes
    cy.button("Save changes").click();
    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    // downgrade to OSS
    setTokenFeatures("none");
    cy.reload();

    assertPermissionTable([
      ["Accounts", "No"],
      ["Analytic Events", "No"],
      ["Feedback", "No"],
      ["Invoices", "No"],
      ["Orders", "No"],
      ["People", "No"],
      ["Products", "No"],
      ["Reviews", "No"],
    ]);

    modifyPermission(
      "Orders",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Query builder only",
    );

    cy.button("Save changes").click();
    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    // upgrade back to EE
    setTokenFeatures("all");
    cy.reload();

    assertPermissionTable([
      ["Accounts", "Can view", "No", "1 million rows", "No"],
      ["Analytic Events", "Can view", "No", "1 million rows", "No"],
      ["Feedback", "Can view", "No", "1 million rows", "No"],
      ["Invoices", "Can view", "No", "1 million rows", "No"],
      ["Orders", "Sandboxed", "Query builder only", "1 million rows", "No"],
      ["People", "Sandboxed", "No", "1 million rows", "No"],
      ["Products", "Can view", "No", "1 million rows", "No"],
      ["Reviews", "Can view", "No", "1 million rows", "No"],
    ]);
  });
});
