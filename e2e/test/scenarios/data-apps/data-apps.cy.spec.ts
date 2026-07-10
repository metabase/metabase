import type { DataAppTestEnv } from "e2e/support/assets/data-apps/renders-interactive-question/src/test-env";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { DataApp } from "metabase-types/api";

const { H } = cy;

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const APP_NAME = "renders-interactive-question";
const APP_DISPLAY_NAME = "Renders Interactive Question";

// Visit a nested route inside a data app. `H.openDataApp` encodes the slug, so
// it can't carry a sub-path — deep-links go through a raw `cy.visit`.
const visitAppRoute = (route: string) => cy.visit(`/apps/${APP_NAME}/${route}`);

// A raw numeric field dimension for the query-builder combinators, shaped like a
// generated `metabase.data.ts` entry.
const numericField = (fieldId: number, name: string) => ({
  type: "column" as const,
  fieldId,
  tableId: ORDERS_ID,
  name,
  jsType: "number" as const,
});

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
      cy.findByRole("link", { name: APP_DISPLAY_NAME })
        .scrollIntoView()
        .should("be.visible");

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

    it("shows the generic empty state (not a duplicate 'no repo' message) when no repository is connected", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: false,
        url: null,
      }).as("repoStatus");
      cy.intercept("GET", "/api/apps", []);

      cy.visit("/admin/settings/apps");
      cy.wait("@repoStatus");

      cy.findByTestId("admin-layout-content").within(() => {
        // The Apps section still renders (title + generic empty state); the
        // "no repository" state lives only in the Remote Sync row above, so it
        // must not be duplicated down here.
        cy.findByRole("heading", { name: "Apps" }).should("be.visible");
        cy.findByText("Your data apps will appear here")
          .scrollIntoView()
          .should("be.visible");
        cy.findByText(/No repository is connected yet/).should("not.exist");
      });
    });

    it("shows an empty state when the connected repository has no apps", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: true,
        url: "https://github.com/metabase/stats-remote-sync",
      });
      cy.intercept("GET", "/api/apps", []).as("apps");

      cy.visit("/admin/settings/apps");
      cy.wait("@apps");

      cy.findByTestId("admin-layout-content").within(() => {
        // The connected repository URL shows in the remote-sync row.
        cy.findByText("https://github.com/metabase/stats-remote-sync").should(
          "be.visible",
        );
        // The Apps section keeps its title and shows an empty state with no apps.
        cy.findByRole("heading", { name: "Apps" }).should("be.visible");
        cy.findByText("Your data apps will appear here")
          .scrollIntoView()
          .should("be.visible");
      });
    });

    it("lists an enabled app with an open link and a Disable action (no Remove while connected)", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: true,
      });
      cy.intercept("GET", "/api/apps", [fakeApp()]);
      cy.intercept("PUT", `/api/apps/${APP_NAME}`, {
        statusCode: 200,
        body: fakeApp({ enabled: false }),
      }).as("setEnabled");

      cy.visit("/admin/settings/apps");

      // The name links to the app's route and the path is shown.
      cy.findByRole("link", { name: APP_DISPLAY_NAME })
        .should("have.attr", "href")
        .and("contain", `/apps/${APP_NAME}`);
      cy.findByTestId("admin-layout-content")
        .findByText(`/apps/${APP_NAME}`)
        .scrollIntoView()
        .should("be.visible");

      // The actions menu offers Disable; while a repo is connected there's no
      // manual Remove (a sync would just re-materialize it).
      cy.findByRole("button", {
        name: `Actions for ${APP_DISPLAY_NAME}`,
      }).click();
      cy.findByRole("menuitem", { name: "Remove" }).should("not.exist");
      cy.findByRole("menuitem", { name: "Disable" }).click();

      cy.wait("@setEnabled")
        .its("request.body")
        .should("deep.equal", { enabled: false });
    });

    it("shows a disabled app as plain text with a Disabled badge and a Reenable action", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: true,
      });
      cy.intercept("GET", "/api/apps", [fakeApp({ enabled: false })]);

      cy.visit("/admin/settings/apps");

      cy.findByTestId("admin-layout-content").within(() => {
        // A disabled app isn't reachable, so its name is plain text (not a link)
        // and it carries a Disabled badge.
        cy.findByText(APP_DISPLAY_NAME).scrollIntoView().should("be.visible");
        cy.findByRole("link", { name: APP_DISPLAY_NAME }).should("not.exist");
        cy.findByText("Disabled").should("be.visible");
      });

      // The menu offers Reenable — and no Remove, since a repo is connected.
      cy.findByRole("button", {
        name: `Actions for ${APP_DISPLAY_NAME}`,
      }).click();
      cy.findByRole("menuitem", { name: "Reenable" }).should("be.visible");
      cy.findByRole("menuitem", { name: "Remove" }).should("not.exist");
    });

    it("keeps previously-synced apps listed after the repo is unlinked", () => {
      // A sync never deletes and unlinking prunes nothing, so an app synced
      // while a repo was connected stays in the list once the repo is unlinked —
      // now with a Remove action (only offered while unlinked).
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: false,
        url: null,
      });
      cy.intercept("GET", "/api/apps", [fakeApp()]).as("apps");

      cy.visit("/admin/settings/apps");
      cy.wait("@apps");

      cy.findByTestId("admin-layout-content")
        .findByText(APP_DISPLAY_NAME)
        .scrollIntoView()
        .should("be.visible");

      cy.findByRole("button", {
        name: `Actions for ${APP_DISPLAY_NAME}`,
      }).click();
      cy.findByRole("menuitem", { name: "Remove" }).should("be.visible");
    });

    it("lets an admin remove a data app once the repo is unlinked", () => {
      // Repo unlinked, but a previously-synced app is still in the DB (a sync
      // never deletes) — so the admin gets a Remove action to clear it out.
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: false,
        url: null,
      });
      cy.intercept("GET", "/api/apps", [fakeApp()]).as("apps");
      cy.intercept("DELETE", `/api/apps/${APP_NAME}`, { statusCode: 204 }).as(
        "deleteApp",
      );

      cy.visit("/admin/settings/apps");
      cy.wait("@apps");

      cy.findByRole("button", {
        name: `Actions for ${APP_DISPLAY_NAME}`,
      }).click();
      cy.findByRole("menuitem", { name: "Remove" }).click();

      // Confirm in the modal (rendered in a portal outside the layout).
      cy.findByRole("dialog").within(() => {
        cy.findByRole("button", { name: "Remove" }).click();
      });

      cy.wait("@deleteApp");
    });

    it("shows the setup section: repo status, the Git sync link, and the install command", () => {
      cy.intercept("GET", "/api/apps/repo-status", {
        configured: false,
        url: null,
      });
      cy.intercept("GET", "/api/apps", []);

      cy.visit("/admin/settings/apps");

      cy.findByTestId("admin-layout-content").within(() => {
        // With no repo connected, the remote-sync row shows the empty status
        // and the button links to the Git sync settings page.
        cy.findByText("No repository connected").should("be.visible");
        cy.findByRole("link", { name: "Go to Git sync settings" })
          .should("have.attr", "href")
          .and("contain", "/admin/settings/remote-sync");

        // The AI skills install command (a copy field) lists the data-app skills.
        cy.findByDisplayValue(/npx skills add metabase\/metabase/).should(
          "be.visible",
        );
        cy.findByDisplayValue(/--skill metabase-data-app-setup/).should(
          "be.visible",
        );
      });
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

  describe("query hooks & question components", () => {
    it("surfaces the useMetabaseQuery error state and lets the app refetch", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          // A table id that doesn't exist → the query resolves to an error.
          errorQuery: { source: { type: "table", id: 999999 } },
        },
      });

      visitAppRoute("query-states");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("query-error", { timeout: 30000 }).should(
          "have.text",
          "error",
        );
        // refetch is exposed and callable (stays in the error state here).
        cy.findByTestId("query-refetch").click();
        cy.findByTestId("query-error").should("have.text", "error");
      });
    });

    it("renders a StaticQuestion from useMetabaseQueryObject", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("static-question");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByText("Subtotal", { timeout: 30000 }).should("be.visible");
      });
    });

    it("builds a query with filter/breakout/orderBy/aggregations helpers", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          combinators: {
            source: { type: "table", id: ORDERS_ID },
            filterField: numericField(ORDERS.TOTAL, "TOTAL"),
            filterValue: 50,
            breakoutField: numericField(ORDERS.PRODUCT_ID, "PRODUCT_ID"),
          },
        },
      });

      visitAppRoute("combinators");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("combinators-loading", { timeout: 30000 }).should(
          "have.text",
          "done",
        );
        cy.findByTestId("combinators-error").should("have.text", "no-error");
        // `.should(callback)` retries until the query resolves with rows.
        cy.findByTestId("combinators-rowcount", { timeout: 30000 }).should(
          ($el) => {
            expect(Number($el.text())).to.be.greaterThan(0);
          },
        );
      });
    });
  });

  describe("actions (useAction)", () => {
    const setupActionsApp = (actionId: number | undefined) =>
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: { ...TEST_ENV, actionId },
      });

    it("executes an action and exposes isExecuting + result, then resets", () => {
      cy.intercept("POST", "/api/action/*/execute", (req) =>
        req.reply({
          statusCode: 200,
          body: { "rows-affected": 1 },
          delay: 300,
        }),
      ).as("execute");
      setupActionsApp(99);

      visitAppRoute("actions");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();
        cy.findByTestId("action-executing").should("have.text", "executing");
        cy.findByTestId("action-result", { timeout: 30000 }).should(
          "have.text",
          "has-result",
        );
        cy.findByTestId("action-output").should("have.text", "returned-result");

        // reset() clears result and error.
        cy.findByTestId("action-reset").click();
        cy.findByTestId("action-result").should("have.text", "no-result");
        cy.findByTestId("action-error").should("have.text", "no-error");
      });
    });

    it("surfaces a validation error from a failed execute", () => {
      cy.intercept("POST", "/api/action/*/execute", {
        statusCode: 400,
        body: { message: "Invalid", errors: { name: "required" } },
      });
      setupActionsApp(99);

      visitAppRoute("actions");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();
        cy.findByTestId("action-error", { timeout: 30000 }).should(
          "have.text",
          "has-error",
        );
        cy.findByTestId("action-result").should("have.text", "no-result");
      });
    });
  });

  describe("clipboard (copy)", () => {
    it("writes text to the clipboard from a user click", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("clipboard");

      // Headless Chrome reports the iframe document as unfocused, so the real
      // `navigator.clipboard.writeText` rejects ("Document is not focused").
      // Stub it: the test still verifies the app reaches the sanctioned `copy`
      // (not blocked by the sandbox) with the right text — the OS write itself
      // is browser behavior, not ours.
      H.dataAppIframe(APP_DISPLAY_NAME).then(($body) => {
        const win = $body[0].ownerDocument.defaultView;
        if (win) {
          const writeText = cy.stub(win.navigator.clipboard, "writeText");
          writeText.resolves();
          writeText.as("writeText");
        }
      });

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("clipboard-copy").click();
        cy.findByTestId("clipboard-status", { timeout: 30000 }).should(
          "have.text",
          "copied",
        );
      });

      cy.get("@writeText").should(
        "have.been.calledOnceWith",
        "data-app-clipboard-payload",
      );
    });
  });

  describe("error component", () => {
    it("shows the default neutral error state for a missing question", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("missing-question");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByText(/not found/i, { timeout: 30000 }).should("be.visible");
      });
    });

    it("lets an app override the default with its own errorComponent", () => {
      const CUSTOM_APP = "custom-error-component";
      const CUSTOM_DISPLAY = "Custom Error App";

      H.mockDataApp(CUSTOM_APP, { displayName: CUSTOM_DISPLAY });

      H.openDataApp(CUSTOM_APP);
      H.dataAppIframe(CUSTOM_DISPLAY).within(() => {
        cy.findByTestId("custom-error-component", { timeout: 30000 })
          .should("be.visible")
          .and("contain", "Custom app error");
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

  describe("routing (extended)", () => {
    it("renders the target page when deep-linked directly to a sub-route", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("details");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Order details" }).should(
          "be.visible",
        );
        cy.findByTestId("current-pathname").should("have.text", "/details");
      });
      cy.location("pathname").should("eq", `/apps/${APP_NAME}/details`);
    });

    it("navigates imperatively via useDataAppLocation().navigate", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Orders overview" }).should(
          "be.visible",
        );
        cy.findByTestId("navigate-to-details").click();
        cy.findByRole("heading", { name: "Order details" }).should(
          "be.visible",
        );
        cy.findByTestId("current-pathname").should("have.text", "/details");
      });
      cy.location("pathname").should("eq", `/apps/${APP_NAME}/details`);
    });
  });

  describe("host error / not-ready screens", () => {
    it("shows a themed host error screen when the bundle throws while rendering", () => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: TEST_ENV,
      });

      visitAppRoute("throw");
      // The throw is caught in the iframe and reported to the parent, which
      // renders its themed failure screen in the host realm.
      H.main()
        .findByText(/couldn.t be loaded/i, { timeout: 30000 })
        .should("be.visible");
    });

    it("shows a not-ready screen when the bundle hasn't synced (404)", () => {
      cy.intercept("GET", "/api/apps/repo-status", { configured: true });
      cy.intercept("GET", `/api/apps/${APP_NAME}`, fakeApp());
      cy.intercept("GET", `/api/apps/${APP_NAME}/bundle*`, {
        statusCode: 404,
        body: { error: "Bundle not synced yet" },
      });

      cy.visit(`/apps/${APP_NAME}`);
      H.main()
        .findByText(/isn.t ready yet/i, { timeout: 30000 })
        .should("be.visible");
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
