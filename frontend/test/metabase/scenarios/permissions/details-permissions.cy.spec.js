import {
  restore,
  modal,
  describeEE,
  assertPermissionForItem,
  modifyPermission,
} from "__support__/e2e/cypress";

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DETAILS_PERMISSION_INDEX = 4;

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows changing details permission for a database", () => {
    cy.visit("/admin/permissions/data/database/1");

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Unrestricted");
    modifyPermission("All Users", DETAILS_PERMISSION_INDEX, "Yes");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionForItem("All Users", DETAILS_PERMISSION_INDEX, "Yes");
  });
});
