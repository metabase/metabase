import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ALL_USERS_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import type { GroupInfo } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const APP_NAME = "good";

const GROUP_NAME = "Finches";
const GROUP_MATCHER = new RegExp(GROUP_NAME);

const DATA_ACCESS_PERMISSION_INDEX = 0;

describe("scenarios > data apps > group access warnings (EMB-2416)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    H.pullExampleDataApps({
      goodAppCards: [
        H.dataAppRepresentations.card({
          entityId: "warningsOrdersCard000",
          name: "Orders",
          type: "question",
          collection: "goodAppCollection0000",
          table: ["Sample Database", "PUBLIC", "ORDERS"],
        }),
      ],
    });

    cy.request<GroupInfo>("POST", "/api/permissions/group", {
      name: GROUP_NAME,
    })
      .its("body")
      .as("group");

    H.blockUserGroupPermissions(ALL_USERS_GROUP_ID);
    cy.get<GroupInfo>("@group").then(({ id }) =>
      H.blockUserGroupPermissions(id),
    );
  });

  it("shows missing table access after assignment and clears it after granting data permissions", () => {
    cy.visit(`/admin/settings/apps/${APP_NAME}/groups`);

    H.main().findByText("No groups have access yet").should("be.visible");

    H.main().findByRole("button", { name: "Add groups" }).click();
    H.main()
      .findByRole("textbox", { name: "Search for groups to add" })
      .click();

    cy.findByRole("option", { name: GROUP_NAME }).click();
    cy.findByTestId("data-app-groups-card")
      .findByRole("button", { name: "Add" })
      .click();

    cy.log("some table accesses are missing initially");
    H.main()
      .findByRole("row", { name: GROUP_MATCHER })
      .findByRole("button", { name: "Missing data access" })
      .realHover();

    cy.log("database and table should be visible in card");
    cy.findByTestId("data-access-warning-popover").within(() => {
      cy.findByText(
        `${GROUP_NAME} doesn’t have permission to view these tables used in this app:`,
      ).should("be.visible");

      cy.findByRole("link", { name: "Sample Database" }).should("be.visible");

      cy.findByRole("link", { name: "Orders" }).should("be.visible").click();
    });

    cy.log("orders table link navigates to the table permission page");
    cy.location("pathname")
      .should("include", `/admin/permissions/data/database/${SAMPLE_DB_ID}/`)
      .and("include", `/table/${ORDERS_ID}`);

    H.assertPermissionForItem(
      GROUP_NAME,
      DATA_ACCESS_PERMISSION_INDEX,
      "Blocked",
    );

    cy.log("grant access to the table");
    H.modifyPermission(GROUP_NAME, DATA_ACCESS_PERMISSION_INDEX, "Can view");
    H.savePermissions();

    cy.intercept("GET", `/api/apps/${APP_NAME}/group-permission-warnings`).as(
      "groupWarnings",
    );

    cy.go("back");
    cy.location("pathname").should(
      "equal",
      `/admin/settings/apps/${APP_NAME}/groups`,
    );

    cy.log("group warnings should be gone");
    cy.wait("@groupWarnings").its("response.body").should("deep.equal", []);

    cy.log("group warnings should not show in the ui");
    H.main()
      .findByRole("row", { name: GROUP_MATCHER })
      .should("be.visible")
      .findByRole("button", { name: "Missing data access" })
      .should("not.exist");
  });
});
