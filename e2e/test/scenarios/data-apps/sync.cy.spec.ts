import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { DataApp } from "metabase-types/api";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

/**
 * Drives a real remote-sync pull of a repo whose `data_apps/` holds two apps, each a `data_app.yaml` with its bundle
 * next to it, and asserts that pulls materialize and remove them.
 */
describe("scenarios > data apps > repo sync", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.setupGitSync();
  });

  it("materializes each app with its bundle", () => {
    H.copySyncedCollectionFixture();
    H.copySyncedDataAppsFixture();
    H.commitToRepo("Add data apps");

    H.configureGitAndPullChanges("read-write");

    cy.visit("/admin/settings/apps");
    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByTestId("data-app-list-item-good")
        .scrollIntoView()
        .within(() => {
          cy.findByRole("link", { name: "Good App" }).should("be.visible");
          cy.findByText("A well-formed app that syncs cleanly").should(
            "be.visible",
          );
        });
      cy.findByTestId("data-app-list-item-second-app").should("exist");
    });

    cy.request("GET", "/api/apps").then(({ body: apps }) => {
      expect(apps.map((app: { name: string }) => app.name).sort()).to.deep.eq([
        "good",
        "second-app",
      ]);
    });

    cy.request("/api/apps/good/bundle").its("status").should("eq", 200);

    // The good app's collection files were loaded with it: its collection, and
    // the saved question in it, addressed by the entity IDs the files carry.
    cy.request<DataApp>("/api/apps/good").then(({ body: app }) => {
      cy.request("/api/collection/goodAppCollection0000")
        .its("body.id")
        .should("eq", app.resource_collection_id);
      cy.request("/api/card/goodAppOrdersQuestion")
        .its("body.collection_id")
        .should("eq", app.resource_collection_id);
      expect(app.table_ids).to.deep.eq([ORDERS_ID]);
    });
  });

  it("removes an app whose directory and collection files are removed from the repo on the next sync", () => {
    H.copySyncedCollectionFixture();
    H.copySyncedDataAppsFixture();
    H.commitToRepo("Add data apps");
    H.configureGitAndPullChanges("read-write");

    // An author deletes an app by deleting its directory and its collection's
    // files in one commit; the pull deletes the app, and the app deletes its
    // collection with what it holds.
    cy.task("removeDataAppPaths", {
      paths: [
        `${H.LOCAL_GIT_PATH}/data_apps/good`,
        `${H.LOCAL_GIT_PATH}/collections/data_apps/data_app__good_app.yaml`,
        `${H.LOCAL_GIT_PATH}/collections/data_apps/data_app__good_app`,
      ],
    });
    H.commitToRepo("Remove the good app from the repo");
    H.configureGitAndPullChanges("read-write");

    cy.request("GET", "/api/apps").then(({ body: apps }) => {
      expect(apps.map((app: { name: string }) => app.name)).to.deep.eq([
        "second-app",
      ]);
    });
    cy.request({ url: "/api/apps/good", failOnStatusCode: false })
      .its("status")
      .should("eq", 404);
    cy.request({
      url: "/api/card/goodAppOrdersQuestion",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
    cy.request({
      url: "/api/collection/goodAppCollection0000",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
  });
});
