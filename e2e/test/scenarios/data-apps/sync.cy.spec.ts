const { H } = cy;

// DEBUG: the app under test globally swallows uncaught exceptions
// (`e2e/support/cypress.js` -> `uncaught:exception` returns false), which turns a
// thrown React error into a silent hang. Re-log it to `console.error` so
// `--enable-logging=stderr` (see MB_LOG_CONSOLE in config.js) forwards it to CI
// stdout out-of-process, surviving the near-instant hang/crash.
Cypress.on("uncaught:exception", (err) => {
  console.error("[MB-UNCAUGHT]", err && err.message, "\n", err && err.stack);
  return false;
});

/**
 * Drives a real remote-sync pull of a repo whose `data_apps/` covers every
 * materialization outcome, and asserts each is handled the way the backend
 * intends (see `data-apps.sync` / `data-apps.config`):
 *
 *   good/          valid config + bundle        -> materialized, served
 *   broken-bundle/ valid config, missing bundle -> row with "Sync failed", not served
 *   bad-config/    malformed data_app.yaml       -> skipped, no row
 *   no-config/     a bundle but no data_app.yaml -> not discovered, no row
 *
 * A bad app never blocks a good one, and neither a bad config nor a missing
 * bundle removes an app that isn't theirs.
 */
describe("scenarios > data apps > repo sync", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.setupGitSync();
  });

  it("materializes each app per its config/bundle, isolating the broken ones", () => {
    H.copySyncedCollectionFixture();
    H.copySyncedDataAppsFixture();
    H.commitToRepo("Add data apps with mixed config/bundle states");

    H.configureGitAndPullChanges("read-write");

    cy.visit("/admin/settings/apps");
    // DEBUG: verifies --enable-logging forwards page console to CI stdout.
    cy.window().then((win) => {
      win.console.error("[MB-CAPTURE-TEST] admin apps page visited");
    });
    cy.findByTestId("admin-layout-content").within(() => {
      // The good app is materialized and shown as synced. Scope to its own row so
      // its status can't be satisfied by another app's — a "Sync failed" leaking
      // onto the good app (or "Synced" onto the broken one) must fail the test.
      cy.findByTestId("data-app-list-item-good")
        .scrollIntoView()
        .within(() => {
          cy.findByRole("link", { name: "Good App" }).should("be.visible");
          cy.findByText(/^Synced/).should("be.visible");
        });

      // The app whose bundle is missing still appears — with its failure, not hidden.
      // Its name is plain text, not a link: a sync-failed app can't be opened.
      cy.findByTestId("data-app-list-item-broken-bundle")
        .scrollIntoView()
        .within(() => {
          cy.findByText("Broken Bundle").should("be.visible");
          cy.findByRole("link", { name: "Broken Bundle" }).should("not.exist");
          cy.findByText("Sync failed").should("be.visible");
        });

      // The malformed config and the config-less directory produced no app at all.
      cy.findByText("/apps/bad-config").should("not.exist");
      cy.findByText("/apps/no-config").should("not.exist");
    });

    // The API tells the same story: exactly the two apps, and only the good one serves a bundle.
    cy.request("GET", "/api/apps").then(({ body: apps }) => {
      expect(apps.map((app: { name: string }) => app.name).sort()).to.deep.eq([
        "broken-bundle",
        "good",
      ]);
    });

    cy.request("/api/apps/good/bundle").its("status").should("eq", 200);

    cy.request({
      url: "/api/apps/broken-bundle/bundle",
      failOnStatusCode: false,
    }).then(({ status, body }) => {
      expect(status).to.eq(404);
      expect(body).to.deep.eq({ error: "Bundle not synced yet" });
    });

    for (const slug of ["bad-config", "no-config"]) {
      cy.request({
        url: `/api/apps/${slug}/bundle`,
        failOnStatusCode: false,
      }).then(({ status, body }) => {
        expect(status).to.eq(404);
        expect(body).to.eq("Not found.");
      });
    }

    // And what a user opening the broken app sees: its metadata loads (the app
    // exists), the host frames it, and the bundle 404 surfaces from inside the
    // iframe as the "isn't ready yet" screen — driven by the real pull, no mocks.
    // (The not-found screen for a missing app is covered in viewing.cy.spec.ts.)
    cy.visit("/apps/broken-bundle");
    H.main()
      .findByText(/isn.t ready yet/i, { timeout: 30000 })
      .should("be.visible");
  });
});
