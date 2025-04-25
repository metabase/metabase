const { H } = cy;

import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > embedding > sdk iframe embedding > entity ids", () => {
  let apiKey;
  let dashboardEntityId;
  let questionEntityId;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.log("Creating API key for testing");
    H.createApiKey("Test SDK Embedding Key", "all").then(({ body }) => {
      apiKey = body.unmasked_key;
    });

    cy.log("Enabling embedding globally");
    cy.request("PUT", "/api/setting/enable-embedding-static", {
      value: true,
    });

    cy.log("Getting entity IDs for test resources");
    cy.request("GET", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).then(
      ({ body }) => {
        dashboardEntityId = body.entity_id;
      },
    );

    cy.request("GET", `/api/card/${ORDERS_QUESTION_ID}`).then(({ body }) => {
      questionEntityId = body.entity_id;
    });
  });

  it("should embed dashboard using entity ID", () => {
    cy.log("Enabling embedding for the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: true,
    });

    cy.log("Creating test page with embed.js using entity ID");
    const testPage = createTestPage({
      resourceType: "dashboard",
      resourceId: dashboardEntityId,
      useEntityId: true,
      apiKey,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying iframe creation and content");
    cy.get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .should("exist")
      .find("[data-testid='embed-frame']")
      .should("be.visible")
      .contains("Orders in a dashboard")
      .should("be.visible");
  });

  it("should embed question using entity ID", () => {
    cy.log("Enabling embedding for the question");
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      enable_embedding: true,
    });

    cy.log("Creating test page with embed.js using entity ID");
    const testPage = createTestPage({
      resourceType: "question",
      resourceId: questionEntityId,
      useEntityId: true,
      apiKey,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying iframe creation and content");
    cy.get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .should("exist")
      .find("[data-testid='embed-frame']")
      .should("be.visible")
      .contains("Orders")
      .should("be.visible");
  });

  it("should handle archived resource gracefully", () => {
    cy.log("Enabling embedding and archiving the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: true,
      archived: true,
    });

    cy.log("Creating test page with embed.js");
    const testPage = createTestPage({
      resourceType: "dashboard",
      resourceId: dashboardEntityId,
      useEntityId: true,
      apiKey,
    });

    cy.log("Loading test page");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");

    cy.log("Verifying error message for archived resource");
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-error']")
      .should("be.visible")
      .should("contain", "Resource not found");
  });

  it("should handle revoked embedding permissions", () => {
    cy.log("Initially enabling embedding");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: true,
    });

    cy.log("Creating test page with embed.js");
    const testPage = createTestPage({
      resourceType: "dashboard",
      resourceId: dashboardEntityId,
      useEntityId: true,
      apiKey,
    });

    cy.log("Loading test page and verifying initial state");
    cy.createHtmlFile({ path: "/tmp/test.html", content: testPage });
    cy.visit("/tmp/test.html");
    cy.get("iframe")
      .should("be.visible")
      .its("0.contentDocument")
      .find("[data-testid='embed-frame']")
      .should("be.visible");

    cy.log("Revoking embedding permission");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      enable_embedding: false,
    });

    cy.log("Verifying error after permission revocation");
    cy.reload();
    cy.get("iframe")
      .its("0.contentDocument")
      .find("[data-testid='embed-error']")
      .should("be.visible")
      .should("contain", "Embedding is not enabled for this resource");
  });
});

function createTestPage({
  resourceType,
  resourceId,
  apiKey,
  useEntityId = false,
}) {
  const resourceIdProp =
    resourceType === "dashboard" ? "dashboardId" : "questionId";
  const idProp = useEntityId ? "entityId" : resourceIdProp;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
    </head>
    <body>
      <script src="http://localhost:3000/app/embed.js"></script>

      <div id="metabase-embed-container"></div>

      <style>
        body {
          margin: 0;
        }

        #metabase-embed-container {
          height: 100vh;
        }
      </style>

      <script>
        const { MetabaseEmbed } = window["metabase.embed"];

        const embed = new MetabaseEmbed({
          target: "#metabase-embed-container",
          url: "http://localhost:3000",
          ${idProp}: "${resourceId}",
          apiKey: "${apiKey}",
        });
      </script>
    </body>
    </html>
  `;
}
