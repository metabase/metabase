import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

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
    H.provisionSyncedDataAppResources();
    H.commitToRepo("Add data apps with mixed config/bundle states");

    H.configureGitAndPullChanges("read-write");

    cy.visit("/admin/settings/apps");
    cy.findByTestId("admin-layout-content").within(() => {
      // The good app is materialized and shown as synced. Scope to its own row so
      // its status can't be satisfied by another app's — a "Sync failed" leaking
      // onto the good app (or "Synced" onto the broken one) must fail the test.
      cy.findByTestId("data-app-list-item-good")
        .scrollIntoView()
        .within(() => {
          cy.findByRole("link", { name: "Good App" }).should("be.visible");
          cy.findByText("A well-formed app that syncs cleanly").should(
            "be.visible",
          );
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

  it("prunes an app whose directory is removed from the repo on the next sync", () => {
    H.copySyncedCollectionFixture();
    H.copySyncedDataAppsFixture();
    H.provisionSyncedDataAppResources();
    H.commitToRepo("Add data apps");
    H.configureGitAndPullChanges("read-write");

    // Both apps are materialized from the first pull.
    cy.request("GET", "/api/apps").then(({ body: apps }) => {
      expect(apps.map((app: { name: string }) => app.name).sort()).to.deep.eq([
        "broken-bundle",
        "good",
      ]);
    });

    // Delete the good app's directory from the repo and sync again. The connected
    // repo is the source of truth, so the app must be pruned — not left serving.
    cy.exec(`rm -rf -- "${H.LOCAL_GIT_PATH}/data_apps/good"`);
    H.commitToRepo("Remove the good app from the repo");
    H.configureGitAndPullChanges("read-write");

    // `good` is gone; `broken-bundle` (still in the repo) survives.
    cy.request("GET", "/api/apps").then(({ body: apps }) => {
      expect(apps.map((app: { name: string }) => app.name)).to.deep.eq([
        "broken-bundle",
      ]);
    });
    cy.request({ url: "/api/apps/good", failOnStatusCode: false })
      .its("status")
      .should("eq", 404);

    // The admin list reflects the removal.
    cy.visit("/admin/settings/apps");
    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByTestId("data-app-list-item-broken-bundle").should("exist");
      cy.findByTestId("data-app-list-item-good").should("not.exist");
    });
  });
  describe("when the manifest repoints the app at another collection", () => {
    const APP_SLUG = "good";

    /** A repoint demands an empty target, so the copy is always left behind. */
    const repointToNewCollection = () => {
      H.copySyncedCollectionFixture();
      H.copySyncedDataAppsFixture();
      H.declareSyncedDataAppQuery(APP_SLUG, ORDERS_ID);
      H.provisionSyncedDataAppResources();
      H.commitToRepo("Add data apps");
      H.configureGitAndPullChanges("read-write");

      return cy
        .request(`/api/apps/${APP_SLUG}`)
        .then(({ body: app }) =>
          cy
            .request(
              `/api/collection/${app.resource_collection_id}/items?models=card`,
            )
            .then(({ body }) => body.data[0]),
        )
        .then((copy) =>
          cy
            .request("POST", "/api/collection", { name: "Somewhere else" })
            .then(({ body: destination }) => {
              const manifestPath = `${H.LOCAL_GIT_PATH}/data_apps/${APP_SLUG}/data_app.yaml`;

              cy.readFile(manifestPath).then((manifest: string) =>
                cy.writeFile(
                  manifestPath,
                  manifest.replace(
                    /^resource_collection_entity_id: .*$/m,
                    `resource_collection_entity_id: ${destination.entity_id}`,
                  ),
                ),
              );
              H.commitToRepo("Point the app at another collection");
              H.configureGitAndPullChanges("read-write");

              cy.request(`/api/apps/${APP_SLUG}`)
                .its("body.resource_collection_id")
                .should("eq", destination.id);

              return cy.wrap({ copy, destination }, { log: false });
            }),
        );
    };

    const syncApp = () =>
      H.createDataAppApiKey().then((apiKey) =>
        H.syncDataAppResources(
          apiKey,
          `${H.LOCAL_GIT_PATH}/data_apps/${APP_SLUG}`,
        ),
      );

    it("moves the copy the app left behind into its new collection", () => {
      repointToNewCollection().then(({ copy, destination }) => {
        syncApp().then(({ ok, error }) => {
          expect(error, "sync-resources failed").to.eq(null);
          expect(ok).to.eq(true);
        });

        cy.request(`/api/card/${copy.id}`)
          .its("body.collection_id")
          .should("eq", destination.id);
      });
    });

    it("refuses a copy that was moved out by hand instead of sweeping it up", () => {
      repointToNewCollection().then(({ copy }) => {
        cy.request("POST", "/api/collection", { name: "Taken by hand" }).then(
          ({ body: elsewhere }) => {
            cy.request("PUT", `/api/card/${copy.id}`, {
              collection_id: elsewhere.id,
            });
            // Dropping the declaration asks for the copy to be deleted.
            cy.exec(
              `rm -f "${H.LOCAL_GIT_PATH}/data_apps/${APP_SLUG}/queries/orders.query.ts"`,
            );

            syncApp().should(({ ok, error }) => {
              expect(ok, "sync-resources should have refused").to.eq(false);
              expect(error).to.contain(`Move card ${copy.id} back to`);
            });

            cy.request(`/api/card/${copy.id}`)
              .its("body.collection_id")
              .should("eq", elsewhere.id);
          },
        );
      });
    });
  });
});
