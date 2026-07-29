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

  const setUp = () => {
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
    setUp();
    runProbe("isolation-create-element");
  });

  it("gates a host-React about:blank iframe", () => {
    setUp();
    runProbeExpectingGuard("isolation-react-about-blank");
  });

  it("gates an iframe pointing at Metabase itself", () => {
    setUp();
    runProbeExpectingGuard("isolation-react-src");
  });

  it("gates a srcdoc iframe", () => {
    setUp();
    runProbeExpectingGuard("isolation-react-srcdoc");
  });

  it("keeps a window.open realm within the gated realm", () => {
    setUp();
    runProbe("isolation-window-open");
  });

  it("gates the Worker constructor", () => {
    setUp();
    runProbe("isolation-worker");
  });

  it("gates the SharedWorker constructor", () => {
    setUp();
    runProbe("isolation-shared-worker");
  });

  it("gates the service worker registration API", () => {
    setUp();
    runProbe("isolation-service-worker");
  });

  it("gates dynamic import", () => {
    setUp();
    runProbe("isolation-dynamic-import");
  });

  it("keeps a dangerouslySetInnerHTML iframe within the gated realm", () => {
    setUp();
    runProbe("isolation-inner-html");
  });

  it("keeps a Function-constructor fetch gated", () => {
    setUp();
    runProbe("isolation-function-constructor");
  });

  it("keeps a DOMParser iframe within the gated realm", () => {
    setUp();
    runProbe("isolation-dom-parser");
  });

  it("keeps a raw API out of the SDK endowments", () => {
    setUp();
    runProbe("isolation-endowment-api");
  });

  it("gates document.cookie on the parent realm", () => {
    setUp();
    runProbe("isolation-parent-cookie");
  });

  it("gates localStorage on the parent realm", () => {
    setUp();
    runProbe("isolation-parent-local-storage");
  });

  it("gates sessionStorage on the parent realm", () => {
    setUp();
    runProbe("isolation-parent-session-storage");
  });

  it("gates indexedDB on the parent realm", () => {
    setUp();
    runProbe("isolation-parent-indexeddb");
  });

  it("gates caches on the parent realm", () => {
    setUp();
    runProbe("isolation-parent-caches");
  });

  it("gates FontFace.load", () => {
    setUp();
    runProbe("isolation-font-face");
  });

  it("gates cookieStore", () => {
    setUp();
    runProbe("isolation-cookie-store");
  });

  it("gates performance resource timing", () => {
    setUp();
    runProbe("isolation-perf-resource-timing");
  });

  it("keeps a Range.createContextualFragment iframe within the gated realm", () => {
    setUp();
    runProbe("isolation-range-fragment-iframe");
  });

  it("keeps a custom element's upgrade callback in the gated realm", () => {
    setUp();
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
});
