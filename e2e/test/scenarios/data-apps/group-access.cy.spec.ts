import { COLLECTION_GROUP_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const APP_NAME = "group-access-test";
const APP_DISPLAY_NAME = "Group Access Test";
const APP_LINK_REGEX = new RegExp(`${APP_DISPLAY_NAME}$`);

describe("scenarios > data apps > group access (EMB-2415)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    H.setupGitSync();
    H.copySyncedCollectionFixture();

    // commit a built bundle and manifest so remote sync publishes a
    // real app, to use real permission checks.
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

    H.commitToRepo("Add data apps for testing group accesses");
    H.configureGitAndPullChanges("read-write");

    cy.request("GET", `/api/permissions/group/${COLLECTION_GROUP_ID}`)
      .its("body.name")
      .as("groupName");
  });

  it("changes accesses to data apps when assigning and removing groups", () => {
    cy.log("app is hidden and access is denied by default");
    cy.signIn("nodata");
    assertAppIsHidden();
    assertAppAccessDenied();

    cy.signInAsAdmin();
    cy.visit("/admin/settings/apps");

    cy.findByTestId(`data-app-list-item-${APP_NAME}`)
      .findByRole("button", { name: `Actions for ${APP_DISPLAY_NAME}` })
      .click();

    H.popover().findByRole("menuitem", { name: "Manage group access" }).click();
    H.main().findByText("No groups have access yet").should("be.visible");

    cy.findByRole("button", { name: "Add groups" }).click();
    cy.findByRole("textbox", { name: "Search for groups to add" }).click();

    cy.log("add a group to the data app");
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("option", { name }).click(),
    );

    cy.findByTestId("data-app-groups-card")
      .findByRole("button", { name: "Add" })
      .click();

    cy.get<string>("@groupName").then((name) =>
      H.main()
        .findByRole("button", { name: `Remove ${name}`, timeout: 10000 })
        .should("be.visible"),
    );

    cy.log("the group should let members access the app");
    cy.signIn("nodata");
    visitHome();

    H.navigationSidebar()
      .findByRole("link", { name: APP_LINK_REGEX })
      .should("be.visible")
      .invoke("removeAttr", "target")
      .click();

    assertAppIsRendered();

    cy.log("remove the group");
    cy.signInAsAdmin();
    cy.visit(`/admin/settings/apps/${APP_NAME}/groups`);
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("button", { name: `Remove ${name}` }).click(),
    );

    H.main()
      .findByText("No groups have access yet", { timeout: 10000 })
      .should("be.visible");

    cy.log("admins still can access the apps");
    H.openDataApp(APP_NAME);
    assertAppIsRendered();

    cy.log("the app access is revoked after the group is removed");
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
