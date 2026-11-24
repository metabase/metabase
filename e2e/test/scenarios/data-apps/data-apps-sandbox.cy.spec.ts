import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const TEAMS_TABLE = "scoreboard_actions";
const APP_NAME = "sandbox";
const APP_DISPLAY_NAME = "Sandbox";

describe("scenarios > data apps > sandbox", { tags: ["@external"] }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetTestTable({ type: "postgres", table: TEAMS_TABLE });
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEAMS_TABLE });

    H.createLibrary();
    H.setupGitSync();
    H.copyDataAppsFixture();
    H.commitToRepo("Add data apps");
    H.configureGitAndPullChanges("read-only");
  });

  describe("sandboxing", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;

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

    it("blocks dangerous globals, strips innerHTML, gates XHR, and blocks cross-origin fetch but permits allowed_hosts", () => {
      // The allowed host is stubbed with a CORS header so the sandbox's real
      // network call resolves; the blocked host is never intercepted because the
      // sandbox rejects it before it reaches the network.
      cy.intercept("GET", ALLOWED_URL, {
        statusCode: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "pong",
      });

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("link", { name: "Sandbox" }).click();
        BLOCKED_PROBE_IDS.forEach((id) => {
          cy.findByTestId(`probe-${id}`, { timeout: 30000 }).should(
            "have.text",
            "blocked",
          );
        });

        cy.findByTestId("probe-innerhtml").should("have.text", "stripped");

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

        // XHR is hard-blocked entirely — data apps are fetch-only. It can't opt out
        // of following a redirect back to the instance, so it's never allowlisted
        // like fetch: both blocked and allowed hosts are refused.
        cy.findByTestId("blocked-xhr-result").should("contain", "blocked");
        cy.findByTestId("allowed-xhr-result", { timeout: 30000 }).should(
          "contain",
          "blocked",
        );
      });
    });
  });

  describe("isolation", () => {
    it("serves the embed document with locked-down headers, renders the app in a sandboxed iframe, and keeps the app's CSS and JS globals inside it", () => {
      cy.request({
        url: `/embed/apps/${APP_NAME}`,
        followRedirect: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(String(res.body)).to.contain("app-data-app");
        const csp = String(res.headers["content-security-policy"] ?? "");
        expect(csp).to.contain("frame-ancestors 'self'");
        expect(csp).to.contain("default-src 'none'");
        expect(csp).to.contain(
          "form-action https://allowed.data-app.test http://localhost:4444;",
        );
        // The data-app document deliberately does NOT grant 'unsafe-eval' — it's
        // confined to the sandbox-host realm doc (see the BE sandbox-host-endpoint-test).
        expect(csp).to.not.contain("'unsafe-eval'");
        expect(String(res.headers["x-frame-options"] ?? "")).to.match(
          /sameorigin/i,
        );
      });

      H.openDataApp(APP_NAME);

      cy.get(`iframe[title="${APP_DISPLAY_NAME}"]`)
        .should("have.attr", "sandbox")
        .and("contain", "allow-scripts")
        .and("not.contain", "allow-top-navigation")
        .and("not.contain", "allow-popups-to-escape-sandbox");

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByRole("heading", { name: "Isolation probe" }).should(
          "be.visible",
        );
        cy.findByRole("link", { name: "Isolation" }).click();

        // The injected <style> applies to the app's own document.
        cy.findByTestId("css-injected").should("have.text", "ok");
        cy.findByTestId("isolation-css-probe").should(
          "have.css",
          "color",
          "rgb(0, 128, 0)",
        );

        // The app set the global in its own realm and read it back.
        cy.findByTestId("js-marker").should("have.text", "in-app");
      });

      // The aggressive `body` rule injected in the iframe does not reach the
      // parent document.
      cy.get("body").should(
        "not.have.css",
        "background-color",
        "rgb(0, 128, 0)",
      );

      // The parent window never sees the app's global.
      cy.window().should("not.have.property", "__DATA_APP_ISOLATION_MARKER__");
    });
  });

  describe("isolation probes", () => {
    const setup = () => {
      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("isolation-result", { timeout: 30000 }).should(
          "have.text",
          "pending",
        );
      });
    };

    /**
     * Click each probe in turn and record what it reported, then assert that the
     * boundary held for all of them at once, so every failing probe shows. Every
     * probe stops at the first sign it reached across the boundary: `isolated:`
     * means it did not, `reached:` means it did. `no-probe-observed` means the
     * probe never fired, which is also a failure. The fixture resets the result to
     * `pending` and tags it with the probe's id on each click, so a result is only
     * read once it belongs to the probe just clicked.
     */
    const runProbes = (probeIds: string[]) => {
      const results: Record<string, string> = {};

      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        probeIds.forEach((probeId) => {
          cy.findByTestId(`isolation-${probeId}`).scrollIntoView().click();

          cy.findByTestId("isolation-result", { timeout: 30000 })
            .should(($result) => {
              expect($result.attr("data-probe-id")).to.eq(probeId);
              expect($result.text()).not.to.eq("pending");
            })
            .invoke("text")
            .then((text) => {
              cy.log(`${probeId}: ${text}`);
              results[probeId] = text;
            });
        });
      });

      cy.then(() => {
        expect(Object.keys(results), "every probe reported").to.deep.eq(
          probeIds,
        );
        expect(
          probeIds
            .filter((probeId) => !results[probeId].includes("isolated:"))
            .map((probeId) => `${probeId}: ${results[probeId]}`),
          "probes that crossed the boundary",
        ).to.deep.eq([]);
      });
    };

    const guardMessage = () =>
      cy.contains("blocked host createElement", { timeout: 30000 });

    it("keeps the realms the app creates within the gated realm", () => {
      setup();

      runProbes([
        "window-frames",
        "create-element",
        "dom-parser",
        "adopt-html-doc-iframe",
        "import-html-doc-iframe",
        "xml-doc-iframe",
        "template-doc-iframe",
        "range-fragment-iframe",
        "inner-html",
        "custom-element",
        "window-open",
      ]);
    });

    // The 403s the marker produces are backend behaviour, covered by
    // `data_app_scope_test.clj`. What only e2e can prove is the premise those 403s rest
    // on: that the real transport stamps `X-Metabase-Client: data-app` on the requests the
    // SDK makes from inside the sandbox. The header cannot be spoofed to gain access —
    // host-realm code the membraned guest can't reach sets it, and it only ever narrows —
    // but if it ever stopped being sent, the confinement would silently stop applying.
    it("keeps the host window, its storage and a host iframe's realm gated, and marks the SDK's requests as data-app", () => {
      const markedPaths = new Set<string>();

      cy.intercept("/api/**", (req) => {
        if (req.headers["x-metabase-client"] === "data-app") {
          markedPaths.add(new URL(req.url).pathname);
        }
      });

      setup();

      // `/api/user/current` is the whole marked surface this fixture produces — it renders
      // isolation probes, not questions, and the SDK's bootstrap takes site settings from
      // the auth prefetch rather than refetching `/api/session/properties`.
      cy.wrap(markedPaths, { timeout: 30000 }).should((paths) => {
        expect([...paths], "requests marked as data-app").to.include(
          "/api/user/current",
        );
      });

      // A srcless (about:blank) iframe is same-origin, so its `contentWindow` is a
      // live realm with an un-gated `fetch` — the same capability html2canvas's
      // clone iframe has. Create it in the PARENT (whose createElement the host
      // guard never patched) and adopt it into the data-app document, mimicking a
      // host-created child frame the guest then reaches for.
      H.dataAppIframe(APP_DISPLAY_NAME).then(($body) => {
        const doc = $body[0].ownerDocument;
        const parentDoc = doc.defaultView!.parent.document;
        const iframe = parentDoc.createElement("iframe");
        iframe.style.display = "none";
        doc.body.appendChild(doc.adoptNode(iframe));

        expect(iframe.contentWindow !== null, "adopted iframe realm").to.equal(
          true,
        );
      });

      runProbes([
        "child-frame-grab",
        "window-parent",
        "window-top",
        "frame-element",
        "parent-chain",
        "window-opener",
        "parent-cookie",
        "parent-local-storage",
        "parent-session-storage",
        "parent-indexeddb",
        "parent-caches",
      ]);
    });

    it("gates the APIs that run code, read host data or reach a host realm", () => {
      setup();

      runProbes([
        "perf-resource-timing",
        "function-constructor",
        "worker",
        "shared-worker",
        "service-worker",
        "dynamic-import",
        "font-face",
        "cookie-store",
        "endowment-api",
        "stack-trace-realm",
      ]);
    });

    /**
     * For the probes whose element is refused during React's own render pass.
     *
     * The guard throws from `createElement` inside the reconciler, and the app's
     * `BoundaryReporter` never catches it: that boundary is declared in the GUEST
     * realm while HOST React renders the tree, and React's error-boundary detection
     * does not survive the membrane. The throw therefore reaches the host boundary
     * and takes the data app down — which is the correct outcome, but it also
     * destroys the probe, so there is no `isolation-result` left to read. Assert on
     * the guard's own message instead, and open the app again for each probe.
     */
    it("gates host-React iframes: about:blank, Metabase itself and srcdoc", () => {
      ["react-about-blank", "react-src", "react-srcdoc"].forEach((probeId) => {
        cy.log(probeId);
        H.openDataApp(APP_NAME);

        H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("isolation-result", { timeout: 30000 }).should(
            "have.text",
            "pending",
          );
        });
        guardMessage().should("not.exist");

        H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId(`isolation-${probeId}`).scrollIntoView().click();
        });
        guardMessage().should("exist");
      });
    });

    it("gates an allowed_host redirect to the instance", () => {
      const instanceUrl = Cypress.config("baseUrl") ?? "";
      const cors = {
        "Access-Control-Allow-Origin": instanceUrl,
        "Access-Control-Allow-Credentials": "true",
      };

      // An allowed host that answers the CORS preflight for a credentialed GET,
      // then 307-redirects it to the instance origin. The sandbox fetch checks only
      // the initial (allowed) URL; it must not follow the redirect across origins.
      cy.intercept("OPTIONS", "http://localhost:4444/**", {
        statusCode: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "content-type",
        },
      });
      cy.intercept("GET", "http://localhost:4444/**", (req) => {
        req.reply({
          statusCode: 307,
          headers: {
            ...cors,
            Location: `${instanceUrl}/api/session/properties`,
          },
        });
      }).as("allowedHostRedirect");

      H.openDataApp(APP_NAME);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("isolation-result", { timeout: 30000 }).should(
          "have.text",
          "pending",
        );
      });

      runProbes(["allowed-host-redirect"]);
      cy.wait("@allowedHostRedirect");
    });
  });
});
