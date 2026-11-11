import type { Interception } from "cypress/types/net-stubbing";

import { USERS, USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const TIMEOUT = 30000;

/** The apps of the fixture repository (`e2e/support/assets/data-apps/data_apps`). */
type FixtureApp = { slug: string; name: string };
const SANDBOX: FixtureApp = { slug: "sandbox", name: "Sandbox" };
const TEAMS: FixtureApp = { slug: "teams", name: "Teams" };

const TEAMS_TABLE = "scoreboard_actions";
const FIRST_TEAM = "Amorous Aardvarks: 0";

/** The instance's own address, which the spec makes the site URL. */
function getSiteUrl(): string {
  const baseUrl = Cypress.config("baseUrl");
  if (!baseUrl) {
    throw new Error(
      "baseUrl must be set to serve data apps from an isolated origin",
    );
  }
  return new URL(baseUrl).origin;
}

/**
 * The address the spec serves data apps from: the backend under its other loopback
 * name. The session cookie is host-only, so it doesn't reach this address.
 */
function getIsolatedOrigin(): string {
  const url = new URL(getSiteUrl());
  url.hostname = url.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
  return url.origin;
}

/**
 * `MB_ISOLATED_ORIGIN` is environment-only, and every spec shares one backend, so a
 * testing endpoint sets it until the next snapshot restore.
 */
const setIsolatedOrigin = (value: string | null) =>
  cy.request("PUT", "/api/testing/isolated-origin", { value });

const SITE_URL = getSiteUrl();
const SITE_HOSTNAME = new URL(SITE_URL).hostname;
const ISOLATED_ORIGIN = getIsolatedOrigin();
const ISOLATED_HOSTNAME = new URL(ISOLATED_ORIGIN).hostname;

const SESSION_COOKIE = "metabase.SESSION";
// In the sandbox app's `allowed_hosts`; its Sandbox page fetches `ALLOWED_URL`.
const ALLOWED_ORIGIN = "https://allowed.data-app.test";
const ALLOWED_URL = `${ALLOWED_ORIGIN}/ping`;

const appIframe = ({ name }: FixtureApp) => cy.get(`iframe[title="${name}"]`);

const visitAppRoute = ({ slug }: FixtureApp, route: string) =>
  cy.visit(`/apps/${slug}/${route}`);

const expectFrameServedFrom = (app: FixtureApp, origin: string) =>
  appIframe(app).should(($iframe) => {
    expect(new URL(String($iframe.attr("src"))).origin).to.eq(origin);
  });

/** Records as `@alias` the requests the page sends to the main host for `route`. */
const interceptFromPage = (
  alias: string,
  route: { method: string; pathname: string | RegExp },
  response?: Parameters<typeof cy.intercept>[1],
) =>
  (response === undefined
    ? cy.intercept({ hostname: SITE_HOSTNAME, ...route })
    : cy.intercept({ hostname: SITE_HOSTNAME, ...route }, response)
  ).as(alias);

const bundleRoute = ({ slug }: FixtureApp) => ({
  method: "GET",
  pathname: `/api/ee/apps/${slug}/bundle`,
});

/** Checks that a request the page made for the app went out as the page's own. */
const expectBrokered = ({ request }: Interception) => {
  expect(request.headers["x-metabase-client"], "client").to.eq("data-app");
  expect(request.headers["sec-fetch-site"], "fetch site").to.eq("same-origin");
};

const assertBrokered = (
  alias: string,
  { statusCode }: { statusCode?: number } = {},
) =>
  cy.wait(alias).then((interception) => {
    expectBrokered(interception);
    if (statusCode !== undefined) {
      expect(interception.response?.statusCode, "status").to.eq(statusCode);
    }
  });

/**
 * The anonymous app document's CSP leaves out `origin`: its hosts are `*` there, until
 * the policy the bundle brings narrows them.
 */
const expectAnonymousDocumentOmits = ({ slug }: FixtureApp, origin: string) =>
  cy.request(`${ISOLATED_ORIGIN}/embed/apps/${slug}`).then((response) => {
    const policy = response.headers["content-security-policy"];
    if (typeof policy !== "string") {
      throw new Error("the app document has no CSP header");
    }
    expect(policy).to.match(/connect-src[^;]*\*/);
    expect(policy).not.to.contain(origin);
  });

const stubAllowedHost = () =>
  cy.intercept("GET", ALLOWED_URL, {
    statusCode: 200,
    headers: { "access-control-allow-origin": "*" },
    body: "pong",
  });

const expectIsolationPage = () =>
  H.dataAppIframe(SANDBOX.name)
    .findByTestId("js-marker", { timeout: TIMEOUT })
    .should("have.text", "in-app");

const expectFirstTeam = () =>
  H.dataAppIframe(TEAMS.name)
    .findByRole("list", { name: "Teams" })
    .findByText(FIRST_TEAM, { timeout: TIMEOUT })
    .should("be.visible");

describe(
  "scenarios > data apps > isolated origin",
  { tags: ["@external"] },
  () => {
    let isolatedOriginApiRequests: string[] = [];

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: TEAMS_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEAMS_TABLE });

      H.createLibrary();
      H.setupGitSync();
      H.copyDataAppsFixture();
      H.commitToRepo("Add data apps");
      H.configureGitAndPullChanges("read-only");

      H.updateSetting("site-url", SITE_URL);
      setIsolatedOrigin(ISOLATED_ORIGIN);

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
        pathname: `/embed/apps/${TEAMS.slug}`,
      }).as("appDocument");
      interceptFromPage("brokeredQuery", {
        method: "POST",
        pathname: "/api/dataset",
      });

      H.openDataApp(TEAMS.slug);

      expectFrameServedFrom(TEAMS, ISOLATED_ORIGIN);
      cy.wait("@appDocument").then(({ request, response }) => {
        expect(String(request.headers.cookie ?? "")).not.to.contain(
          SESSION_COOKIE,
        );
        expect(response?.statusCode).to.eq(200);
      });

      expectFirstTeam();
      assertBrokered("@brokeredQuery");

      cy.log("the frame's URL carries nothing from the page");
      appIframe(TEAMS)
        .its("0.contentWindow.location")
        .should((location: Location) => {
          expect(location.origin).to.eq(ISOLATED_ORIGIN);
          expect(location.hash).to.eq("");
        });
    });

    it("previews the app in Data Studio from the isolated origin", () => {
      interceptFromPage("brokeredQuery", {
        method: "POST",
        pathname: "/api/dataset",
      });

      cy.visit(`/data-studio/apps/${TEAMS.slug}`);

      expectFrameServedFrom(TEAMS, ISOLATED_ORIGIN);
      expectFirstTeam();
      assertBrokered("@brokeredQuery")
        .its("request.headers.x-metabase-client-identifier")
        .should("eq", TEAMS.slug);
    });

    it("passes the user's locale to the app, which the isolated origin can't learn without a session", () => {
      cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, { locale: "de" });

      H.openDataApp(TEAMS.slug);

      expectFirstTeam();
      appIframe(TEAMS)
        .its("0.contentWindow.MetabaseUserLocalization.headers.language")
        .should("eq", "de");
    });

    it("keeps the isolated origin to the app document, and sends the document there from the main host", () => {
      cy.log("the main host redirects the app document to the isolated origin");
      cy.request({
        url: `/embed/apps/${SANDBOX.slug}/isolation?tab=1`,
        followRedirect: false,
      }).then((response) => {
        expect(response.status).to.eq(307);
        expect(response.headers.location).to.eq(
          `${ISOLATED_ORIGIN}/embed/apps/${SANDBOX.slug}/isolation?tab=1`,
        );
      });

      cy.log(
        "the isolated origin serves the app document to a request without a session",
      );
      cy.request(`${ISOLATED_ORIGIN}/embed/apps/${SANDBOX.slug}`).then(
        (response) => {
          expect(String(response.body)).to.contain("app-data-app");
        },
      );

      cy.log("and refuses it to a request with one");
      cy.getCookie(SESSION_COOKIE).then((cookie) => {
        cy.request({
          url: `${ISOLATED_ORIGIN}/embed/apps/${SANDBOX.slug}`,
          headers: { cookie: `${SESSION_COOKIE}=${cookie?.value}` },
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
        url: `${ISOLATED_ORIGIN}/apps/${SANDBOX.slug}/isolation`,
        followRedirect: false,
      }).then((response) => {
        expect(response.status).to.eq(307);
        expect(response.headers.location).to.eq(
          `${SITE_URL}/apps/${SANDBOX.slug}/isolation`,
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

    it("refuses data apps when the isolated origin can't be used, and the page says why at once", () => {
      // The site URL's own host name: a different port isn't a different host for cookies.
      setIsolatedOrigin(`${new URL(SITE_URL).protocol}//${SITE_HOSTNAME}:1`);

      cy.request({
        url: `/embed/apps/${SANDBOX.slug}`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 503);
      cy.request("/api/session/properties").its("body").should("deep.include", {
        "isolated-origin": null,
        "isolated-origin-misconfigured?": true,
      });

      H.openDataApp(SANDBOX.slug);
      H.main().findByText("Data apps are unavailable").should("be.visible");
      appIframe(SANDBOX).should("not.exist");
    });

    it("mirrors the app's routes into the page URL, starts on a deep link, and keeps working after the frame reloads", () => {
      visitAppRoute(SANDBOX, "isolation");
      appIframe(SANDBOX)
        .invoke("attr", "src")
        .then((src) => {
          expect(new URL(String(src)).pathname).to.eq(
            `/embed/apps/${SANDBOX.slug}/isolation`,
          );
        });
      expectIsolationPage();

      H.dataAppIframe(SANDBOX.name).within(() => {
        cy.findByRole("link", { name: "Sandbox" }).click();
        cy.findByTestId("data-app-sandbox").should("be.visible");
      });
      cy.location("pathname").should("eq", `/apps/${SANDBOX.slug}/sandboxing`);

      cy.log(
        "reload the frame, which finds its host in its own document again",
      );
      interceptFromPage("bundleAfterReload", bundleRoute(SANDBOX));
      appIframe(SANDBOX)
        .its("0.contentWindow")
        .then((win: Window) => {
          Object.assign(win, { beforeReload: true });
          win.location.reload();
        });
      appIframe(SANDBOX)
        .its("0.contentWindow")
        .should("not.have.property", "beforeReload");

      H.dataAppIframe(SANDBOX.name)
        .findByTestId("data-app-sandbox", { timeout: TIMEOUT })
        .should("be.visible");
      assertBrokered("@bundleAfterReload");

      H.dataAppIframe(SANDBOX.name)
        .findByRole("link", { name: "Isolation" })
        .click();
      expectIsolationPage();
      cy.location("pathname").should("eq", `/apps/${SANDBOX.slug}/isolation`);
    });

    it("reports an app that throws to the page", () => {
      interceptFromPage("throwingBundle", bundleRoute(SANDBOX), (req) => {
        // A conditional request could come back as a bodiless 304.
        delete req.headers["if-none-match"];
        req.continue((res) => {
          res.body = 'throw new Error("The app failed to start");';
        });
      });

      H.openDataApp(SANDBOX.slug);

      H.main()
        .findByText(/couldn.t be loaded/i, { timeout: TIMEOUT })
        .should("be.visible");
    });

    it("keeps the sandbox's protections on the isolated origin", () => {
      stubAllowedHost();

      visitAppRoute(SANDBOX, "sandboxing");
      H.dataAppIframe(SANDBOX.name).within(() => {
        cy.findByTestId("data-app-sandbox", { timeout: TIMEOUT }).should(
          "be.visible",
        );
        // Every probe on this page runs something the sandbox must stop.
        cy.get('[data-testid^="probe-"]')
          .not('[data-testid="probe-innerhtml"]')
          .should(($probes) => {
            expect($probes, "probes").to.have.length.above(0);
            $probes.each((_, probe) => {
              expect(probe.textContent, probe.dataset.testid).to.eq("blocked");
            });
          });
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
      const UNLISTED_URL = "https://unlisted.data-app.test/collect";

      // Answers whenever the browser lets the request out, so only a CSP can stop it.
      cy.intercept("POST", UNLISTED_URL, {
        statusCode: 200,
        headers: { "access-control-allow-origin": "*" },
        body: "ok",
      }).as("unlisted");

      expectAnonymousDocumentOmits(SANDBOX, ALLOWED_ORIGIN);

      visitAppRoute(SANDBOX, "isolation");
      expectIsolationPage();

      appIframe(SANDBOX)
        .its("0.contentDocument")
        .then((iframeDocument: Document) => {
          const policy = iframeDocument.querySelector<HTMLMetaElement>(
            'meta[http-equiv="Content-Security-Policy"]',
          )?.content;
          expect(policy, "the app's policy").to.contain("connect-src 'self'");
          expect(policy).to.contain(ALLOWED_ORIGIN);
        });

      cy.log(
        "code that escaped the sandbox can't send data to an unlisted host",
      );
      appIframe(SANDBOX)
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

    it("doesn't run an app for a user without access, whose request for its bundle is refused", () => {
      // Whether an imported app starts out shared with All Users doesn't matter here.
      cy.request({
        method: "DELETE",
        url: `/api/ee/apps/${SANDBOX.slug}/groups/${USER_GROUPS.ALL_USERS_GROUP}`,
        failOnStatusCode: false,
      });

      cy.signInAsNormalUser();
      H.openDataApp(SANDBOX.slug);

      H.main()
        .findByText(/have access to this data app/, { timeout: TIMEOUT })
        .should("be.visible");
      cy.get("iframe").should("not.exist");
      cy.request({
        url: `/api/ee/apps/${SANDBOX.slug}/bundle`,
        headers: { "x-metabase-client": "data-app" },
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 403);
    });

    it("previews a disabled app in Data Studio with its allowed hosts, which the anonymous app document leaves out", () => {
      stubAllowedHost();
      cy.request("PUT", `/api/ee/apps/${SANDBOX.slug}`, { enabled: false });

      expectAnonymousDocumentOmits(SANDBOX, ALLOWED_ORIGIN);

      cy.visit(`/data-studio/apps/${SANDBOX.slug}`);
      H.dataAppIframe(SANDBOX.name).within(() => {
        cy.findByRole("link", { name: "Sandbox", timeout: TIMEOUT }).click();
        cy.findByTestId("allowed-fetch-result", { timeout: TIMEOUT }).should(
          "have.text",
          "ok: 200",
        );
      });
    });

    it("copies to the clipboard from the isolated origin, which the frame's permissions policy allows", () => {
      visitAppRoute(SANDBOX, "isolation");

      appIframe(SANDBOX)
        .should("have.attr", "allow")
        .and("contain", "clipboard-write");
      expectIsolationPage();

      // Headless Chrome reports the frame as unfocused, so the real write rejects;
      // the stub proves the app reaches the frame's clipboard with the text.
      H.dataAppIframe(SANDBOX.name).then(($body) => {
        const win = $body[0].ownerDocument.defaultView;
        if (!win) {
          throw new Error("the app frame has no window");
        }
        cy.stub(win.navigator.clipboard, "writeText")
          .resolves()
          .as("writeText");
      });
      H.dataAppIframe(SANDBOX.name).within(() => {
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

    describe("actions", { tags: ["@external", "@actions"] }, () => {
      const NEW_TEAM = "Isolated Origin FC";

      beforeEach(() => {
        H.setActionsEnabledForDB(WRITABLE_DB_ID);
      });

      it("executes an action through the page, and refetches the app's question through it", () => {
        interceptFromPage("brokeredAction", {
          method: "POST",
          pathname: /^\/api\/action\/.+\/execute$/,
        });

        H.openDataApp(TEAMS.slug);
        expectFirstTeam();

        interceptFromPage("brokeredRefetch", {
          method: "POST",
          pathname: "/api/dataset",
        });
        H.dataAppIframe(TEAMS.name).within(() => {
          cy.findByLabelText("Team name").type(NEW_TEAM);
          cy.findByRole("button", { name: "Add team" }).click();
          cy.findByRole("list", { name: "Teams" })
            .findByText(`${NEW_TEAM}: 0`, { timeout: TIMEOUT })
            .should("be.visible");
        });
        assertBrokered("@brokeredAction");
        assertBrokered("@brokeredRefetch");

        H.queryWritableDB(
          `SELECT score FROM ${TEAMS_TABLE} WHERE team_name = '${NEW_TEAM}'`,
        ).then(({ rows }) => {
          expect(rows).to.have.length(1);
        });
      });
    });
  },
);
