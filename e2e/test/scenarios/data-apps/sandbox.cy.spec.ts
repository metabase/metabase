import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

describe("scenarios > data apps > sandbox & isolation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  describe("sandboxing", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;
    const BLOCKED_URL = "https://blocked.data-app.test/ping";

    it("blocks disallowed APIs and cross-origin fetch, but permits allowed_hosts", () => {
      // The allowed host is stubbed with a CORS header so the sandbox's real
      // network call resolves; the blocked host is never intercepted because the
      // sandbox rejects it before it reaches the network.
      cy.intercept("GET", ALLOWED_URL, {
        statusCode: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "pong",
      });

      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        allowedHosts: [ALLOWED_ORIGIN],
        testEnv: {
          ...TEST_ENV,
          sandbox: { allowedUrl: ALLOWED_URL, blockedUrl: BLOCKED_URL },
        },
      });

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: "Sandbox" }).click();

        // A blocked DOM API throws synchronously inside the sandbox.
        cy.findByTestId("probe-script", { timeout: 30000 }).should(
          "have.text",
          "blocked",
        );

        // A fetch to a host not in allowed_hosts is rejected by the sandbox.
        cy.findByTestId("blocked-fetch-result", { timeout: 30000 }).should(
          "contain",
          "not in allowed_hosts",
        );

        // A fetch to a host in allowed_hosts reaches the (stubbed) network.
        cy.findByTestId("allowed-fetch-result", { timeout: 30000 }).should(
          "have.text",
          "ok: 200",
        );
      });
    });
  });

  describe("sandbox breadth", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;
    const BLOCKED_URL = "https://blocked.data-app.test/ping";

    // Method/constructor calls the sandbox distortion replaces with a throwing
    // shim. (Getter-only reads like `localStorage` aren't intercepted, so they
    // aren't asserted here.)
    const BLOCKED_PROBE_IDS = [
      "script",
      "window-open",
      "alert",
      "history",
      "keydown-listener",
      "websocket",
      "sendbeacon",
    ];

    it("blocks a broad set of dangerous globals, strips innerHTML, and gates XHR", () => {
      cy.intercept("GET", ALLOWED_URL, {
        statusCode: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "pong",
      });

      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        allowedHosts: [ALLOWED_ORIGIN],
        testEnv: {
          ...TEST_ENV,
          sandbox: {
            allowedUrl: ALLOWED_URL,
            blockedUrl: BLOCKED_URL,
            xhrAllowedUrl: ALLOWED_URL,
            xhrBlockedUrl: BLOCKED_URL,
          },
        },
      });

      visitAppRoute("sandboxing");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        BLOCKED_PROBE_IDS.forEach((id) => {
          cy.findByTestId(`probe-${id}`, { timeout: 30000 }).should(
            "have.text",
            "blocked",
          );
        });

        cy.findByTestId("probe-innerhtml").should("have.text", "stripped");

        // XHR obeys the same allowlist as fetch.
        cy.findByTestId("blocked-xhr-result").should("contain", "blocked");
        cy.findByTestId("allowed-xhr-result", { timeout: 30000 }).should(
          "have.text",
          "ok: 200",
        );
      });
    });
  });

  describe("isolation", () => {
    const openIsolationPage = () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });
      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: "Isolation" }).click();
      });
    };

    it("keeps the app's CSS inside the iframe", () => {
      openIsolationPage();

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        // The injected <style> applies to the app's own document.
        cy.findByTestId("css-injected").should("have.text", "ok");
        cy.findByTestId("isolation-css-probe").should(
          "have.css",
          "color",
          "rgb(0, 128, 0)",
        );
      });

      // The aggressive `body` rule injected in the iframe does not reach the
      // parent document.
      cy.get("body").should(
        "not.have.css",
        "background-color",
        "rgb(0, 128, 0)",
      );
    });

    it("keeps the app's JS globals out of the parent realm (near-membrane)", () => {
      openIsolationPage();

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        // The app set the global in its own realm and read it back.
        cy.findByTestId("js-marker").should("have.text", "in-app");
      });

      // The parent window never sees the app's global.
      cy.window().should("not.have.property", "__DATA_APP_ISOLATION_MARKER__");
    });
  });

  describe("iframe security headers", () => {
    it("serves the embed document with the expected CSP + framing headers", () => {
      cy.request({
        url: `/embed/apps/${APP_NAME}`,
        failOnStatusCode: false,
      }).then((res) => {
        const csp = String(res.headers["content-security-policy"] ?? "");
        expect(csp).to.contain("frame-ancestors 'self'");
        expect(csp).to.contain("default-src 'none'");
        expect(csp).to.contain("form-action 'none'");
        expect(csp).to.contain("'unsafe-eval'");
        expect(String(res.headers["x-frame-options"] ?? "")).to.match(
          /sameorigin/i,
        );
      });
    });

    it("renders the app in a locked-down sandboxed iframe", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      H.openDataApp(APP_NAME);
      cy.get(`iframe[title="${APP_DISPLAY_NAME}"]`)
        .should("have.attr", "sandbox")
        .and("contain", "allow-scripts");
    });
  });
});
