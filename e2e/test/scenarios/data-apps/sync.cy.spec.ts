const { H } = cy;

const DUPLICATED_SLUG = "duplicated-slug";
const UNIQUE_SLUG = "unique-slug";

describe("scenarios > data apps > repo sync", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.setupGitSync();
  });

  it("fails the pull and tells the admin which apps share a slug, applying none of the repo", () => {
    // Real synced content alongside the apps, so "none of the repo was applied" is
    // something the test can actually observe: the collection below must not land
    // either, which only holds if the pull is rejected before the content import
    // commits — not merely after the data apps are skipped.
    H.copySyncedCollectionFixture();
    H.copySyncedDataAppsFixture();
    H.commitToRepo("Add data apps, two of which share a slug");

    H.configureGit("read-write");

    cy.visit("/");
    H.clickPullOption();

    // What the admin actually sees: the pull fails, and the reason names the slug
    // and both directories — enough to know exactly which app to rename.
    H.syncErrorModal()
      .findByText(
        new RegExp(
          `The slug "${DUPLICATED_SLUG}" is declared by more than one data app`,
        ),
      )
      .should("be.visible")
      .and("contain", "data_apps/duplicated-slug-app/index.js")
      .and("contain", "data_apps/duplicated-slug-app-copy/index.js");

    H.closeSyncErrorModal();

    cy.request({
      url: `/api/apps/${UNIQUE_SLUG}/bundle`,
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);

    H.navigationSidebar().findByText("Synced Collection").should("not.exist");

    cy.visit("/admin/settings/apps");
    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByText("Your data apps will appear here")
        .scrollIntoView()
        .should("be.visible");
    });
  });
});
