import type { Interception } from "cypress/types/net-stubbing";

import { USERS, USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
  createDataAppScoreboardAction,
  visitDataAppRoute as visitAppRoute,
} from "e2e/support/helpers";

import {
  DATA_APP_TEST_ENV as TEST_ENV,
  enableIsolatedOrigin,
  getIsolatedOrigin,
  getSiteUrl,
} from "./helpers";

const { H } = cy;
const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const TIMEOUT = 30000;

const SITE_URL = getSiteUrl();
const SITE_HOSTNAME = new URL(SITE_URL).hostname;
const ISOLATED_ORIGIN = getIsolatedOrigin();
const ISOLATED_HOSTNAME = new URL(ISOLATED_ORIGIN).hostname;

const appIframe = () => cy.get(`iframe[title="${APP_DISPLAY_NAME}"]`);

/** Checks that a request the page made for the app went out as the page's own. */
const expectBrokered = ({ request }: Interception) => {
  expect(request.headers["x-metabase-client"], "client").to.eq("data-app");
  expect(request.headers["sec-fetch-site"], "fetch site").to.eq("same-origin");
};

const assertBrokered = (alias: string) => cy.wait(alias).then(expectBrokered);

/** The isolated origin's app document CSP header, which must be there for its contents to mean anything. */
const documentPolicy = (response: Cypress.Response<unknown>): string => {
  const policy = response.headers["content-security-policy"];
  expect(policy, "the app document's CSP").to.be.a("string");
  expect(policy).to.match(/connect-src[^;]*\*/);
  return String(policy);
};

describe("scenarios > data apps > isolated origin", () => {
  let isolatedOriginApiRequests: string[] = [];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");
    enableIsolatedOrigin();

    // The app makes every instance request through the page. One sent to its own host
    // means a code path went around the broker.
    isolatedOriginApiRequests = [];
    cy.intercept(
      { hostname: ISOLATED_HOSTNAME, pathname: /^\/api\// },
      (req) => {
        isolatedOriginApiRequests.push(`${req.method} ${req.url}`);
      },
    );
  });

  afterEach(() => {
    cy.then(() => {
      expect(
        isolatedOriginApiRequests,
        "API requests sent to the isolated origin",
      ).to.deep.eq([]);
    });
  });

  it("serves the app from the isolated origin without the session cookie, and makes its requests through the page", () => {
    cy.intercept({
      hostname: ISOLATED_HOSTNAME,
      pathname: `/embed/apps/${APP_NAME}`,
    }).as("appDocument");
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "POST",
      pathname: "/api/dataset",
    }).as("brokeredQuery");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    H.openDataApp(APP_NAME);

    appIframe()
      .invoke("attr", "src")
      .then((src) => {
        expect(new URL(String(src)).origin).to.eq(ISOLATED_ORIGIN);
      });

    cy.wait("@appDocument").then(({ request, response }) => {
      expect(String(request.headers.cookie ?? "")).not.to.contain(
        "metabase.SESSION",
      );
      expect(response?.statusCode).to.eq(200);
    });

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("orders-count", { timeout: TIMEOUT })
        .invoke({ timeout: TIMEOUT }, "text")
        .should("match", /^\d+$/);
      cy.findByTestId("interactive-question-result-toolbar", {
        timeout: TIMEOUT,
      }).should("exist");
    });

    assertBrokered("@brokeredQuery");

    cy.log("the frame's URL no longer carries the page's origin");
    appIframe()
      .its("0.contentWindow.location")
      .should((location: Location) => {
        expect(location.origin).to.eq(ISOLATED_ORIGIN);
        expect(location.hash).to.eq("");
      });
  });

  it("previews the app in Data Studio from the isolated origin", () => {
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "POST",
      pathname: "/api/dataset",
    }).as("brokeredQuery");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    cy.visit(`/data-studio/apps/${APP_NAME}`);

    appIframe()
      .invoke("attr", "src")
      .then((src) => {
        expect(new URL(String(src)).origin).to.eq(ISOLATED_ORIGIN);
      });
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("orders-count", { timeout: TIMEOUT })
        .invoke({ timeout: TIMEOUT }, "text")
        .should("match", /^\d+$/);
    });

    assertBrokered("@brokeredQuery");
    cy.get("@brokeredQuery")
      .its("request.headers.x-metabase-client-identifier")
      .should("eq", APP_NAME);
  });

  it("passes the user's locale to the app, which the isolated origin can't learn without a session", () => {
    cy.request<{ id: number }>("GET", "/api/user/current").then(
      ({ body: { id } }) => {
        cy.request("PUT", `/api/user/${id}`, { locale: "de" });
      },
    );

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    H.openDataApp(APP_NAME);

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("data-app-content", { timeout: TIMEOUT }).should("exist");
    });
    appIframe()
      .its("0.contentWindow.MetabaseUserLocalization.headers.language")
      .should("eq", "de");
  });

  it("keeps the isolated origin to the app document, and sends the document there from the main host", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    cy.log("the main host redirects the app document to the isolated origin");
    cy.request({
      url: `/embed/apps/${APP_NAME}/details?tab=1`,
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.eq(307);
      expect(response.headers.location).to.eq(
        `${ISOLATED_ORIGIN}/embed/apps/${APP_NAME}/details?tab=1`,
      );
    });

    cy.log(
      "the isolated origin serves the app document to a request without a session",
    );
    cy.request(`${ISOLATED_ORIGIN}/embed/apps/${APP_NAME}`).then((response) => {
      expect(String(response.body)).to.contain("app-data-app");
    });

    cy.log("and refuses it to a request with one");
    cy.getCookie("metabase.SESSION").then((cookie) => {
      cy.request({
        url: `${ISOLATED_ORIGIN}/embed/apps/${APP_NAME}`,
        headers: { cookie: `metabase.SESSION=${cookie?.value}` },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });

    cy.log("the isolated origin has no API, sign-in or main app");
    [
      "/api/user/current",
      "/api/session/properties",
      "/auth/login",
      "/",
    ].forEach((path) => {
      cy.request({
        url: `${ISOLATED_ORIGIN}${path}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, path).to.eq(404);
        expect(
          String(response.headers["content-security-policy"]),
          path,
        ).to.contain("sandbox");
      });
    });
    cy.request({
      method: "POST",
      url: `${ISOLATED_ORIGIN}/api/session`,
      body: { username: USERS.admin.email, password: USERS.admin.password },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);

    cy.log("an app page opened on the isolated origin goes to the main host");
    cy.request({
      url: `${ISOLATED_ORIGIN}/apps/${APP_NAME}/details`,
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.eq(307);
      expect(response.headers.location).to.eq(
        `${SITE_URL}/apps/${APP_NAME}/details`,
      );
    });

    cy.log(
      "the main host refuses requests whose Origin is the isolated origin",
    );
    cy.request("/api/user/current").its("status").should("eq", 200);
    cy.request({
      url: "/api/user/current",
      headers: { origin: ISOLATED_ORIGIN },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });

  it("refuses data apps when the isolated origin can't be used", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    // The site URL's own host name: a different port isn't a different host for cookies.
    cy.request("PUT", "/api/testing/isolated-origin", {
      value: `${new URL(SITE_URL).protocol}//${SITE_HOSTNAME}:1`,
    });

    cy.request({ url: `/embed/apps/${APP_NAME}`, failOnStatusCode: false })
      .its("status")
      .should("eq", 503);
    cy.request("/api/session/properties")
      .its("body")
      .should("have.property", "isolated-origin", null);
  });

  it("mirrors the app's routes into the page URL, starts on a deep link, and keeps working after the frame reloads", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    visitAppRoute("details");
    appIframe()
      .invoke("attr", "src")
      .then((src) => {
        expect(new URL(String(src)).pathname).to.eq(
          `/embed/apps/${APP_NAME}/details`,
        );
      });
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("heading", { name: "Order details" }).should("be.visible");
      cy.findByTestId("current-pathname").should("have.text", "/details");

      cy.findByRole("link", { name: "Isolation" }).click();
      cy.findByTestId("current-pathname").should("have.text", "/isolation");
    });
    cy.location("pathname").should("eq", `/apps/${APP_NAME}/isolation`);

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("navigate-to-details").click();
      cy.findByTestId("current-pathname").should("have.text", "/details");
    });
    cy.location("pathname").should("eq", `/apps/${APP_NAME}/details`);

    cy.log("reload the frame, whose URL no longer has the page's origin");
    appIframe()
      .its("0.contentWindow")
      .then((win: Window) => {
        Object.assign(win, { beforeReload: true });
        win.location.reload();
      });
    appIframe()
      .its("0.contentWindow")
      .should("not.have.property", "beforeReload");

    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "POST",
      pathname: "/api/dataset",
    }).as("brokeredQuery");
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("heading", {
        name: "Order details",
        timeout: TIMEOUT,
      }).should("be.visible");

      cy.findByRole("link", { name: "Overview" }).click();
      cy.findByTestId("orders-count", { timeout: TIMEOUT })
        .invoke({ timeout: TIMEOUT }, "text")
        .should("match", /^\d+$/);
    });
    assertBrokered("@brokeredQuery");

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("link", { name: "Isolation" }).click();
      cy.findByTestId("current-pathname").should("have.text", "/isolation");
    });
    cy.location("pathname").should("eq", `/apps/${APP_NAME}/isolation`);
  });

  it("brings query errors and refetches through the page", () => {
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "POST",
      pathname: "/api/dataset",
    }).as("brokeredQuery");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: {
        ...TEST_ENV,
        errorQuery: {
          source: { type: "card", entityId: "missingQuestionEntity" },
        },
      },
    });

    visitAppRoute("query-states");
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("query-error", { timeout: TIMEOUT }).should(
        "have.text",
        "error",
      );
      cy.findByTestId("query-value", { timeout: TIMEOUT })
        .invoke({ timeout: TIMEOUT }, "text")
        .should("match", /^\d+$/);
    });

    assertBrokered("@brokeredQuery");
    cy.get<Interception[]>("@brokeredQuery.all").then((queriesBefore) => {
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("query-refetch").click();
      });

      cy.get<Interception[]>("@brokeredQuery.all")
        .should("have.length", queriesBefore.length + 1)
        .then((queries) => expectBrokered(queries[queries.length - 1]));
    });
  });

  it("downloads a question's results through the page", () => {
    cy.deleteDownloadsFolder();
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "POST",
      pathname: `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}/query/csv`,
    }).as("brokeredDownload");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: { ...TEST_ENV, downloadQuestionId: ORDERS_BY_YEAR_QUESTION_ID },
    });

    visitAppRoute("download-question");
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("question-download-widget-button", { timeout: TIMEOUT })
        .should("be.visible")
        .click();
      cy.findByText(".csv").click();
      cy.findByTestId("download-results-button").click();
    });

    assertBrokered("@brokeredDownload");
    cy.verifyDownload(".csv", { contains: true });
  });

  it("loads pin map tiles through the page", () => {
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "GET",
      pathname: /^\/api\/tiles\//,
    }).as("brokeredTile");

    H.createQuestion({
      name: "People map",
      query: { "source-table": PEOPLE_ID, limit: 10 },
      display: "map",
      visualization_settings: {
        "map.type": "pin",
        "map.pin_type": "tiles",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    }).then(({ body: { id: questionId } }) => {
      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: { ...TEST_ENV, downloadQuestionId: questionId },
      });
    });

    visitAppRoute("download-question");
    assertBrokered("@brokeredTile");
    cy.get("@brokeredTile").its("response.statusCode").should("eq", 200);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      // Pin tiles come back through the page and render as `data:` images; base-map
      // tiles load straight from the tile server.
      cy.get('.leaflet-tile-loaded[src^="data:image"]', {
        timeout: TIMEOUT,
      }).should("have.length.above", 0);
    });
  });

  describe("base-map tiles", () => {
    // The browser blocks an image its policy doesn't allow before any request leaves,
    // so a request reaching the stub proves the app's policy lets the tile server in.
    const stubTileServer = (hostname: string | RegExp) =>
      cy
        .intercept(
          { hostname },
          {
            statusCode: 200,
            headers: { "content-type": "image/svg+xml" },
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
          },
        )
        .as("baseTile");

    const openMarkersMap = () => {
      H.createQuestion({
        name: "People markers",
        query: { "source-table": PEOPLE_ID, limit: 10 },
        display: "map",
        visualization_settings: {
          "map.type": "pin",
          "map.pin_type": "markers",
          "map.latitude_column": "LATITUDE",
          "map.longitude_column": "LONGITUDE",
        },
      }).then(({ body: { id: questionId } }) => {
        H.mockDataApp(APP_NAME, {
          displayName: APP_DISPLAY_NAME,
          testEnv: { ...TEST_ENV, downloadQuestionId: questionId },
        });
      });
      visitAppRoute("download-question");
    };

    it("loads base-map tiles from the default tile server, which the app's policy allows", () => {
      stubTileServer(/(^|\.)tile\.openstreetmap\.org$/);
      openMarkersMap();

      cy.wait("@baseTile");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.get('.leaflet-tile-loaded[src*="tile.openstreetmap.org"]', {
          timeout: TIMEOUT,
        }).should("have.length.above", 0);
      });
    });

    it("loads base-map tiles from an admin's custom tile server", () => {
      // The setting takes only a resolvable public host; the browser still gets the stub.
      H.updateSetting(
        "map-tile-server-url",
        "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
      );
      stubTileServer("tile.openstreetmap.de");
      openMarkersMap();

      cy.wait("@baseTile");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.get('.leaflet-tile-loaded[src^="https://tile.openstreetmap.de/"]', {
          timeout: TIMEOUT,
        }).should("have.length.above", 0);
      });
    });
  });

  describe("region maps", () => {
    const createStatesMap = (region: string) =>
      H.createQuestion({
        name: "People by state",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.STATE, null]],
        },
        display: "map",
        visualization_settings: {
          "map.type": "region",
          "map.region": region,
          "map.dimension": "STATE",
          "map.metric": "count",
        },
      }).then(({ body: { id: questionId } }) => {
        H.mockDataApp(APP_NAME, {
          displayName: APP_DISPLAY_NAME,
          testEnv: { ...TEST_ENV, downloadQuestionId: questionId },
        });
      });

    it("draws a built-in region map", () => {
      createStatesMap("us_states");

      visitAppRoute("download-question");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("data-app-download-question")
          .find("svg path", { timeout: TIMEOUT })
          .should("have.length.above", 40);
      });
    });

    it("draws a custom region map with the GeoJSON the page fetches", () => {
      H.updateSetting("custom-geojson", {
        test_states: {
          name: "Test states",
          url: "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/us-states.json",
          region_key: "STATE",
          region_name: "NAME",
        },
      });
      cy.intercept({
        hostname: SITE_HOSTNAME,
        method: "GET",
        pathname: "/api/geojson/test_states",
      }).as("brokeredGeoJson");
      createStatesMap("test_states");

      visitAppRoute("download-question");
      assertBrokered("@brokeredGeoJson");
      cy.get("@brokeredGeoJson").its("response.statusCode").should("eq", 200);
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.get(".leaflet-container path", { timeout: TIMEOUT }).should(
          "have.length.above",
          40,
        );
      });
    });
  });

  it("reports an app that throws to the page", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });

    visitAppRoute("throw");
    H.main()
      .findByText(/couldn.t be loaded/i, { timeout: TIMEOUT })
      .should("be.visible");
  });

  it("keeps the sandbox's protections on the isolated origin", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;

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
          blockedUrl: "https://blocked.data-app.test/ping",
        },
      },
    });

    visitAppRoute("sandboxing");
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      ["script", "window-open", "history", "websocket", "sendbeacon"].forEach(
        (id) => {
          cy.findByTestId(`probe-${id}`, { timeout: TIMEOUT }).should(
            "have.text",
            "blocked",
          );
        },
      );
      cy.findByTestId("probe-innerhtml").should("have.text", "stripped");
      cy.findByTestId("blocked-fetch-result", { timeout: TIMEOUT }).should(
        "contain",
        "not in allowed_hosts",
      );
      cy.findByTestId("allowed-fetch-result", { timeout: TIMEOUT }).should(
        "have.text",
        "ok: 200",
      );
    });
  });

  it("keeps an app's allowed hosts out of the anonymous app document, and enforces them with the policy the bundle brings", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const UNLISTED_URL = "https://unlisted.data-app.test/collect";

    // Answers whenever the browser lets the request out, so only a CSP can stop it.
    cy.intercept("POST", UNLISTED_URL, {
      statusCode: 200,
      headers: { "access-control-allow-origin": "*" },
      body: "ok",
    }).as("unlisted");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      allowedHosts: [ALLOWED_ORIGIN],
      testEnv: TEST_ENV,
    });

    cy.request(`${ISOLATED_ORIGIN}/embed/apps/${APP_NAME}`).then((response) => {
      expect(documentPolicy(response)).not.to.contain(ALLOWED_ORIGIN);
    });

    H.openDataApp(APP_NAME);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("data-app-content", { timeout: TIMEOUT }).should("exist");
    });

    appIframe()
      .its("0.contentDocument")
      .then((iframeDocument: Document) => {
        const policy = iframeDocument.querySelector<HTMLMetaElement>(
          'meta[http-equiv="Content-Security-Policy"]',
        )?.content;
        expect(policy, "the app's policy").to.contain("connect-src 'self'");
        expect(policy).to.contain(ALLOWED_ORIGIN);
      });

    cy.log("code that escaped the sandbox can't send data to an unlisted host");
    appIframe()
      .its("0.contentWindow")
      .then((iframeWindow: Window) =>
        iframeWindow
          .fetch(UNLISTED_URL, { method: "POST", body: "secret" })
          .then(
            () => "sent",
            () => "blocked",
          ),
      )
      .should("eq", "blocked");
    cy.get("@unlisted.all").should("have.length", 0);
  });

  it("doesn't run an app for a user without access: the page's request for its bundle is refused", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    cy.request(
      "DELETE",
      `/api/ee/apps/${APP_NAME}/groups/${USER_GROUPS.ALL_USERS_GROUP}`,
    );
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "GET",
      pathname: `/api/ee/apps/${APP_NAME}/bundle`,
    }).as("brokeredBundle");

    cy.signInAsNormalUser();
    H.openDataApp(APP_NAME);

    cy.wait("@brokeredBundle").its("response.statusCode").should("eq", 403);
    H.main()
      .findByText(/couldn.t be loaded/i, { timeout: TIMEOUT })
      .should("be.visible");
    cy.get("iframe").should("not.exist");
  });

  it("previews a disabled app in Data Studio with its allowed hosts, which the anonymous app document leaves out", () => {
    const ALLOWED_ORIGIN = "https://allowed.data-app.test";
    const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;

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
          blockedUrl: "https://blocked.data-app.test/ping",
        },
      },
    });
    cy.request("PUT", `/api/ee/apps/${APP_NAME}`, { enabled: false });

    cy.request(`${ISOLATED_ORIGIN}/embed/apps/${APP_NAME}`).then((response) => {
      expect(documentPolicy(response)).not.to.contain(ALLOWED_ORIGIN);
    });

    cy.visit(`/data-studio/apps/${APP_NAME}`);
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByRole("link", { name: "Sandbox", timeout: TIMEOUT }).click();
      cy.findByTestId("allowed-fetch-result", { timeout: TIMEOUT }).should(
        "have.text",
        "ok: 200",
      );
    });
  });

  it("edits and reruns a question in the notebook through the page", () => {
    cy.intercept({
      hostname: SITE_HOSTNAME,
      method: "POST",
      pathname: "/api/dataset",
    }).as("brokeredQuery");

    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    H.openDataApp(APP_NAME);

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("interactive-question-result-toolbar", {
        timeout: TIMEOUT,
      }).should("exist");
      cy.findByTestId("notebook-button").click();
      cy.findByText("Back to visualization", { timeout: TIMEOUT }).should(
        "be.visible",
      );

      cy.findByTestId("action-buttons").findByText("Filter").click();
      cy.get('[data-element-id="mantine-popover"]')
        .should("have.length.above", 0)
        .last()
        .within(() => {
          cy.findByText("Discount").click();
        });
      cy.findByPlaceholderText("Min").type("2");
      cy.findByText("Add filter").click();

      cy.findByText("Visualize").click();
      cy.findByText("Back to visualization", { timeout: TIMEOUT }).should(
        "not.exist",
      );
      cy.findByTestId("interactive-question-result-toolbar", {
        timeout: TIMEOUT,
      }).should("exist");
    });

    cy.get<Interception[]>("@brokeredQuery.all").should((interceptions) => {
      const last = interceptions[interceptions.length - 1];
      expect(interceptions.length, "queries").to.be.above(1);
      interceptions.forEach(({ request }) =>
        expect(request.headers["x-metabase-client"]).to.eq("data-app"),
      );
      expect(JSON.stringify(last?.request.body), "the edited query").to.match(
        /"filters?"/,
      );
    });
  });

  it("copies to the clipboard from the isolated origin, which the frame's permissions policy allows", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    visitAppRoute("clipboard");

    appIframe().should("have.attr", "allow").and("contain", "clipboard-write");

    // Headless Chrome reports the frame as unfocused, so the real write rejects;
    // the stub proves the app reaches the host clipboard with the text.
    H.dataAppIframe(APP_DISPLAY_NAME).then(($body) => {
      const win = $body[0].ownerDocument.defaultView;
      if (win) {
        cy.stub(win.navigator.clipboard, "writeText")
          .resolves()
          .as("writeText");
      }
    });
    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("clipboard-copy").click();
      cy.findByTestId("clipboard-status", { timeout: TIMEOUT }).should(
        "have.text",
        "copied",
      );
    });
    cy.get("@writeText").should(
      "have.been.calledOnceWith",
      "data-app-clipboard-payload",
    );
  });

  describe("custom visualizations", () => {
    beforeEach(() => {
      H.updateSetting("csp-img-enabled", true);
      H.updateSetting("custom-viz-enabled", true);
      H.addCustomVizPlugin(H.CUSTOM_VIZ_FIXTURE_TGZ);
    });

    it("renders a custom visualization inside a data app on the isolated origin, with its icon fetched through the page", () => {
      // The fixture plugin names an icon its archive doesn't hold, so the main
      // host answers for it.
      cy.intercept(
        {
          hostname: SITE_HOSTNAME,
          method: "GET",
          pathname: /^\/api\/ee\/custom-viz-plugin\/\d+\/asset$/,
        },
        {
          statusCode: 200,
          headers: { "content-type": "image/svg+xml" },
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        },
      ).as("brokeredIcon");

      H.mockDataApp(APP_NAME, {
        displayName: APP_DISPLAY_NAME,
        testEnv: {
          ...TEST_ENV,
          allowedCustomVisualizations: [H.CUSTOM_VIZ_DISPLAY],
        },
      });

      visitAppRoute("custom-viz");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("chart-type-selector-button", {
          timeout: TIMEOUT,
        }).click();
        cy.findByText("demo-viz").click();
        cy.findByTestId("demo-viz-click-target", { timeout: TIMEOUT }).should(
          "be.visible",
        );
        // An `<img>` of the plain asset URL would go to the isolated origin, which
        // has no session; the page fetches it and the app shows a `blob:` URL.
        cy.get('img[src^="blob:"]').should("exist");
      });
      assertBrokered("@brokeredIcon");
    });
  });

  describe("actions", { tags: ["@external", "@actions"] }, () => {
    const TEST_TABLE = "scoreboard_actions";

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      enableIsolatedOrigin();

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);
    });

    it("executes an action through the page", () => {
      cy.intercept({
        hostname: SITE_HOSTNAME,
        method: "POST",
        pathname: /^\/api\/action\/.+\/execute$/,
      }).as("brokeredAction");

      createDataAppScoreboardAction().then((action) => {
        H.mockDataApp(APP_NAME, {
          displayName: APP_DISPLAY_NAME,
          testEnv: {
            ...TEST_ENV,
            actionEntityId: action.entity_id,
            actionParams: { team_name: "Apps Host FC", score: 3 },
          },
        });
      });

      visitAppRoute("actions");
      H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
        cy.findByTestId("action-execute").click();
        cy.findByTestId("action-result", { timeout: TIMEOUT }).should(
          "have.text",
          "has-result",
        );
      });
      assertBrokered("@brokeredAction");

      H.queryWritableDB(
        `SELECT score FROM ${TEST_TABLE} WHERE team_name = 'Apps Host FC'`,
      ).then(({ rows }) => {
        expect(rows).to.have.length(1);
        expect(rows[0].score).to.eq(3);
      });
    });
  });
});
