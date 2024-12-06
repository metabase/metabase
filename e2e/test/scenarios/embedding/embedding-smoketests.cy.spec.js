import { H } from "e2e/support";
import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const embeddingPage = "/admin/settings/embedding-in-other-applications";
const standalonePath =
  "/admin/settings/embedding-in-other-applications/standalone";
const upgradeUrl = "https://www.metabase.com/upgrade";
const embeddingDescription =
  "Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.";

// These tests will run on both OSS and EE instances. Both without a token!
describe("scenarios > embedding > smoke tests", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not offer to share or embed models (metabase#20815)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });

    cy.visit(`/model/${ORDERS_QUESTION_ID}`);
    cy.wait("@dataset");

    H.sharingMenuButton().should("not.exist");

    cy.findByTestId("view-footer").within(() => {
      cy.icon("download").should("exist");
    });
  });

  context("embedding disabled", () => {
    beforeEach(() => {
      // We enable embedding by default in the default snapshot that all tests are using.
      // That's why we need to disable it here.
      resetEmbedding();
    });

    it("should display the embedding page correctly", () => {
      cy.visit("/admin/settings/setup");
      sidebar().within(() => {
        cy.findByRole("link", { name: "Embedding" }).click();
      });

      cy.location("pathname").should("eq", embeddingPage);
      mainPage().findByText(embeddingDescription).should("be.visible");
      cy.log(
        "With the embedding enabled, we should now see two new sections on the main page",
      );
      cy.log("The first section: 'Static embedding'");
      cy.findByRole("article", { name: "Static embedding" }).within(() => {
        // FE unit tests are making sure this section doesn't exist when a valid token is provided,
        // so we don't have to do it here using conditional logic
        assertLinkMatchesUrl("upgrade to a specific paid plan", upgradeUrl);

        cy.findByRole("link", { name: "Manage" })
          .should("have.attr", "href")
          .and("eq", standalonePath);
        cy.findByText("Static embedding");
        cy.findByText("Manage").click();
        cy.location("pathname").should("eq", standalonePath);
      });

      cy.log("Standalone embeds page");
      // TODO: Remove this when the actual BE is implemented, this flag still controls the static embedding
      // I've tried to change this but it failed like 500 BE tests.
      cy.request("PUT", "/api/setting/enable-embedding-static", {
        value: true,
      });
      mainPage().within(() => {
        cy.findByLabelText("Enable Static embedding")
          .click({ force: true })
          .should("be.checked");
        cy.findByTestId("embedding-secret-key-setting").within(() => {
          cy.findByText("Embedding secret key");
          cy.findByText(
            "Standalone Embed Secret Key used to sign JSON Web Tokens for requests to /api/embed endpoints. This lets you create a secure environment limited to specific users or organizations.",
          );
          getTokenValue().should("have.length", 64);
          cy.button("Regenerate key");
        });

        cy.findByTestId("embedded-resources").within(() => {
          cy.findByText("Embedded Dashboards");
          cy.findByText("No dashboards have been embedded yet.");

          cy.findByText("Embedded Questions");
          cy.findByText("No questions have been embedded yet.");
        });
      });

      cy.go("back");
      cy.location("pathname").should("eq", embeddingPage);

      cy.log("The second section: 'Interactive embedding'");
      cy.findByRole("article", { name: "Interactive embedding" }).within(() => {
        cy.findByText("Interactive embedding");

        cy.findByRole("link", { name: "Learn More" })
          .should("have.attr", "href")
          .and(
            "eq",
            "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=embed-settings",
          );
      });
    });

    it("should not let you embed the question", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      ensureEmbeddingIsDisabled();
    });

    it("should not let you embed the dashboard", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      ensureEmbeddingIsDisabled();
    });
  });

  context("embedding enabled", () => {
    const ids = {
      question: ORDERS_QUESTION_ID,
      dashboard: ORDERS_DASHBOARD_ID,
    };
    ["question", "dashboard"].forEach(object => {
      it(`should be able to publish/embed and then unpublish a ${object} without filters`, () => {
        cy.request("PUT", "/api/setting/enable-embedding-static", {
          value: true,
        });
        const embeddableObject = object === "question" ? "card" : "dashboard";
        const objectName =
          object === "question" ? "Orders" : "Orders in a dashboard";

        cy.intercept("PUT", `/api/${embeddableObject}/${ids[object]}`).as(
          "embedObject",
        );
        cy.intercept("GET", `/api/${embeddableObject}/embeddable`).as(
          "currentlyEmbeddedObject",
        );

        visitAndEnableSharing(object);

        H.modal().within(() => {
          cy.findByRole("tab", { name: "Look and Feel" }).click();

          cy.findByText("Theme");
          cy.findByLabelText(
            object === "dashboard" ? "Dashboard title" : "Question title",
          );
          cy.findByLabelText(
            object === "dashboard" ? "Dashboard border" : "Question border",
          );
          cy.findByText(
            (_, element) =>
              element.textContent ===
              "You can change the font with a paid plan.",
          );
          cy.findByText("Download buttons").should("not.exist");

          cy.findByRole("tab", { name: "Parameters" }).click();

          cy.findByText(
            `This ${object} doesn't have any parameters to configure yet.`,
          );

          cy.findByText(
            `You will need to publish this ${object} before you can embed it in another application.`,
          );

          cy.button("Publish").click();

          cy.wait("@embedObject");
        });

        H.visitIframe();

        cy.findByTestId("embed-frame").within(() => {
          cy.findByRole("heading", { name: objectName });
          cy.get("[data-testid=cell-data]").contains("37.65");
        });

        cy.findByRole("contentinfo").within(() => {
          cy.findByRole("link", { name: "Powered by Metabase" })
            .should("have.attr", "href")
            .and("contain", "https://www.metabase.com/powered-by-metabase");
        });

        cy.log(
          `Make sure the ${object} shows up in the standalone embeds page`,
        );
        cy.signInAsAdmin();
        cy.visit(standalonePath);
        cy.wait("@currentlyEmbeddedObject");

        const sectionTestId = {
          dashboard: "-embedded-dashboards-setting",
          question: "-embedded-questions-setting",
        }[object];

        cy.findByTestId(sectionTestId)
          .find("tbody tr")
          .should("have.length", 1)
          .and("contain", objectName);

        cy.log(`Unpublish ${object}`);
        visitAndEnableSharing(object, false);

        H.modal().within(() => {
          cy.findByText(
            `This ${object} is published and ready to be embedded.`,
          );
          cy.button("Unpublish").click();

          cy.wait("@embedObject");

          cy.findByRole("tab", { name: "Parameters" }).click();
        });

        H.visitIframe();

        cy.findByTestId("embed-frame").findByText(
          "Embedding is not enabled for this object.",
        );

        cy.signInAsAdmin();
        cy.visit(standalonePath);
        cy.wait("@currentlyEmbeddedObject");

        mainPage()
          .findAllByText(/No (questions|dashboards) have been embedded yet./)
          .should("have.length", 2);
      });
    });

    it("should regenerate embedding token and invalidate previous embed url", () => {
      cy.request("PUT", "/api/setting/enable-embedding-static", {
        value: true,
      });

      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        enable_embedding: true,
      });
      visitAndEnableSharing("question");

      H.modal().within(() => {
        cy.findByRole("tab", { name: "Parameters" }).click();

        cy.findByText("Preview").click();
      });

      cy.document().then(doc => {
        const iframe = doc.querySelector("iframe");

        cy.signOut();
        cy.visit(iframe.src);

        cy.findByTestId("embed-frame").contains("37.65");

        cy.signInAsAdmin();
        cy.visit(standalonePath);

        cy.findByLabelText("Embedding secret key").should(
          "have.value",
          METABASE_SECRET_KEY,
        );

        cy.button("Regenerate key").click();

        H.modal().within(() => {
          cy.intercept("GET", "/api/util/random_token").as("regenerateKey");
          cy.findByRole("heading", { name: "Regenerate embedding key?" });
          cy.findByText(
            "This will cause existing embeds to stop working until they are updated with the new key.",
          );
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.wait("@regenerateKey").then(
          ({
            response: {
              body: { token },
            },
          }) => {
            expect(token).to.have.length(64);
            expect(token).to.not.eq(METABASE_SECRET_KEY);

            cy.findByDisplayValue(token);
          },
        );

        cy.log("Visit the embedding url generated with the old token");
        cy.visit(iframe.src);
        cy.findByTestId("embed-frame").findByText(
          "Message seems corrupt or manipulated",
        );
      });
    });
  });
});

function resetEmbedding() {
  H.updateSetting("enable-embedding-static", false);
  H.updateSetting("embedding-secret-key", null);
}

function getTokenValue() {
  return cy.get("#setting-embedding-secret-key").invoke("val");
}

function assertLinkMatchesUrl(text, url) {
  cy.findByRole("link", { name: text })
    .should("have.attr", "href")
    .and("contain", url);
}

function ensureEmbeddingIsDisabled() {
  H.openSharingMenu();
  H.sharingMenu()
    .findByRole("menuitem", { name: "Embed" })
    .should("be.enabled")
    .click();
  H.modal()
    .findByRole("article", { name: "Static embedding" })
    .within(() => {
      cy.findByText("Disabled.").should("be.visible");
      cy.findByText("Enable in admin settings").should("be.visible");
    });
}

function visitAndEnableSharing(object, acceptTerms = true) {
  if (object === "question") {
    H.visitQuestion(ORDERS_QUESTION_ID);
  }

  if (object === "dashboard") {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
  }

  H.openStaticEmbeddingModal({ acceptTerms });
}

function sidebar() {
  return cy.findByTestId("admin-layout-sidebar");
}

function mainPage() {
  return cy.findByTestId("admin-layout-content");
}
