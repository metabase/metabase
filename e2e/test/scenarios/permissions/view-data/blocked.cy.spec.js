import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  assertPermissionTable,
  modal,
  restore,
  popover,
  describeEE,
  setTokenFeatures,
  isPermissionDisabled,
} from "e2e/support/helpers";

const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describeEE("scenarios > admin > permissions > view data > blocked", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should allow saving 'blocked' and disable create queries dropdown when set", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All Users")
      .closest("tr")
      .as("allUsersRow")
      .within(() => {
        isPermissionDisabled(
          DATA_ACCESS_PERMISSION_INDEX,
          "Can view",
          false,
        ).click();
        isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", false);
      });

    popover().contains("Block").click();

    cy.get("@allUsersRow").within(() => {
      isPermissionDisabled(DATA_ACCESS_PERMISSION_INDEX, "Block", false);
      isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", true);
    });

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    assertPermissionTable([
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
        "Yes",
      ],
      // expect that the view data permissions has been automatically droped to query builder only
      ["All Users", "Blocked", "No", "No", "No", "No"],
      ["collection", "Can view", "No", "1 million rows", "No", "No"],
      [
        "data",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "No",
        "No",
      ],
      ["nosql", "Can view", "Query builder only", "1 million rows", "No", "No"],
      ["readonly", "Can view", "No", "1 million rows", "No", "No"],
    ]);
  });
});
