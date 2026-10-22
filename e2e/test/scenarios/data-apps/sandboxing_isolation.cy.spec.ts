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
      expect(Object.keys(results), "every probe reported").to.deep.eq(probeIds);
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
    const instanceUrl = Cypress.config("baseUrl") ?? "";
    const testEnv: IsolationTestEnv = { instanceUrl };

    H.mockDataApp(APP_NAME, { displayName: APP_DISPLAY_NAME, testEnv });

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
        headers: { ...cors, Location: `${instanceUrl}/api/session/properties` },
      });
    }).as("allowedHostRedirect");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: { instanceUrl },
      allowedHosts: ["http://localhost:4444"],
    });
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
