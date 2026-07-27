import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

describe("scenarios > data apps > admin management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  it("Happy Path: lists a data app and renders it in its sandboxed iframe with real SDK data", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    cy.visit("/admin/settings/apps");
    cy.findByRole("link", { name: APP_DISPLAY_NAME })
      .scrollIntoView()
      .should("be.visible");

    cy.intercept("POST", "/api/dataset").as("dataAppQuery");

    H.openDataApp(APP_NAME);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("heading", { name: "Orders overview" }).should(
        "be.visible",
      );

      cy.findByTestId("orders-count", { timeout: 30000 })
        .invoke("text")
        .should("match", /^\d+$/);

      cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
    });

    // The iframe's query requests must be attributed to the data app, so
    // query_execution analytics record which app ran them (EMB-2088).
    cy.wait("@dataAppQuery").then(({ request }) => {
      expect(request.headers["x-metabase-client"]).to.equal("data-app");
      expect(request.headers["x-metabase-client-identifier"]).to.equal(
        APP_NAME,
      );
    });
  });

  it("dismisses the promo banner and keeps it hidden across a reload", () => {
    cy.intercept("GET", "/api/apps/repo-status", { configured: true });
    cy.intercept("GET", "/api/apps", []);
    cy.intercept(
      "PUT",
      "/api/user-key-value/namespace/user_acknowledgement/key/data-apps-admin-settings-banner",
    ).as("ackBanner");

    cy.visit("/admin/settings/apps");

    H.main()
      .findByText(/AI-generated React apps/)
      .should("be.visible");
    cy.findByRole("button", { name: "Dismiss" }).click();
    cy.wait("@ackBanner");
    H.main()
      .findByText(/AI-generated React apps/)
      .should("not.exist");

    // The dismissal persists (a real user-key-value write), so a reload keeps it hidden.
    cy.reload();
    cy.findByRole("heading", { name: "Data apps" }).should("be.visible");
    H.main()
      .findByText(/AI-generated React apps/)
      .should("not.exist");
  });
});

describe("scenarios > data apps > upsell (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // No token: on the OSS build the `data-apps` feature is unavailable, so the
    // settings page shows the upsell instead of the management UI.
  });

  it("shows the data-apps upsell instead of the management UI", () => {
    cy.visit("/admin/settings/apps");

    H.main().within(() => {
      cy.findByText("Build apps on your data").should("be.visible");
      cy.findByText("Try for free").should("be.visible");
    });
  });

  it("marks the Data apps settings nav item with an upsell gem", () => {
    cy.visit("/admin/settings/apps");

    cy.findByRole("link", { name: /Data apps/ }).within(() => {
      cy.findByTestId("upsell-gem").should("exist");
    });
  });
});
