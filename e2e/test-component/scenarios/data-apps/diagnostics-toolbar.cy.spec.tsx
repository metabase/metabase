import {
  devToolbarPanel,
  devToolbarRoot,
  devToolbarToggle,
  diagnosticEntry,
  mountDevToolbar,
  openDevToolbar,
  serveDiagnosticsFeed,
  serveUnreachableDiagnosticsFeed,
} from "e2e/support/helpers/e2e-data-app-dev-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

describe("scenarios > data-apps > dev diagnostics toolbar", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  describe("closed", () => {
    it("badges the alert count on the toggle", () => {
      serveDiagnosticsFeed([
        diagnosticEntry({ eventId: 1, kind: "error", summary: "boom" }),
        // a successful query is not an alert, so it must not inflate the badge
        diagnosticEntry({
          eventId: 2,
          kind: "sdk-call",
          summary: "GET /api/card/1 → 200",
          alert: false,
        }),
      ]);

      mountDevToolbar();

      devToolbarToggle().should("contain.text", "⚠ Diagnostics (1)");
    });
  });

  describe("open", () => {
    it("opens the full panel with tabs on a single click", () => {
      serveDiagnosticsFeed([
        diagnosticEntry({ eventId: 1, kind: "error", summary: "boom" }),
      ]);

      mountDevToolbar();
      openDevToolbar();

      // No intermediate popover: tabs are there at once and the toggle is gone.
      devToolbarRoot()
        .findByRole("tab", { name: "Errors" })
        .should("be.visible");
      devToolbarRoot()
        .findByRole("button", { name: /Diagnostics/ })
        .should("not.exist");
      devToolbarRoot().findByText("boom").should("be.visible");
    });

    it("hides a stack behind a disclosure until it's expanded", () => {
      serveDiagnosticsFeed([
        diagnosticEntry({
          eventId: 1,
          kind: "error",
          summary: "TypeError: nope",
          detail: "    at App (src/App.tsx:12:3)",
        }),
      ]);

      mountDevToolbar();
      openDevToolbar();

      devToolbarRoot().findByText("TypeError: nope").should("be.visible");
      // The stack is in the DOM but collapsed inside a <details>, DevTools-style.
      devToolbarRoot()
        .findByText(/at App \(src\/App\.tsx:12:3\)/)
        .should("not.be.visible");
      devToolbarRoot().findByText("TypeError: nope").click();
      devToolbarRoot()
        .findByText(/at App \(src\/App\.tsx:12:3\)/)
        .should("be.visible");
    });

    it("shows all five tabs, Errors active, with each tab's empty state", () => {
      serveDiagnosticsFeed([]);

      mountDevToolbar();
      openDevToolbar();

      for (const label of [
        "Errors",
        "Blocked",
        "Queries",
        "Manifest",
        "Connection",
      ]) {
        devToolbarRoot()
          .findByRole("tab", { name: label })
          .should("be.visible");
      }
      devToolbarRoot()
        .findByRole("tab", { name: "Errors" })
        .should("have.attr", "aria-selected", "true");
      devToolbarRoot().findByText("No errors captured.").should("be.visible");

      devToolbarRoot().findByRole("tab", { name: "Blocked" }).click();
      devToolbarRoot().findByText("Nothing blocked.").should("be.visible");

      devToolbarRoot().findByRole("tab", { name: "Queries" }).click();
      devToolbarRoot()
        .findByText("No Metabase calls captured.")
        .should("be.visible");

      devToolbarRoot().findByRole("tab", { name: "Manifest" }).click();
      devToolbarRoot()
        .findByText("Manifest has not been validated yet.")
        .should("be.visible");

      devToolbarRoot().findByRole("tab", { name: "Connection" }).click();
      devToolbarRoot()
        .findByText("Connection check has not run yet.")
        .should("be.visible");
    });

    it("splits errors and blocked entries across their tabs, with the fix hint", () => {
      serveDiagnosticsFeed([
        diagnosticEntry({ eventId: 1, kind: "error", summary: "plain error" }),
        diagnosticEntry({
          eventId: 2,
          kind: "blocked-network",
          summary: "Blocked fetch to api.example.com (not in allowed_hosts)",
          hint: "Add https://api.example.com to allowed_hosts in data_app.yaml (dev server restart required).",
        }),
      ]);

      mountDevToolbar();
      openDevToolbar();

      devToolbarRoot().findByText("plain error").should("be.visible");
      devToolbarRoot()
        .findByText(/Blocked fetch to/)
        .should("not.exist");

      devToolbarRoot().findByRole("tab", { name: "Blocked" }).click();
      devToolbarRoot()
        .findByText(/Blocked fetch to api\.example\.com/)
        .should("be.visible");
      devToolbarRoot()
        .findByText(/Add https:\/\/api\.example\.com to allowed_hosts/)
        .should("be.visible");
      devToolbarRoot().findByText("plain error").should("not.exist");
    });

    it("lists Metabase calls and filters the Queries tab to failures", () => {
      serveDiagnosticsFeed([
        diagnosticEntry({
          eventId: 1,
          kind: "sdk-call",
          summary: "POST /api/dataset → 400 (12ms)",
          alert: true,
        }),
        diagnosticEntry({
          eventId: 2,
          kind: "sdk-call",
          summary: "GET /api/card/1 → 200 (8ms)",
          alert: false,
        }),
      ]);

      mountDevToolbar();
      openDevToolbar();
      devToolbarRoot().findByRole("tab", { name: "Queries" }).click();

      devToolbarRoot()
        .findByText(/Dev runs with an API key/)
        .should("be.visible");
      devToolbarRoot()
        .findByText(/api\/card\/1/)
        .should("be.visible");

      devToolbarRoot()
        .findByRole("checkbox", { name: /Failed only/ })
        .click();

      devToolbarRoot()
        .findByText(/api\/dataset/)
        .should("be.visible");
      devToolbarRoot()
        .findByText(/api\/card\/1/)
        .should("not.exist");
    });

    it("shows why a query failed, behind the same disclosure as a stack", () => {
      serveDiagnosticsFeed([
        diagnosticEntry({
          eventId: 1,
          kind: "sdk-call",
          summary: "POST /api/dataset → 400 (12ms)",
          detail: 'Table "orders" is not in the manifest',
          alert: true,
        }),
      ]);

      mountDevToolbar();
      openDevToolbar();
      devToolbarRoot().findByRole("tab", { name: "Queries" }).click();

      // Without the reason the author only learns *that* a query failed, and
      // has to leave the toolbar for the browser's Network tab to find out why.
      devToolbarRoot()
        .findByText(/POST \/api\/dataset → 400/)
        .should("be.visible");
      devToolbarRoot()
        .findByText(/is not in the manifest/)
        .should("not.be.visible");

      devToolbarRoot()
        .findByText(/POST \/api\/dataset → 400/)
        .click();
      devToolbarRoot()
        .findByText(/is not in the manifest/)
        .should("be.visible");
    });

    it("renders the manifest status the feed carries", () => {
      serveDiagnosticsFeed([], {
        manifest: {
          name: "Demo",
          bundlePath: "dist/index.js",
          bundlePathExists: false,
          allowedHosts: ["https://api.example.com"],
          errors: ["path is required"],
          warnings: ["bundle is large"],
          restartRequired: true,
        },
      });

      mountDevToolbar();
      openDevToolbar();
      devToolbarRoot().findByRole("tab", { name: "Manifest" }).click();

      // The tab is showing (top row visible); the rest is rendered further down
      // the scrollable panel body, so assert it exists rather than fighting the
      // scroll fold.
      devToolbarRoot().findByText("path is required").should("be.visible");
      devToolbarRoot().findByText("bundle is large").should("exist");
      devToolbarRoot()
        .findByText(/allowed_hosts changed/)
        .should("exist");
      devToolbarRoot().findByText("Demo").should("exist");
      devToolbarRoot()
        .findByText(/file not found/)
        .should("exist");
      devToolbarRoot().findByText("https://api.example.com").should("exist");
    });

    it("renders the connection status the feed carries", () => {
      serveDiagnosticsFeed([], {
        connection: {
          checkedAt: 1,
          metabaseUrl: "http://localhost:3000",
          reachable: true,
          sdkVersion: "0.64.0",
          error: "The API key was rejected (401).",
        },
      });

      mountDevToolbar();
      openDevToolbar();
      devToolbarRoot().findByRole("tab", { name: "Connection" }).click();

      devToolbarRoot().findByText("http://localhost:3000").should("be.visible");
      devToolbarRoot().findByText("✓").should("exist");
      devToolbarRoot().findByText("0.64.0").should("exist");
      devToolbarRoot()
        .findByText("The API key was rejected (401).")
        .should("exist");
    });

    it("says so, instead of looking healthy, when the dev server is unreachable", () => {
      serveUnreachableDiagnosticsFeed();

      mountDevToolbar();
      openDevToolbar();

      devToolbarRoot()
        .findByText(/Can't reach the dev server/)
        .should("be.visible");
    });

    it("clears through the endpoint, emptying the panel", () => {
      serveDiagnosticsFeed([diagnosticEntry({ eventId: 1, summary: "boom" })]);

      mountDevToolbar();
      openDevToolbar();
      devToolbarRoot().findByText("boom").should("be.visible");

      devToolbarRoot().findByRole("button", { name: "Clear" }).click();

      cy.wait("@clear");
      devToolbarRoot().findByText("boom").should("not.exist");
    });

    it("resizes by dragging the top edge, and Close returns to the toggle", () => {
      serveDiagnosticsFeed([]);

      mountDevToolbar();
      openDevToolbar();

      let before = 0;
      devToolbarPanel()
        .invoke("outerHeight")
        .then((h) => {
          before = h ?? 0;
          expect(before).to.be.greaterThan(0);
        });

      // Drag the top edge up ~140px; the bottom-docked panel grows. The handler
      // listens on `window` for the duration of the drag, so fire the move/up
      // there directly rather than relying on bubbling from a thin 6px handle.
      devToolbarRoot()
        .findByRole("separator", { name: /Resize diagnostics panel/ })
        .trigger("mousedown", { clientY: 400, force: true });
      cy.window().then((win) => {
        win.dispatchEvent(
          new win.MouseEvent("mousemove", { clientY: 260, bubbles: true }),
        );
        win.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
      });

      devToolbarPanel()
        .invoke("outerHeight")
        .should((h) => {
          expect(h).to.be.greaterThan(before);
        });

      // Close dismisses the whole panel back to just the toggle button.
      devToolbarRoot().findByRole("button", { name: "Close" }).click();
      devToolbarRoot()
        .findByRole("tab", { name: "Errors" })
        .should("not.exist");
      devToolbarToggle().should("be.visible");
    });
  });
});
