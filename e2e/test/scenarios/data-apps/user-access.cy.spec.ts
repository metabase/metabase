import { USERS } from "e2e/support/cypress_data";
import type { DataApp } from "metabase-types/api";

const { H } = cy;

const SYNCED_APP_SLUG = "good";
const DATA_APP_NAME = SYNCED_APP_SLUG;
const DATA_APP_DISPLAY_NAME = "Good App";
const ALLOWED_HOST = "https://secret-api.data-app.test";

const NORMAL_USER_NAME = `${USERS.normal.first_name} ${USERS.normal.last_name}`;
const NODATA_USER_NAME = `${USERS.nodata.first_name} ${USERS.nodata.last_name}`;

describe("scenarios > data apps > user access (EMB-2328)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("adds and removes a data app user by pasting a single email", () => {
    pullApp();

    cy.visit("/admin/settings/apps");
    openManageUserAccessFromAppRow();

    cy.location("pathname").should(
      "eq",
      `/admin/settings/apps/${DATA_APP_NAME}/users`,
    );

    H.main().within(() => {
      cy.findByRole("link", { name: "Data apps" }).should("be.visible");
      cy.findByText(DATA_APP_DISPLAY_NAME).should("be.visible");
      cy.findByText("No one has access yet").should("be.visible");

      cy.findByRole("heading", { name: "Manage access to this app" }).should(
        "be.visible",
      );
    });

    cy.findByRole("button", { name: "Add users" }).click();
    H.popover().findByText(NORMAL_USER_NAME).should("be.visible");

    cy.findByRole("textbox", { name: "Search for a user to add" })
      .paste(` ${USERS.normal.email.toUpperCase()} `)
      .should("have.value", "");

    cy.findByRole("button", { name: "Add" }).click();

    userRow(USERS.normal.email).should("be.visible");
    cy.reload();

    H.main().within(() => {
      cy.findByText(NORMAL_USER_NAME, { timeout: 20_000 }).should("be.visible");
      cy.findByText(USERS.normal.email).should("be.visible");
      cy.findByText("No one has access yet").should("not.be.visible");
    });

    cy.findByRole("button", { name: `Remove ${NORMAL_USER_NAME}` }).click();

    H.main().within(() => {
      cy.findByText("No one has access yet", { timeout: 20_000 }).should(
        "be.visible",
      );

      cy.findByText(NORMAL_USER_NAME).should("not.exist");
    });
  });

  it("adds users from comma-separated emails without duplicating existing members", () => {
    pullApp();

    cy.get<number>("@dataAppGroupId").then((groupId) => {
      H.addUserToGroup(groupId, USERS.normal.email);
    });

    cy.visit(`/admin/settings/apps/${DATA_APP_NAME}/users`);
    userRow(USERS.normal.email).should("be.visible");

    cy.findByRole("button", { name: "Add users" }).click();
    H.popover().findByText(NODATA_USER_NAME).should("be.visible");

    cy.log("paste a comma-separated list of emails");
    cy.findByRole("textbox", { name: "Search for a user to add" })
      .paste(` ${USERS.normal.email}, ${USERS.nodata.email.toUpperCase()} `)
      .should("have.value", USERS.normal.email);

    cy.findByRole("button", { name: "Add" }).click();

    userRow(USERS.nodata.email).should("be.visible");
    cy.reload();

    cy.log("both users from the comma-separated list should be visible");
    userRow(USERS.normal.email).should("have.length", 1).and("be.visible");
    userRow(USERS.nodata.email).should("have.length", 1).and("be.visible");
  });

  // SQLite does not have a schema.
  // The visible hierarchy should be "[Database] > [Table]" in table warnings.
  describe("signed-out visitors", () => {
    beforeEach(() => {
      H.setupGitSync();
      H.copySyncedCollectionFixture();
      H.copySyncedDataAppsFixture();
      cy.task("writeDataAppFiles", {
        files: {
          [`${H.LOCAL_GIT_PATH}/data_apps/${SYNCED_APP_SLUG}/data_app.yaml`]: [
            "version: 1",
            "name: Good App",
            `slug: ${SYNCED_APP_SLUG}`,
            "path: ./index.js",
            "collection: goodAppCollection0000",
            "allowed_hosts:",
            `  - ${ALLOWED_HOST}`,
            "entity_id: Ioxf30LzIQCGwbCNtaG62",
            "serdes/meta:",
            "- model: DataApp",
            "  id: Ioxf30LzIQCGwbCNtaG62",
            `  label: ${SYNCED_APP_SLUG}`,
            "",
          ].join("\n"),
        },
      });
      H.commitToRepo("Add a data app with an allowed host");
      H.configureGitAndPullChanges("read-write");

      cy.request(`/embed/apps/${SYNCED_APP_SLUG}`).then((res) => {
        expect(String(res.headers["content-security-policy"])).to.contain(
          ALLOWED_HOST,
        );
      });

      cy.signOut();
    });

    it("does not serve the iframe document or its allowed hosts", () => {
      cy.request({
        url: `/embed/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
        followRedirect: false,
      }).then((res) => {
        expect(res.status).to.eq(302);
        expect(String(res.headers["location"])).to.contain("/auth/login");
        expect(
          String(res.headers["content-security-policy"] ?? ""),
        ).not.to.contain(ALLOWED_HOST);
      });
    });

    it("does not put the allowed hosts on the top-level app page", () => {
      cy.request({
        url: `/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
        followRedirect: false,
      }).then((res) => {
        // The SPA shell is still served; the React app sends the visitor to
        // login. Anchor on it so a 404 or an empty response can't pass the
        // negative check below.
        expect(res.status).to.eq(200);
        expect(String(res.headers["content-type"])).to.contain("text/html");
        expect(res.headers["content-security-policy"]).to.be.a("string");
        expect(res.headers["content-security-policy"]).not.to.contain(
          ALLOWED_HOST,
        );
      });
    });

    it("refuses the bundle and app metadata", () => {
      cy.request({
        url: `/api/apps/${SYNCED_APP_SLUG}/bundle`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401);
        expect(res.headers).not.to.have.property(
          "x-metabase-data-app-allowed-hosts",
        );
      });

      cy.request({
        url: `/api/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 401);
    });
  });
});

const dataAppRow = () =>
  cy
    .findByTestId(`data-app-list-item-${DATA_APP_NAME}`)
    .scrollIntoView()
    .should("be.visible");

function openManageUserAccessFromAppRow() {
  dataAppRow()
    .findByRole("button", { name: `Actions for ${DATA_APP_DISPLAY_NAME}` })
    .click();

  H.popover().findByText("Manage user access").click();
}

const userRow = (email: string) => H.main().findByText(email).closest("tr");

/** Pulls the example data apps, so the `good` app has a row, a resource collection, and a permission group. */
function pullApp() {
  H.pullExampleDataApps();

  cy.request<DataApp>(`/api/apps/${DATA_APP_NAME}`).then(({ body: app }) => {
    expect(app.sync_error).to.be.null;
    expect(app.permission_group_id).not.to.be.null;

    cy.wrap(app.permission_group_id, { log: false }).as("dataAppGroupId");
  });
}
