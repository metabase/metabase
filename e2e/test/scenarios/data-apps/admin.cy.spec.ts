import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  DATA_APP_TEST_ENV as TEST_ENV,
  fakeDataApp as fakeApp,
} from "e2e/support/helpers";

const { H } = cy;

describe("scenarios > data apps > admin management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  it("Happy Path: lists a data app and renders it in its sandboxed iframe with real SDK data", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    cy.visit("/admin/settings/apps");
    cy.findByRole("link", { name: APP_DISPLAY_NAME })
      .scrollIntoView()
      .should("be.visible");

    H.openDataApp(APP_NAME);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("heading", { name: "Orders overview" }).should(
        "be.visible",
      );

      cy.findByTestId("orders-count", { timeout: 30000 })
        .invoke("text")
        .should("match", /^\d+$/);

      cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
    });
  });

  it("shows the generic empty state (not a duplicate 'no repo' message) when no repository is connected", () => {
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: false,
      url: null,
    }).as("repoStatus");
    cy.intercept("GET", "/api/apps", []);

    cy.visit("/admin/settings/apps");
    cy.wait("@repoStatus");

    cy.findByTestId("admin-layout-content").within(() => {
      // The Apps section still renders (title + generic empty state); the
      // "no repository" state lives only in the Remote Sync row above, so it
      // must not be duplicated down here.
      cy.findByRole("heading", { name: "Apps" }).should("be.visible");
      cy.findByText("Your data apps will appear here")
        .scrollIntoView()
        .should("be.visible");
      cy.findByText(/No repository is connected yet/).should("not.exist");
    });
  });

  it("shows an empty state when the connected repository has no apps", () => {
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: true,
      url: "https://github.com/metabase/stats-remote-sync",
    });
    cy.intercept("GET", "/api/apps", []).as("apps");

    cy.visit("/admin/settings/apps");
    cy.wait("@apps");

    cy.findByTestId("admin-layout-content").within(() => {
      // The connected repository URL shows in the remote-sync row.
      cy.findByText("https://github.com/metabase/stats-remote-sync").should(
        "be.visible",
      );
      // The Apps section keeps its title and shows an empty state with no apps.
      cy.findByRole("heading", { name: "Apps" }).should("be.visible");
      cy.findByText("Your data apps will appear here")
        .scrollIntoView()
        .should("be.visible");
    });
  });

  it("lists an enabled app with an open link and a Disable action (no Remove while connected)", () => {
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: true,
    });
    cy.intercept("GET", "/api/apps", [fakeApp()]);
    cy.intercept("PUT", `/api/apps/${APP_NAME}`, {
      statusCode: 200,
      body: fakeApp({ enabled: false }),
    }).as("setEnabled");

    cy.visit("/admin/settings/apps");

    // The name links to the app's route and the path is shown.
    cy.findByRole("link", { name: APP_DISPLAY_NAME })
      .should("have.attr", "href")
      .and("contain", `/apps/${APP_NAME}`);
    cy.findByTestId("admin-layout-content")
      .findByText(`/apps/${APP_NAME}`)
      .scrollIntoView()
      .should("be.visible");

    // The actions menu offers Disable; while a repo is connected there's no
    // manual Remove (a sync would just re-materialize it).
    cy.findByRole("button", {
      name: `Actions for ${APP_DISPLAY_NAME}`,
    }).click();
    cy.findByRole("menuitem", { name: "Remove" }).should("not.exist");
    cy.findByRole("menuitem", { name: "Disable" }).click();

    cy.wait("@setEnabled")
      .its("request.body")
      .should("deep.equal", { enabled: false });
  });

  it("shows a disabled app as plain text with a Disabled badge and a Reenable action", () => {
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: true,
    });
    cy.intercept("GET", "/api/apps", [fakeApp({ enabled: false })]);

    cy.visit("/admin/settings/apps");

    cy.findByTestId("admin-layout-content").within(() => {
      // A disabled app isn't reachable, so its name is plain text (not a link)
      // and it carries a Disabled badge.
      cy.findByText(APP_DISPLAY_NAME).scrollIntoView().should("be.visible");
      cy.findByRole("link", { name: APP_DISPLAY_NAME }).should("not.exist");
      cy.findByText("Disabled").should("be.visible");
    });

    // The menu offers Reenable — and no Remove, since a repo is connected.
    cy.findByRole("button", {
      name: `Actions for ${APP_DISPLAY_NAME}`,
    }).click();
    cy.findByRole("menuitem", { name: "Reenable" }).should("be.visible");
    cy.findByRole("menuitem", { name: "Remove" }).should("not.exist");
  });

  it("keeps previously-synced apps listed after the repo is unlinked", () => {
    // A sync never deletes and unlinking prunes nothing, so an app synced
    // while a repo was connected stays in the list once the repo is unlinked —
    // now with a Remove action (only offered while unlinked).
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: false,
      url: null,
    });
    cy.intercept("GET", "/api/apps", [fakeApp()]).as("apps");

    cy.visit("/admin/settings/apps");
    cy.wait("@apps");

    cy.findByTestId("admin-layout-content")
      .findByText(APP_DISPLAY_NAME)
      .scrollIntoView()
      .should("be.visible");

    cy.findByRole("button", {
      name: `Actions for ${APP_DISPLAY_NAME}`,
    }).click();
    cy.findByRole("menuitem", { name: "Remove" }).should("be.visible");
  });

  it("lets an admin remove a data app once the repo is unlinked", () => {
    // Repo unlinked, but a previously-synced app is still in the DB (a sync
    // never deletes) — so the admin gets a Remove action to clear it out.
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: false,
      url: null,
    });
    cy.intercept("GET", "/api/apps", [fakeApp()]).as("apps");
    cy.intercept("DELETE", `/api/apps/${APP_NAME}`, { statusCode: 204 }).as(
      "deleteApp",
    );

    cy.visit("/admin/settings/apps");
    cy.wait("@apps");

    cy.findByRole("button", {
      name: `Actions for ${APP_DISPLAY_NAME}`,
    }).click();
    cy.findByRole("menuitem", { name: "Remove" }).click();

    // Confirm in the modal (rendered in a portal outside the layout).
    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: "Remove" }).click();
    });

    cy.wait("@deleteApp");
  });

  it("shows the setup section: repo status, the Git sync link, and the install command", () => {
    cy.intercept("GET", "/api/apps/repo-status", {
      configured: false,
      url: null,
    });
    cy.intercept("GET", "/api/apps", []);

    cy.visit("/admin/settings/apps");

    cy.findByTestId("admin-layout-content").within(() => {
      // With no repo connected, the remote-sync row shows the empty status
      // and the button links to the Git sync settings page.
      cy.findByText("No repository connected").should("be.visible");
      cy.findByRole("link", { name: "Go to Git sync settings" })
        .should("have.attr", "href")
        .and("contain", "/admin/settings/remote-sync");

      // The AI skills install command lists the data-app skills.
      cy.findByText(/npx skills add metabase\/metabase/).should("be.visible");
      cy.findByText(/--skill metabase-data-app-setup/).should("be.visible");
    });
  });

  it("reenables a disabled app from the actions menu", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", [fakeApp({ enabled: false })]);
    cy.intercept("PUT", `/api/apps/${APP_NAME}`, {
      statusCode: 200,
      body: fakeApp(),
    }).as("setEnabled");

    cy.visit("/admin/settings/apps");

    cy.findByRole("button", {
      name: `Actions for ${APP_DISPLAY_NAME}`,
    }).click();
    cy.findByRole("menuitem", { name: "Reenable" }).click();

    cy.wait("@setEnabled")
      .its("request.body")
      .should("deep.equal", { enabled: true });
  });

  it("lists multiple apps, each with its own actions menu", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", [
      fakeApp({ id: 1, name: "alpha", display_name: "Alpha App" }),
      fakeApp({ id: 2, name: "beta", display_name: "Beta App" }),
    ]);

    cy.visit("/admin/settings/apps");

    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByRole("link", { name: "Alpha App" }).should("exist");
      cy.findByRole("link", { name: "Beta App" }).should("exist");
    });
    cy.findByRole("button", { name: "Actions for Alpha App" }).should("exist");
    cy.findByRole("button", { name: "Actions for Beta App" }).should("exist");
  });

  it("renders each sync status: synced sha, sync failure (with reason), and never-synced", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", [
      fakeApp({
        id: 1,
        name: "ok",
        display_name: "Synced App",
        last_synced_sha: "abcdef0",
      }),
      fakeApp({
        id: 2,
        name: "bad",
        display_name: "Failed App",
        sync_error: "boom: bad manifest",
      }),
      fakeApp({
        id: 3,
        name: "new",
        display_name: "New App",
        last_synced_sha: null,
        sync_error: null,
      }),
    ]);

    cy.visit("/admin/settings/apps");

    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByText("Synced abcdef0").should("exist");
      cy.findByText("Sync failed").should(
        "have.attr",
        "title",
        "boom: bad manifest",
      );
      cy.findByText("Not synced yet").should("exist");
    });
  });

  it("shows the allowed-hosts count for an app that declares hosts", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", [
      fakeApp({
        allowed_hosts: ["https://api.example.com", "https://*.acme.com"],
      }),
    ]);

    cy.visit("/admin/settings/apps");

    cy.findByTestId("admin-layout-content")
      .findByText("2 allowed hosts")
      .should("exist");
  });

  it("dismisses the promo banner and keeps it hidden across a reload", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", []);
    cy.intercept(
      "PUT",
      "/api/user-key-value/namespace/user_acknowledgement/key/data-apps-admin-settings-banner",
    ).as("ackBanner");

    cy.visit("/admin/settings/apps");

    H.main()
      .findByText(/AI-generated React apps/)
      .should("be.visible");
    cy.findByRole("button", { name: "Dismiss" }).click();
    cy.wait("@ackBanner");
    H.main()
      .findByText(/AI-generated React apps/)
      .should("not.exist");

    // The dismissal persists (a real user-key-value write), so a reload keeps it hidden.
    cy.reload();
    cy.findByRole("heading", { name: "Data apps" }).should("be.visible");
    H.main()
      .findByText(/AI-generated React apps/)
      .should("not.exist");
  });
});

describe("scenarios > data apps > upsell (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // No token: on the OSS build the `data-apps` feature is unavailable, so the
    // settings page shows the upsell instead of the management UI.
  });

  it("shows the data-apps upsell instead of the management UI", () => {
    cy.visit("/admin/settings/apps");

    H.main().within(() => {
      cy.findByText("Build apps on your data").should("be.visible");
      cy.findByText("Try for free").should("be.visible");
    });
  });

  it("marks the Data apps settings nav item with an upsell gem", () => {
    cy.visit("/admin/settings/apps");

    cy.findByRole("link", { name: /Data apps/ }).within(() => {
      cy.findByTestId("upsell-gem").should("exist");
    });
  });
});
