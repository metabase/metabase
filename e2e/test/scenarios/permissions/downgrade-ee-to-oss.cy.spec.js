const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const EE_DATA_ACCESS_PERMISSION_INDEX = 0;
const OSS_NATIVE_QUERIES_PERMISSION_INDEX = 0;

describe("scenarios > admin > permissions > downgrade ee to oss", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  // we have a case where users may be downgraded for not paying but then will sort out billing and upgrade back to EE again.
  // we want to make sure that the users can still modify create-queries permissions with view-data values that would
  // normally disable the input (e.g. blocked, legacy-no-self-service) in EE. when modifying a row like that, we want the
  // view-data permissions to go up to unrestricted.

  it("should allow users to edit permissions after downgrading EE to OSS", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    H.modifyPermission(
      "Sample Database",
      EE_DATA_ACCESS_PERMISSION_INDEX,
      "Blocked",
    );
    cy.button("Save changes").click();
    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    H.deleteToken().then(() => {
      cy.reload();

      H.assertPermissionTable([["Sample Database", "No"]]);

      H.isPermissionDisabled(
        "Sample Database",
        OSS_NATIVE_QUERIES_PERMISSION_INDEX,
        "No",
        false,
      );

      H.modifyPermission(
        "Sample Database",
        OSS_NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );
      cy.button("Save changes").click();
      H.modal().within(() => {
        cy.findByText("Save permissions?");
        cy.button("Yes").click();
      });

      H.activateToken("pro-self-hosted").then(() => {
        cy.reload();

        H.assertPermissionTable([
          [
            "Sample Database",
            "Can view",
            "Query builder and native",
            "No",
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
});
