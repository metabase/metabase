import {
  restore,
  modal,
  describeEE,
  assertPermissionForItem,
  modifyPermission,
  downloadAndAssert,
  assertSheetRowsCount,
  sidebar,
  visitQuestion,
} from "__support__/e2e/cypress";

import { SAMPLE_DB_ID, USER_GROUPS } from "__support__/e2e/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DOWNLOAD_PERMISSION_INDEX = 2;

describeEE("scenarios > admin > permissions > data > downloads", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("setting downloads permission UI flow should work", () => {
    cy.log("allows changing download results permission for a database");

    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    modifyPermission("All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionForItem("All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    cy.log("Make sure we can change download results permission for a table");

    sidebar()
      .contains("Orders")
      .click();

    modifyPermission("All Users", DOWNLOAD_PERMISSION_INDEX, "1 million rows");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionForItem(
      "All Users",
      DOWNLOAD_PERMISSION_INDEX,
      "1 million rows",
    );
  });

  it("respects 'no download' permissions when 'All users' group data permissions are set to `Block` (metabase#22408)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Block");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    // When data permissions are set to `Block`, download permissions are automatically revoked
    assertPermissionForItem("All Users", DOWNLOAD_PERMISSION_INDEX, "No");

    // Normal user belongs to both "data" and "collections" groups.
    // They both have restricted downloads so this user shouldn't have the right to download anything.
    cy.signIn("normal");

    visitQuestion("1");

    cy.findByText("Showing first 2,000 rows");
    cy.icon("download").should("not.exist");
  });

  it("restricts users from downloading questions", () => {
    // Restrict downloads for All Users
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "none" },
        },
      },
    });

    cy.signInAsNormalUser();
    visitQuestion("1");

    cy.findByText("Showing first 2,000 rows");
    cy.icon("download").should("not.exist");
  });

  it("limits users from downloading all results", () => {
    const questionId = 1;

    // Restrict downloads for All Users
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          download: { schemas: "limited" },
        },
      },
    });

    cy.signInAsNormalUser();
    visitQuestion(questionId);

    cy.icon("download").click();

    downloadAndAssert(
      { fileType: "xlsx", questionId },
      assertSheetRowsCount(10000),
    );
  });
});
