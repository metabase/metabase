import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const TEAMS_TABLE = "scoreboard_actions";
const APP_SLUG = "teams";
const APP_NAME = "Teams";
const NEW_TEAM = "Data App FC";

describe("scenarios > data apps", { tags: ["@external", "@actions"] }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetTestTable({ type: "postgres", table: TEAMS_TABLE });
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEAMS_TABLE });
    H.setActionsEnabledForDB(WRITABLE_DB_ID);

    H.createLibrary();
    H.setupGitSync();
    H.copyDataAppsFixture();
    H.commitToRepo("Add data apps");
    H.configureGitAndPullChanges("read-only");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("manages an imported app in Data Studio, then runs its question and action", () => {
    cy.intercept("PUT", `/api/ee/apps/${APP_SLUG}`).as("updateApp");

    cy.visit(`/data-studio/apps/${APP_SLUG}`);
    H.dataAppIframe(APP_NAME)
      .findByText("Amorous Aardvarks: 0", { timeout: 30000 })
      .should("be.visible");

    cy.log("the app's question and action are in its collection");
    cy.visit(`/data-studio/apps/${APP_SLUG}/questions`);
    H.main().findByText("teamList").should("be.visible");
    cy.visit(`/data-studio/apps/${APP_SLUG}/actions`);
    H.main().findByText("addTeam").should("be.visible");

    cy.log("make the app a draft and live again");
    cy.visit(`/data-studio/apps/${APP_SLUG}`);
    setAppStatus("Make draft");
    cy.wait("@updateApp");
    cy.reload();
    cy.findByTestId("data-app-about-sidebar")
      .findByText("Draft")
      .should("be.visible");

    setAppStatus("Make live");
    cy.wait("@updateApp");
    cy.reload();
    cy.findByTestId("data-app-about-sidebar")
      .findByText("Live")
      .should("be.visible");

    cy.log("run the app's question and action");
    H.openDataApp(APP_SLUG);
    H.dataAppIframe(APP_NAME).within(() => {
      cy.findByRole("list", { name: "Teams" })
        .findByText("Amorous Aardvarks: 0", { timeout: 30000 })
        .should("be.visible");

      addTeam(NEW_TEAM);
      cy.findByRole("list", { name: "Teams" })
        .findByText(`${NEW_TEAM}: 0`)
        .should("be.visible");
    });

    H.queryWritableDB(
      `SELECT score FROM ${TEAMS_TABLE} WHERE team_name = '${NEW_TEAM}'`,
    ).then(({ rows }) => {
      expect(rows).to.have.length(1);
    });
  });

  it("lets the members of a group the app is shared with use it", () => {
    cy.request("GET", `/api/permissions/group/${USER_GROUPS.DATA_GROUP}`)
      .its("body.name")
      .as("groupName");

    cy.log("people outside the app's groups cannot open it");
    cy.signInAsNormalUser();
    H.openDataApp(APP_SLUG);
    H.main()
      .findByText("You don’t have access to this data app")
      .should("be.visible");

    cy.log("share the app with a group");
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/ee/apps/${APP_SLUG}/groups`).as("addGroups");
    cy.visit(`/data-studio/apps/${APP_SLUG}/permissions`);
    H.main().findByRole("button", { name: "Add groups" }).click();
    H.modal().findByRole("textbox", { name: "Groups" }).click();
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("option", { name }).click(),
    );
    H.modal().findByRole("button", { name: "Add" }).click();
    cy.wait("@addGroups");

    cy.log("a member of the group opens the app and uses it");
    cy.signInAsNormalUser();
    cy.visit("/");
    H.navigationSidebar()
      .findByRole("link", { name: new RegExp(`${APP_NAME}$`) })
      .invoke("removeAttr", "target")
      .click();
    H.dataAppIframe(APP_NAME).within(() => {
      cy.findByText("Amorous Aardvarks: 0", { timeout: 30000 }).should(
        "be.visible",
      );
      addTeam(NEW_TEAM);
      cy.findByText(`${NEW_TEAM}: 0`).should("be.visible");
    });
  });
});

function setAppStatus(action: "Make draft" | "Make live") {
  cy.findByRole("button", { name: "Data app options" }).click();
  H.popover()
    .findByRole("menuitem", { name: new RegExp(action) })
    .click();
  H.modal().findByRole("button", { name: action }).click();
}

function addTeam(name: string) {
  cy.findByLabelText("Team name").type(name);
  cy.findByRole("button", { name: "Add team" }).click();
}
