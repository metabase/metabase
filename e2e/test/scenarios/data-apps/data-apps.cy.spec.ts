import type { DataAppTestEnv } from "e2e/support/assets/data-apps/renders-interactive-question/src/test-env";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { DataApp } from "metabase-types/api";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

const APP_NAME = "renders-interactive-question";
const APP_DISPLAY_NAME = "Renders Interactive Question";

const source = { type: "table" as const, id: ORDERS_ID };
const TEST_ENV: DataAppTestEnv = {
  scalarQuery: {
    source,
    aggregations: [{ type: "operator", operator: "count", args: [] }],
  },
  questionQuery: { source },
};

// A minimal DataApp-shaped row for admin-list state tests that don't need a real
// built bundle — they only assert how the management UI renders the list. The
// iframe-rendering tests use `H.mockDataApp`, which builds the real bundle.
const fakeApp = (overrides: Partial<DataApp> = {}): DataApp => ({
  id: 1,
  name: APP_NAME,
  display_name: APP_DISPLAY_NAME,
  bundle_path: `data_apps/${APP_NAME}/dist/index.js`,
  enabled: true,
  allowed_hosts: [],
  bundle_hash: "abc123",
  last_synced_sha: "abc123def",
  last_synced_at: "2026-01-01T00:00:00Z",
  sync_error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("scenarios > data apps", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
  });

  describe("admin management page", () => {
    it("Happy Path: lists a data app and renders it in its sandboxed iframe with real SDK data", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      cy.visit("/admin/settings/apps");
      cy.findByRole("link", { name: APP_DISPLAY_NAME }).should("be.visible");

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
    });

    it("shows an empty state when no repository is connected", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: false,
      }).as("repoStatus");
      cy.intercept("GET", "/api/apps", []);

      cy.visit("/admin/settings/apps");
      cy.wait("@repoStatus");

      cy.findByTestId("admin-layout-content")
        .findByText(
          "No repository is connected yet. Connect one in Git sync settings to add data apps.",
        )
        .should("be.visible");
      // The "Apps" section only renders once a repo is connected.
      cy.findByRole("heading", { name: "Apps" }).should("not.exist");
    });

    it("shows an empty state when the connected repository has no apps", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: true,
      });
      cy.intercept("GET", "/api/apps", []).as("apps");

      cy.visit("/admin/settings/apps");
      cy.wait("@apps");

      cy.findByTestId("admin-layout-content")
        .findByText("The connected repository has no data apps yet.")
        .should("be.visible");
    });

    it("lists an enabled app with an Open link and a working enable toggle", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: true,
      });
      cy.intercept("GET", "/api/apps", [fakeApp()]);
      cy.intercept("PUT", `/api/apps/${APP_NAME}`, {
        statusCode: 200,
        body: fakeApp({ enabled: false }),
      }).as("setEnabled");

      cy.visit("/admin/settings/apps");

      // An enabled app links to its route and shows its path + an Open link.
      cy.findByRole("link", { name: APP_DISPLAY_NAME }).should("be.visible");
      cy.findByTestId("admin-layout-content")
        .findByText(`/apps/${APP_NAME}`)
        .should("be.visible");
      cy.findByRole("link", { name: /Open/ })
        .should("have.attr", "href")
        .and("contain", `/apps/${APP_NAME}`);

      // Toggling the switch off issues the disable mutation. The Mantine Switch
      // input is visually hidden, so click it with `force`.
      cy.findByRole("switch", { name: `Enable ${APP_DISPLAY_NAME}` }).click({
        force: true,
      });
      cy.wait("@setEnabled")
        .its("request.body")
        .should("deep.equal", { enabled: false });
    });

    it("unlinks the name and disables Open for a disabled app", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: true,
      });
      cy.intercept("GET", "/api/apps", [fakeApp({ enabled: false })]);

      cy.visit("/admin/settings/apps");

      // A disabled app isn't reachable, so its name is plain text (not a link)
      // and the Open control has no href (not a link).
      cy.findByTestId("admin-layout-content").within(() => {
        cy.findByText(APP_DISPLAY_NAME).should("be.visible");
        cy.findByRole("link", { name: APP_DISPLAY_NAME }).should("not.exist");
        cy.findByRole("link", { name: /Open/ }).should("not.exist");
      });
    });

    it("shows the setup section: install command and the Git sync link", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: false,
      });
      cy.intercept("GET", "/api/apps", []);

      cy.visit("/admin/settings/apps");

      // Remote-sync link points at the Git sync settings page.
      cy.findByRole("link", {
        name: /Configure the connected repository in Git sync settings/,
      })
        .should("have.attr", "href")
        .and("contain", "/admin/settings/remote-sync");

      // The skills install command references the data-app skills.
      cy.findByDisplayValue(/npx skills add metabase\/metabase/).should(
        "exist",
      );
      cy.findByDisplayValue(/--skill metabase-data-app-setup/).should("exist");
    });
  });

  describe("viewing permissions", () => {
    it("lets a non-admin open a data app by direct URL", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      // A normal (non-admin) user has data access, so the app opens and renders
      // its data — the admin gate is only on *managing* apps, not viewing them.
      cy.signInAsNormalUser();
      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByTestId("orders-count", { timeout: 30000 })
          .invoke("text")
          .should("match", /^\d+$/);
      });
    });

    it("opens the app shell for a user without data access, but shows no data", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      // The `nodata` user can open the app (viewing isn't gated), but the query
      // the app runs goes through the QP with the user's own permissions — with
      // no data access it resolves to no data (the fixture renders "—").
      cy.signIn("nodata");
      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByTestId("orders-count", { timeout: 30000 }).should(
          "have.text",
          "—",
        );
      });
    });

    it("shows a not-found state for a disabled or missing app", () => {
      // A disabled or non-existent app 404s from the metadata endpoint; the host
      // renders a not-found state rather than a broken iframe.
      cy.intercept("GET", `/api/apps/${APP_NAME}`, {
        statusCode: 404,
        body: {},
      }).as("meta");

      H.openDataApp(APP_NAME);
      cy.wait("@meta");
      H.main().findByText("Data app not found").should("be.visible");
    });
  });

  describe("internal routing", () => {
    it("mirrors internal route changes into the parent URL", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        // Navigate to a nested page using the exposed `DataAppLink`.
        cy.findByRole("link", { name: "Details" }).click();
        cy.findByRole("heading", { name: "Order details" }).should(
          "be.visible",
        );
      });

      // The iframe's client-side navigation is mirrored to the parent's URL bar
      // (via replaceState), so the top-level path reflects the nested route.
      cy.location("pathname").should("eq", `/apps/${APP_NAME}/details`);
    });
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
        cy.findByTestId("blocked-api-result", { timeout: 30000 }).should(
          "contain",
          "blocked createElement: script",
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
