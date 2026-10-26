import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  COLLECTION_GROUP_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { GroupInfo } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const EMPTY_STATE_TEXT =
  "Only admins can open this app. Add groups to give people in them access.";

describe("scenarios > data apps > data studio permissions", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("group access", () => {
    const APP_NAME = "group-access-test";
    const APP_DISPLAY_NAME = "Group Access Test";
    const APP_LINK_REGEX = new RegExp(`${APP_DISPLAY_NAME}$`);

    beforeEach(() => {
      H.setupGitSync();
      H.copySyncedCollectionFixture();
      H.updateSetting("remote-sync-custom-collections-enabled", true);

      H.writeDataAppResources(H.LOCAL_GIT_PATH, {
        collection: H.dataAppRepresentations.collection(
          "groupAccessAppColl001",
          `Data App: ${APP_DISPLAY_NAME}`,
        ),
      });

      // A built bundle and manifest let remote sync publish a real app, so
      // access goes through the real permission checks.
      cy.task<string>("buildDataApp", { appName: APP_NAME }).then((bundle) =>
        cy.writeFile(
          `${H.LOCAL_GIT_PATH}/data_apps/${APP_NAME}/dist/index.js`,
          bundle,
        ),
      );
      cy.readFile(
        `e2e/support/assets/data-apps/${APP_NAME}/data_app.yaml`,
      ).then((manifest) =>
        cy.writeFile(
          `${H.LOCAL_GIT_PATH}/data_apps/${APP_NAME}/data_app.yaml`,
          manifest,
        ),
      );

      H.commitToRepo("Add a data app for testing group access");
      H.configureGitAndPullChanges("read-write");

      cy.request("GET", `/api/permissions/group/${COLLECTION_GROUP_ID}`)
        .its("body.name")
        .as("groupName");
    });

    it("grants and revokes access to an app when adding and removing a group", () => {
      cy.log("the app is hidden and access is denied by default");
      cy.signIn("nodata");
      assertAppIsHidden();
      assertAppAccessDenied();

      cy.signInAsAdmin();
      cy.intercept("POST", `/api/ee/apps/${APP_NAME}/groups`).as("addGroups");
      cy.visit(`/data-studio/apps/${APP_NAME}/permissions`);
      H.main().findByText(EMPTY_STATE_TEXT).should("be.visible");

      cy.log("add a group to the app");
      H.main().findByRole("button", { name: "Add groups" }).click();
      H.modal().findByRole("textbox", { name: "Groups" }).click();
      cy.get<string>("@groupName").then((name) =>
        cy.findByRole("option", { name }).click(),
      );
      H.modal().findByRole("button", { name: "Add" }).click();
      cy.wait("@addGroups");
      H.expectUnstructuredSnowplowEvent({ event: "data_app_group_added" });

      cy.get<string>("@groupName").then((name) =>
        H.main().findByText(name).should("be.visible"),
      );

      cy.log("members of the group can open the app");
      cy.signIn("nodata");
      visitHome();
      H.navigationSidebar()
        .findByRole("link", { name: APP_LINK_REGEX })
        .should("be.visible")
        .invoke("removeAttr", "target")
        .click();
      assertAppIsRendered();

      cy.log("remove the group after confirming");
      cy.signInAsAdmin();
      cy.intercept("DELETE", `/api/ee/apps/${APP_NAME}/groups/*`).as(
        "removeGroup",
      );
      cy.visit(`/data-studio/apps/${APP_NAME}/permissions`);
      cy.get<string>("@groupName").then((name) =>
        H.main()
          .findByRole("button", { name: `${name} options` })
          .click(),
      );
      H.popover()
        .findByRole("menuitem", { name: /Remove access/ })
        .click();
      H.modal().findByRole("button", { name: "Remove access" }).click();
      cy.wait("@removeGroup");
      H.expectUnstructuredSnowplowEvent({ event: "data_app_group_removed" });
      H.main().findByText(EMPTY_STATE_TEXT).should("be.visible");

      cy.log("admins can still open the app");
      H.openDataApp(APP_NAME);
      assertAppIsRendered();

      cy.log("members of the removed group lose access");
      cy.signIn("nodata");
      assertAppIsHidden();
      assertAppAccessDenied();
    });

    function visitHome() {
      cy.intercept("GET", "/api/ee/apps").as("dataApps");
      cy.visit("/");
      cy.wait("@dataApps");
      H.navigationSidebar()
        .findByRole("listitem", { name: "Home" })
        .should("be.visible");
    }

    function assertAppIsHidden() {
      visitHome();
      H.navigationSidebar()
        .findByRole("link", { name: APP_LINK_REGEX })
        .should("not.exist");
    }

    function assertAppAccessDenied() {
      H.openDataApp(APP_NAME);
      H.main()
        .findByText("You don’t have access to this data app")
        .should("be.visible");
    }

    function assertAppIsRendered() {
      H.dataAppIframe(APP_DISPLAY_NAME)
        .findByRole("heading", { name: "Group access app" })
        .should("be.visible");
    }
  });

  describe("missing data access", () => {
    const APP_NAME = "good";
    const GROUP_NAME = "Finches";
    const DATA_ACCESS_PERMISSION_INDEX = 0;

    beforeEach(() => {
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
      H.waitForBackfillComplete();

      cy.request<GroupInfo>("POST", "/api/permissions/group", {
        name: GROUP_NAME,
      }).then(({ body: group }) => {
        H.blockUserGroupPermissions(ALL_USERS_GROUP_ID);
        H.blockUserGroupPermissions(group.id);
        cy.request("POST", `/api/ee/apps/${APP_NAME}/groups`, {
          group_ids: [group.id],
        });
      });
    });

    it("shows the tables a group can't view, links to their permissions, and clears once access is granted", () => {
      cy.visit(`/data-studio/apps/${APP_NAME}/permissions`);

      H.main()
        .findByRole("row", { name: new RegExp(GROUP_NAME) })
        .findByText("Missing 1 table")
        .should("be.visible")
        .click();

      cy.findByTestId("data-app-group-sidebar").within(() => {
        cy.findByRole("heading", { name: GROUP_NAME }).should("be.visible");
        cy.findByRole("region", { name: "Missing tables" }).within(() => {
          cy.findByText("Sample Database").should("be.visible");
          cy.findByText("PUBLIC").should("be.visible");
          cy.findByText("Orders").click();
        });
      });

      H.popover()
        .findByRole("menuitem", { name: /Change permissions/ })
        .should("have.attr", "href")
        .and("include", `/admin/permissions/data/database/${SAMPLE_DB_ID}/`)
        .and("include", `/table/${ORDERS_ID}`);

      cy.log("grant access to the table");
      cy.visit(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
      );
      H.assertPermissionForItem(
        GROUP_NAME,
        DATA_ACCESS_PERMISSION_INDEX,
        "Blocked",
      );
      H.modifyPermission(GROUP_NAME, DATA_ACCESS_PERMISSION_INDEX, "Can view");
      H.savePermissions();

      cy.visit(`/data-studio/apps/${APP_NAME}/permissions`);
      H.main()
        .findByRole("row", { name: new RegExp(GROUP_NAME) })
        .findByText("All tables")
        .should("be.visible");
    });
  });
});
