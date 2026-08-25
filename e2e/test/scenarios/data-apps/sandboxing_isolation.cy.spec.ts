const { H } = cy;

const APP_NAME = "isolation";
const APP_DISPLAY_NAME = "Isolation";

type IsolationTestEnv = { instanceUrl: string };

describe("scenarios > data apps > sandbox isolation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  const setup = () => {
    const instanceUrl = Cypress.config("baseUrl") ?? "";
    const testEnv: IsolationTestEnv = { instanceUrl };

    H.mockDataApp(APP_NAME, { displayName: APP_DISPLAY_NAME, testEnv });
    H.openDataApp(APP_NAME);
  };

  /**
   * Click a probe and assert it reported that the boundary held. Every probe
   * stops at the first sign it reached across the boundary: `isolated:` means it
   * did not, `reached:` means it did. `pending` / `no-probe-observed` mean the
   * probe never fired, which is also a failure — none of those contain
   * `isolated:`, so a single assertion covers all three.
   */
  const runProbe = (buttonTestId: string) => {
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId(buttonTestId).scrollIntoView().click();

      cy.findByTestId("isolation-result", { timeout: 30000 })
        .should("not.have.text", "pending")
        .invoke("text")
        .then((text) => {
          cy.log(`isolation-result: ${text}`);
          expect(text, "the boundary held").to.contain("isolated:");
        });
    });
  };

  /**
   * For the probes whose element is refused during React's own render pass.
   *
   * The guard throws from `createElement` inside the reconciler, and the app's
   * `BoundaryReporter` never catches it: that boundary is declared in the GUEST
   * realm while HOST React renders the tree, and React's error-boundary detection
   * does not survive the membrane. The throw therefore reaches the host boundary
   * and takes the data app down — which is the correct outcome, but it also
   * destroys the probe, so there is no `isolation-result` left to read. Assert on
   * the guard's own message instead.
   */
  const runProbeExpectingGuard = (buttonTestId: string) => {
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId(buttonTestId).scrollIntoView().click();
    });

    cy.contains("blocked host createElement", { timeout: 30000 }).should(
      "exist",
    );
  };

  it("keeps a document.createElement about:blank iframe within the gated realm", () => {
    setup();
    runProbe("isolation-create-element");
  });

  it("gates a host-React about:blank iframe", () => {
    setup();
    runProbeExpectingGuard("isolation-react-about-blank");
  });

  it("gates an iframe pointing at Metabase itself", () => {
    setup();
    runProbeExpectingGuard("isolation-react-src");
  });

  it("gates a srcdoc iframe", () => {
    setup();
    runProbeExpectingGuard("isolation-react-srcdoc");
  });

  it("keeps a window.open realm within the gated realm", () => {
    setup();
    runProbe("isolation-window-open");
  });

  it("gates the Worker constructor", () => {
    setup();
    runProbe("isolation-worker");
  });

  it("gates the SharedWorker constructor", () => {
    setup();
    runProbe("isolation-shared-worker");
  });

  it("gates the service worker registration API", () => {
    setup();
    runProbe("isolation-service-worker");
  });

  it("gates dynamic import", () => {
    setup();
    runProbe("isolation-dynamic-import");
  });

  it("keeps a dangerouslySetInnerHTML iframe within the gated realm", () => {
    setup();
    runProbe("isolation-inner-html");
  });

  it("keeps a Function-constructor fetch gated", () => {
    setup();
    runProbe("isolation-function-constructor");
  });

  it("keeps a DOMParser iframe within the gated realm", () => {
    setup();
    runProbe("isolation-dom-parser");
  });

  it("keeps a raw API out of the SDK endowments", () => {
    setup();
    runProbe("isolation-endowment-api");
  });

  it("gates document.cookie on the parent realm", () => {
    setup();
    runProbe("isolation-parent-cookie");
  });

  it("gates localStorage on the parent realm", () => {
    setup();
    runProbe("isolation-parent-local-storage");
  });

  it("gates sessionStorage on the parent realm", () => {
    setup();
    runProbe("isolation-parent-session-storage");
  });

  it("gates indexedDB on the parent realm", () => {
    setup();
    runProbe("isolation-parent-indexeddb");
  });

  it("gates caches on the parent realm", () => {
    setup();
    runProbe("isolation-parent-caches");
  });

  it("gates FontFace.load", () => {
    setup();
    runProbe("isolation-font-face");
  });

  it("gates cookieStore", () => {
    setup();
    runProbe("isolation-cookie-store");
  });

  it("gates performance resource timing", () => {
    setup();
    runProbe("isolation-perf-resource-timing");
  });

  it("keeps a Range.createContextualFragment iframe within the gated realm", () => {
    setup();
    runProbe("isolation-range-fragment-iframe");
  });

  it("keeps a custom element's upgrade callback in the gated realm", () => {
    setup();
    runProbe("isolation-custom-element");
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
        headers: { ...cors, Location: `${instanceUrl}/api/session/properties` },
      });
    });

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: { instanceUrl },
      allowedHosts: ["http://localhost:4444"],
    });
    H.openDataApp(APP_NAME);

    runProbe("isolation-allowed-host-redirect");
  });

  // The 403s the marker produces are backend behaviour, covered by
  // `data_app_scope_test.clj`. What only e2e can prove is the premise those 403s rest
  // on: that the real transport stamps `X-Metabase-Client: data-app` on the requests the
  // SDK makes from inside the sandbox. The header cannot be spoofed to gain access —
  // host-realm code the membraned guest can't reach sets it, and it only ever narrows —
  // but if it ever stopped being sent, the confinement would silently stop applying.
  it("marks the requests the SDK makes from inside the sandbox as data-app", () => {
    const markedPaths = new Set<string>();

    cy.intercept("/api/**", (req) => {
      if (req.headers["x-metabase-client"] === "data-app") {
        markedPaths.add(new URL(req.url).pathname);
      }
    });

    setup();

    // Wait for the guest bundle to have rendered — the SDK's bootstrap requests are
    // still in flight while it loads, so asserting earlier races them.
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("isolation-result", { timeout: 30000 }).should("exist");
    });

    // `/api/user/current` is the whole marked surface this fixture produces — it renders
    // isolation probes, not questions, and the SDK's bootstrap takes site settings from
    // the auth prefetch rather than refetching `/api/session/properties`.
    cy.then(() => {
      expect([...markedPaths], "requests marked as data-app").to.include(
        "/api/user/current",
      );
    });
  });
});
