import {
  restore,
  visitQuestion,
  isEE,
  isOSS,
  visitDashboard,
  visitIframe,
} from "e2e/support/helpers";

const embeddingPage = "/admin/settings/embedding-in-other-applications";
const licenseUrl = "https://metabase.com/license/embedding";
const upgradeUrl = "https://www.metabase.com/upgrade";
const learnEmbeddingUrl =
  "https://www.metabase.com/learn/embedding/embedding-charts-and-dashboards.html";

const licenseExplanations = [
  `When you embed charts or dashboards from Metabase in your own application, that application isn't subject to the Affero General Public License that covers the rest of Metabase, provided you keep the Metabase logo and the "Powered by Metabase" visible on those embeds.`,
  `Your should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.`,
];

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

    it("should display the embedding page correctly", { tags: "@OSS" }, () => {
      cy.visit("/admin/settings/setup");
      sidebar().within(() => {
        cy.findByText("Embedding").click();
      });

      cy.location("pathname").should("eq", embeddingPage);

      // Some info we provide to users before they enable embedding
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("More details");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("By enabling embedding you're agreeing to");

      assertLinkMatchesUrl("our embedding license.", licenseUrl);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("More details").click();
      licenseExplanations.forEach(licenseExplanation => {
        cy.findByText(licenseExplanation);
      });

      cy.button("Enable").click();

      // Let's examine the contents of the enabled embedding page (the url stays the same)
      cy.location("pathname").should("eq", embeddingPage);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(
        "Allow questions, dashboards, and more to be embedded. Learn more.",
      );
      assertLinkMatchesUrl("Learn more.", learnEmbeddingUrl);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Enabled");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Standalone embeds").click();
      if (isOSS) {
        cy.contains(
          "In order to remove the Metabase logo from embeds, you can always upgrade to one of our paid plans.",
        );

        assertLinkMatchesUrl("one of our paid plans.", upgradeUrl);
      }

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Embedding secret key/i);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Standalone Embed Secret Key used to sign JSON Web Tokens for requests to /api/embed endpoints. This lets you create a secure environment limited to specific users or organizations.",
      );

      getTokenValue().should("have.length", 64);

      cy.button("Regenerate key");

      // List of all embedded dashboards and questions
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Embedded dashboards/i);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No dashboards have been embedded yet.");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Embedded questions/i);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No questions have been embedded yet.");

      // Full app embedding section (available only for EE version and in PRO hosted plans)
      if (isEE) {
        sidebar().within(() => {
          cy.findByText("Embedding").click();
        });
        cy.findByText("Full-app embedding").click();
        cy.findByText(/Embedding the entire Metabase app/i);
        cy.contains(
          "With this Pro/Enterprise feature you can embed the full Metabase app. Enable your users to drill-through to charts, browse collections, and use the graphical query builder. Learn more.",
        );
        cy.contains(
          "Enter the origins for the websites or web apps where you want to allow embedding, separated by a space. Here are the exact specifications for what can be entered.",
        );
        cy.findByPlaceholderText("https://*.example.com").should("be.empty");
      }
    });

    it("should not let you embed the question", () => {
      visitQuestion("1");
      cy.icon("share").click();

      ensureEmbeddingIsDisabled();
    });

    it("should not let you embed the dashboard", () => {
      visitDashboard(1);

      cy.icon("share").click();

      ensureEmbeddingIsDisabled();
    });
  });

  context("embedding enabled", { tags: "@OSS" }, () => {
    ["question", "dashboard"].forEach(object => {
      it(`should be able to publish/embed and then unpublish a ${object} without filters`, () => {
        const embeddableObject = object === "question" ? "card" : "dashboard";
        const objectName =
          object === "question" ? "Orders" : "Orders in a dashboard";

        cy.intercept("PUT", `/api/${embeddableObject}/1`).as("embedObject");
        cy.intercept("GET", `/api/${embeddableObject}/embeddable`).as(
          "currentlyEmbeddedObject",
        );

        visitAndEnableSharing(object);

        if (isEE) {
          cy.findByText("Font");
        }

        if (isOSS) {
          cy.findByText("Font").should("not.exist");
        }

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Parameters");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(
          /This (question|dashboard) doesn't have any parameters to configure yet./,
        );

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(
          /You will need to publish this (question|dashboard) before you can embed it in another application./,
        );

        cy.button("Publish").click();
        cy.wait("@embedObject");

        visitIframe();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(objectName);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("37.65");

        if (isOSS) {
          cy.contains("Powered by Metabase")
            .closest("a")
            .should("have.attr", "href")
            .and("eq", "https://metabase.com/");
        } else {
          cy.contains("Powered by Metabase").should("not.exist");
        }

        cy.signInAsAdmin();

        cy.visit(embeddingPage);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Standalone embeds").click();
        cy.wait("@currentlyEmbeddedObject");

        const sectionName = new RegExp(`Embedded ${object}s`, "i");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(sectionName)
          .closest("li")
          .find("tbody tr")
          .should("have.length", 1)
          .and("contain", objectName);

        visitAndEnableSharing(object);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Danger zone");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(
          /This will disable embedding for this (question|dashboard)./,
        );

        cy.button("Unpublish").click();
        cy.wait("@embedObject");

        visitIframe();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Embedding is not enabled for this object.");

        cy.signInAsAdmin();

        cy.visit(embeddingPage);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Standalone embeds").click();
        cy.wait("@currentlyEmbeddedObject");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(/No (questions|dashboards) have been embedded yet./);
      });
    });
  });

  it("should not offer to share or embed models (metabase#20815)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.request("PUT", "/api/card/1", { dataset: true });

    cy.visit("/model/1");
    cy.wait("@dataset");

    cy.icon("share").should("not.exist");
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
  cy.contains("Enable sharing").siblings().click();
}

function assertLinkMatchesUrl(text, url) {
  cy.findByRole("link", { name: text })
    .should("have.attr", "href")
    .and("contain", url);
}

function ensureEmbeddingIsDisabled() {
  // This is implicit assertion - it would've failed if embedding was enabled
  cy.findByText(/Embed in your application/).closest(".disabled");

  // Let's make sure embedding stays disabled after we enable public sharing
  enableSharing();

  cy.findByText(/Embed in your application/).closest(".disabled");
}

function visitAndEnableSharing(object) {
  if (object === "question") {
    visitQuestion("1");
    cy.icon("share").click();
    cy.findByText(/Embed in your application/).click();
  }

  if (object === "dashboard") {
    visitDashboard(1);

    cy.icon("share").click();
    cy.findByText(/Embed in your application/).click();
  }
}

function sidebar() {
  return cy.get(".AdminList");
}
