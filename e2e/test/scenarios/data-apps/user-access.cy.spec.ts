const { H } = cy;

const SYNCED_APP_SLUG = "good";
const ALLOWED_HOST = "https://secret-api.data-app.test";

describe("scenarios > data apps > authentication", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

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
      cy.request(`/api/apps/${SYNCED_APP_SLUG}/bundle`).then((res) => {
        expect(
          String(res.headers["x-metabase-data-app-allowed-hosts"]),
        ).to.contain(ALLOWED_HOST);
      });

      cy.signOut();
    });

    it("does not serve the app, its bundle, its metadata or its allowed hosts", () => {
      cy.request({
        url: `/embed/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
        followRedirect: false,
      }).as("iframeDocument");
      cy.request({
        url: `/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
        followRedirect: false,
      }).as("appPage");
      cy.request({
        url: `/api/apps/${SYNCED_APP_SLUG}/bundle`,
        failOnStatusCode: false,
      }).as("bundle");
      cy.request({
        url: `/api/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
      }).as("metadata");

      cy.then(function () {
        const iframeDocument: Cypress.Response<unknown> = this.iframeDocument;
        const appPage: Cypress.Response<unknown> = this.appPage;
        const bundle: Cypress.Response<unknown> = this.bundle;
        const metadata: Cypress.Response<unknown> = this.metadata;
        const appPageCsp = appPage.headers["content-security-policy"];

        // The SPA shell is still served for the app page; the React app sends
        // the visitor to login. Anchor on it so a 404 or an empty response can't
        // pass the negative checks.
        expect({
          iframeDocumentStatus: iframeDocument.status,
          iframeDocumentRedirectsToLogin: String(
            iframeDocument.headers["location"],
          ).includes("/auth/login"),
          iframeDocumentCspHasAllowedHost: String(
            iframeDocument.headers["content-security-policy"] ?? "",
          ).includes(ALLOWED_HOST),
          appPageStatus: appPage.status,
          appPageIsHtml: String(appPage.headers["content-type"]).includes(
            "text/html",
          ),
          appPageHasCsp: typeof appPageCsp === "string",
          appPageCspHasAllowedHost: String(appPageCsp ?? "").includes(
            ALLOWED_HOST,
          ),
          bundleStatus: bundle.status,
          bundleHasAllowedHostsHeader:
            "x-metabase-data-app-allowed-hosts" in bundle.headers,
          metadataStatus: metadata.status,
        }).to.deep.equal({
          iframeDocumentStatus: 302,
          iframeDocumentRedirectsToLogin: true,
          iframeDocumentCspHasAllowedHost: false,
          appPageStatus: 200,
          appPageIsHtml: true,
          appPageHasCsp: true,
          appPageCspHasAllowedHost: false,
          bundleStatus: 401,
          bundleHasAllowedHostsHeader: false,
          metadataStatus: 401,
        });
      });
    });
  });
});
