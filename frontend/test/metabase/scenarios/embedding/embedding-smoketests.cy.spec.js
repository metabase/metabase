import { restore, visitQuestion } from "__support__/e2e/cypress";

const embeddingPage = "/admin/settings/embedding_in_other_applications";
const licenseUrl = "https://metabase.com/license/embedding";
const upgradeUrl = "https://www.metabase.com/upgrade/";

const licenseExplanation = `In plain English, when you embed charts or dashboards from Metabase in your own application, that application isn't subject to the Affero General Public License that covers the rest of Metabase, provided you keep the Metabase logo and the "Powered by Metabase" visible on those embeds. You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.`;

const isEE = Cypress.env("HAS_ENTERPRISE_TOKEN");
const isOSS = !isEE;

describe("scenarios > embedding > smoke tests", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  context("embedding disabled", () => {
    beforeEach(() => {
      // We enable embedding by default in the default snapshot that all tests are using.
      // That's why we need to disable it here.
      resetEmbedding();
    });

    it("should display the embedding page correctly", () => {
      cy.visit("/admin/settings/setup");
      cy.findByText("Embedding in other Applications").click();

      cy.location("pathname").should("eq", embeddingPage);

      // Some info we provide to users before they enable embedding
      cy.findByText("Using embedding");
      cy.contains(
        "By enabling embedding you're agreeing to the embedding license located at",
      );

      assertLinkMatchesUrl("metabase.com/license/embedding", licenseUrl);

      cy.findByText(licenseExplanation);

      cy.button("Enable").click();

      // Let's examine the contents of the enabled embedding page (the url stays the same)
      cy.location("pathname").should("eq", embeddingPage);
      cy.findByText("Enabled");

      if (isOSS) {
        cy.findByText(/Customization/i);
        cy.findByText(
          "Looking to remove the “Powered by Metabase” logo, customize colors and make it your own?",
        );

        assertLinkMatchesUrl("Explore our paid plans.", upgradeUrl);
      }

      cy.findByText(/Embedding secret key/i);
      cy.findByText(
        "Secret key used to sign JSON Web Tokens for requests to `/api/embed` endpoints.",
      );

      getTokenValue().should("have.length", 64);

      cy.button("Regenerate key");

      // Full app embedding section (available only for EE version and in PRO hosted plans)
      if (isEE) {
        cy.findByText(/Embedding the entire Metabase app/i);
        cy.contains(
          "If you want to embed all of Metabase, enter the origins of the websites or web apps where you want to allow embedding in an iframe, separated by a space. Here are the exact specifications for what can be entered.",
        );
        cy.findByPlaceholderText("https://*.example.com").should("be.empty");
      }

      // List of all embedded dashboards and questions
      cy.findByText(/Embedded dashboards/i);
      cy.findByText("No dashboards have been embedded yet.");

      cy.findByText(/Embedded questions/i);
      cy.findByText("No questions have been embedded yet.");
    });

    it("should not let you embed the question", () => {
      visitQuestion("1");
      cy.icon("share").click();

      ensureEmbeddingIsDisabled();
    });

    it("should not let you embed the dashboard", () => {
      cy.visit("/dashboard/1");

      cy.icon("share").click();
      cy.findByText("Sharing and embedding").click();

      ensureEmbeddingIsDisabled();
    });
  });
});

function resetEmbedding() {
  cy.request("PUT", "/api/setting/enable-embedding", { value: false });
  cy.request("PUT", "/api/setting/embedding-secret-key", {
    value: null,
  });
}

function getTokenValue() {
  return cy.get("#setting-embedding-secret-key").invoke("val");
}

function enableSharing() {
  cy.contains("Enable sharing")
    .siblings()
    .click();
}

function assertLinkMatchesUrl(text, url) {
  cy.findByRole("link", { name: text })
    .should("have.attr", "href")
    .and("eq", url);
}

function ensureEmbeddingIsDisabled() {
  // This is implicit assertion - it would've failed if embedding was enabled
  cy.findByText(/Embed this (question|dashboard) in an application/).closest(
    ".disabled",
  );

  // Let's make sure embedding stays disabled after we enable public sharing
  enableSharing();

  cy.findByText(/Embed this (question|dashboard) in an application/).closest(
    ".disabled",
  );
}
