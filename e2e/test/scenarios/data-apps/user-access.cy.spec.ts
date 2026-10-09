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
