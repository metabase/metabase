const { H } = cy;

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
  });

  it("removes an app whose directory is removed from the repo on the next sync", () => {
    H.copySyncedCollectionFixture();
    H.copySyncedDataAppsFixture();
    H.commitToRepo("Add data apps");
    H.configureGitAndPullChanges("read-write");

    cy.exec(`rm -rf -- "${H.LOCAL_GIT_PATH}/data_apps/good"`);
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
  });
});
