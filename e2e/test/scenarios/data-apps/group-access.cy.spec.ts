import { COLLECTION_GROUP_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const APP_NAME = "group-access-test";
const APP_DISPLAY_NAME = "Group Access Test";
const APP_LINK_NAME = new RegExp(`${APP_DISPLAY_NAME}$`);

describe("scenarios > data apps > group access (EMB-2385)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    H.setupGitSync();
    H.copySyncedCollectionFixture();

    cy.task<string>("buildDataApp", { appName: APP_NAME }).then((bundle) =>
      cy.writeFile(
        `${H.LOCAL_GIT_PATH}/data_apps/${APP_NAME}/dist/index.js`,
        bundle,
      ),
    );
    cy.readFile(`e2e/support/assets/data-apps/${APP_NAME}/data_app.yaml`).then(
      (manifest) =>
        cy.writeFile(
          `${H.LOCAL_GIT_PATH}/data_apps/${APP_NAME}/data_app.yaml`,
          manifest,
        ),
    );
    H.commitToRepo("Publish group access test app");
    H.configureGitAndPullChanges("read-write");

    cy.request("GET", `/api/permissions/group/${COLLECTION_GROUP_ID}`)
      .its("body.name")
      .as("groupName");
  });

  it("assigns and removes a group to control member discovery and access", () => {
    cy.signIn("nodata");
    assertAppIsHidden();
    assertAppAccessDenied();

    cy.signInAsAdmin();
    cy.visit("/admin/settings/apps");
    cy.findByTestId(`data-app-list-item-${APP_NAME}`)
      .findByRole("button", { name: `Actions for ${APP_DISPLAY_NAME}` })
      .click();
    H.popover().findByRole("menuitem", { name: "Manage group access" }).click();
    cy.location("pathname").should(
      "eq",
      `/admin/settings/apps/${APP_NAME}/groups`,
    );
    H.main().findByText("No groups have access yet").should("be.visible");

    cy.findByRole("button", { name: "Add groups" }).click();
    cy.findByRole("textbox", { name: "Search for groups to add" }).click();
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("option", { name }).click(),
    );

    cy.intercept("POST", `/api/apps/${APP_NAME}/groups`).as("assignGroups");
    cy.findByTestId("data-app-groups-card")
      .findByRole("button", { name: "Add", exact: true })
      .click();
    cy.wait("@assignGroups");
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("button", { name: `Remove ${name}` }).should("be.visible"),
    );

    cy.log("The assigned group grants its existing members access");
    cy.signIn("nodata");
    visitHome();
    H.navigationSidebar()
      .findByRole("link", { name: APP_LINK_NAME })
      .should("be.visible")
      .invoke("removeAttr", "target")
      .click();
    cy.location("pathname").should("eq", `/apps/${APP_NAME}`);
    assertAppIsRendered();

    cy.log(
      "Removing the assignment revokes member access and preserves admin access",
    );
    cy.signInAsAdmin();
    cy.visit(`/admin/settings/apps/${APP_NAME}/groups`);
    cy.intercept(
      "DELETE",
      `/api/apps/${APP_NAME}/groups/${COLLECTION_GROUP_ID}`,
    ).as("removeGroup");
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("button", { name: `Remove ${name}` }).click(),
    );
    cy.wait("@removeGroup");
    H.main().findByText("No groups have access yet").should("be.visible");
    H.openDataApp(APP_NAME);
    assertAppIsRendered();

    cy.signIn("nodata");
    assertAppIsHidden();
    assertAppAccessDenied();
  });
});

function visitHome() {
  cy.intercept("GET", "/api/apps?available=true").as("availableApps");
  cy.visit("/");
  cy.wait("@availableApps");
  H.navigationSidebar()
    .findByRole("listitem", { name: "Home" })
    .should("be.visible");
}

function assertAppIsHidden() {
  visitHome();
  H.navigationSidebar()
    .findByRole("link", { name: APP_LINK_NAME })
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
