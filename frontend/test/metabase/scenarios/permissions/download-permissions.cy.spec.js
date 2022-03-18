import {
  restore,
  modal,
  describeEE,
  assertPermissionTable,
  modifyPermission,
  isPermissionDisabled,
  downloadAndAssert,
} from "__support__/e2e/cypress";
const xlsx = require("xlsx");

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DOWNLOAD_PERMISSION_INDEX = 2;

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows changing download results permission for a database", () => {
    cy.visit("/admin/permissions/data/database/1");

    // Download permission is disabled when there is no data access
    cy.findByText("All Users")
      .closest("tr")
      .as("allUsersRow")
      .within(() => {
        isPermissionDisabled(DOWNLOAD_PERMISSION_INDEX, "No", true);
      });

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Unrestricted");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "1 million rows"],
      ["All Users", "Unrestricted", "No", "1 million rows"],
      ["collection", "No self-service", "No", "No"],
      ["data", "Unrestricted", "Yes", "No"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);
  });

  it("allows changing download results permission for a table", () => {
    cy.visit("/admin/permissions/data/database/1/table/1");

    // Download permission is disabled when there is no data access
    cy.findByText("All Users")
      .closest("tr")
      .as("allUsersRow")
      .within(() => {
        isPermissionDisabled(DOWNLOAD_PERMISSION_INDEX, "No", true);
      });

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Unrestricted");

    modal().within(() => {
      cy.findByText("Change access to this database to limited?");
      cy.button("Change").click();
    });

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "1 million rows"],
      ["All Users", "Unrestricted", "No", "1 million rows"],
      ["collection", "No self-service", "No", "No"],
      ["data", "Unrestricted", "Yes", "No"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);
  });

  it.skip("sets the download permission to `No` when the data access permission is revoked", () => {
    cy.visit("/admin/permissions/data/database/1");
    const groupName = "data";

    modifyPermission(groupName, DOWNLOAD_PERMISSION_INDEX, "1 million rows");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "1 million rows"],
      ["All Users", "No self-service", "No", "No"],
      ["collection", "No self-service", "No", "No"],
      ["data", "Unrestricted", "Yes", "1 million rows"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);

    modifyPermission(
      groupName,
      DATA_ACCESS_PERMISSION_INDEX,
      "No self-service",
    );

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "1 million rows"],
      ["All Users", "No self-service", "No", "No"],
      ["collection", "No self-service", "No", "No"],
      ["data", "No self-service", "No", "No"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);
  });

  it.skip("restricts users from downloading questions", () => {
    cy.signInAsNormalUser();
    cy.visit("/question/1");

    cy.findByText("Showing first 2,000 rows");
    cy.icon("download").should("not.exist");
  });

  it.skip("restricts users from downloading questions", () => {
    cy.visit("/admin/permissions/data/database/1");
    const groupName = "data";

    modifyPermission(groupName, DOWNLOAD_PERMISSION_INDEX, "10 thousand rows");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    cy.signInAsNormalUser();
    cy.visit("/question/1");

    cy.icon("download").click();

    downloadAndAssert({ fileType: "xlsx" }, assertion);
  });
});

function assertion(sheet) {
  const range = xlsx.utils.decode_range(sheet["!ref"]);
  expect(range.e.r).to.eq(10001);
}
