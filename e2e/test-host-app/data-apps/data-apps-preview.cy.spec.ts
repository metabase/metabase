import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  DATA_APP_DEV_DIAGNOSTICS_PATH,
  devToolbarPanel,
  devToolbarTab,
  openDevToolbar,
  readDiagnosticsUntil,
} from "e2e/support/helpers/e2e-data-app-dev-helpers";
import {
  DATA_APP_DEV_APP_SRC_PATH,
  DATA_APP_DEV_ENV_PATH,
  DATA_APP_DEV_MANIFEST_PATH,
  setUpDataAppDevServer,
  tearDownDataAppDevServer,
  visitDataAppDevApp,
} from "e2e/support/helpers/e2e-data-app-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";

const TIMEOUT_MS = 40000;

const CLIENT_PORT = Cypress.expose("CLIENT_PORT");
const CLIENT_HOST = `http://localhost:${CLIENT_PORT}`;

const { ORDERS_ID } = SAMPLE_DATABASE;

const DIAGNOSTICS_URL = `${CLIENT_HOST}${DATA_APP_DEV_DIAGNOSTICS_PATH}`;

describe("Embedding SDK: data-app dev preview", () => {
  before(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    setUpDataAppDevServer({ clientHost: CLIENT_HOST, tableId: ORDERS_ID });
  });

  after(() => {
    tearDownDataAppDevServer();
  });

  it("serves and renders the sandboxed data app", () => {
    cy.visit(CLIENT_HOST);

    cy.findByTestId("dev-app-content", { timeout: TIMEOUT_MS }).should("exist");
    cy.findByTestId("dev-app-question").should("exist");
  });

  it("renders a StaticQuestion fed a query from useMetabaseQueryObject", () => {
    cy.visit(CLIENT_HOST);

    cy.findByTestId("table-body", { timeout: TIMEOUT_MS })
      .findAllByTestId("cell-data")
      .should("have.length.greaterThan", 0);
  });

  it("sandboxes network requests but permits allowed_hosts", () => {
    cy.intercept("https://allowed.data-app.test/**").as("allowedRequest");
    cy.intercept("https://blocked.data-app.test/**").as("blockedRequest");

    cy.visit(CLIENT_HOST);

    // The allowed host (in data_app.yaml) reaches the network; the other never
    // does — the sandbox rejects it before a request is made.
    cy.get("@allowedRequest.all", { timeout: TIMEOUT_MS }).should(
      "have.length.at.least",
      1,
    );
    cy.get("@blockedRequest.all").should("have.length", 0);
  });

  describe("the dev server's relay to the instance", () => {
    // The key the e2e setup wrote; asserted on as a boolean so it stays out of the log.
    const readApiKey = () =>
      cy.readFile<string>(DATA_APP_DEV_ENV_PATH).then((env) => {
        const apiKey = env.match(/^DATA_APP_MB_API_KEY=(.+)$/m)?.[1];

        if (!apiKey) {
          throw new Error(`no DATA_APP_MB_API_KEY in ${DATA_APP_DEV_ENV_PATH}`);
        }

        return apiKey;
      });

    describe("against app code that escaped the sandbox", () => {
      const INSTANCE_ORIGIN = new URL(String(Cypress.config("baseUrl"))).origin;

      const FORGED_CREDENTIALS = {
        "Content-Type": "application/json",
        "X-Metabase-Client": "embedding-sdk-react",
        "X-Metabase-Session": "forged",
        "X-Api-Key": "mb_forged",
        Authorization: "Bearer forged",
      };

      // The query strings of past Vite CVEs that read files Vite refuses to serve.
      const ENV_FILE_REQUESTS = [
        "/.env.local",
        "/.env.local?raw",
        "/.env.local?raw??",
        "/.env.local?import&raw??",
        "/.env.local?inline&import",
        "/.env.local?url",
      ];

      const MAX_MODULES = 200;

      const escapedAdmin = (email: string) => ({
        first_name: "Escaped",
        last_name: "Admin",
        email,
        password: "Escaped-admin-1234!",
        user_group_memberships: [
          { id: USER_GROUPS.ALL_USERS_GROUP, is_group_manager: false },
          { id: USER_GROUPS.ADMIN_GROUP, is_group_manager: false },
        ],
      });

      // The preview page's own window is outside the sandbox's membrane, with the page's origin, cookies and CSP: what
      // app code that escaped the membrane runs with. The guards the sandbox puts on that window still apply.
      const inPreviewPage = <T>(
        attack: (win: Cypress.AUTWindow) => Promise<T>,
      ) => cy.window().then({ timeout: TIMEOUT_MS }, attack);

      const importedPaths = (source: string) =>
        Array.from(
          source.matchAll(
            /(?:\bsrc=|\bfrom\s*|\bimport\s*\(?\s*)["'](\/[^"']+)["']/g,
          ),
          (match) => match[1],
        );

      /** The page and every module it imports from the dev server, as the page can read them. */
      const readServedModules = async (win: Cypress.AUTWindow) => {
        const page = await (
          await win.fetch("/", { headers: { Accept: "text/html" } })
        ).text();
        const sources = [page];
        const queue = importedPaths(page);
        const seen = new Set<string>();

        while (queue.length > 0 && seen.size < MAX_MODULES) {
          const path = queue.shift();

          if (path !== undefined && !seen.has(path)) {
            seen.add(path);
            const source = await (await win.fetch(path)).text();
            sources.push(source);
            queue.push(...importedPaths(source));
          }
        }

        return sources;
      };

      it("finds no API key in the page, the modules the dev server serves it, or .env.local", () => {
        visitDataAppDevApp(CLIENT_HOST);

        readApiKey().then((apiKey) => {
          inPreviewPage(async (win) => {
            const modules = await readServedModules(win);
            const envFiles = await Promise.all(
              ENV_FILE_REQUESTS.map((path) =>
                win.fetch(path).then((response) => response.text()),
              ),
            );

            return {
              moduleCount: modules.length,
              holdsKey: [...modules, ...envFiles].some((text) =>
                text.includes(apiKey),
              ),
            };
          }).then(({ moduleCount, holdsKey }) => {
            expect(moduleCount, "modules read").to.be.greaterThan(3);
            expect(
              holdsKey,
              "something the page can read holds the key",
            ).to.equal(false);
          });
        });
      });

      it("gets only the data-app endpoints through the dev server, whatever credentials it claims", () => {
        visitDataAppDevApp(CLIENT_HOST);

        inPreviewPage(async (win) => {
          const send = (method: string, path: string, body?: object) =>
            win.fetch(path, {
              method,
              headers: FORGED_CREDENTIALS,
              body: body && JSON.stringify(body),
            });

          const currentUser: unknown = await (
            await send("GET", "/api/user/current")
          ).json();
          const createAdmin = await send(
            "POST",
            "/api/user",
            escapedAdmin(`escaped-relay-${Date.now()}@example.com`),
          );
          const createApiKey = await send("POST", "/api/api-key", {
            name: "escaped",
            group_id: USER_GROUPS.ADMIN_GROUP,
          });

          return {
            currentUser,
            createAdmin: createAdmin.status,
            createApiKey: createApiKey.status,
          };
        }).then(({ currentUser, createAdmin, createApiKey }) => {
          // The key's user, named after the key: neither the forged credentials nor a session counted.
          expect(currentUser)
            .to.have.property("first_name")
            .that.matches(/^data-app-dev-e2e-/);
          expect(createAdmin, "POST /api/user").to.equal(403);
          expect(createApiKey, "POST /api/api-key").to.equal(403);
        });
      });

      it("can't call the instance directly, which would send the developer's session", () => {
        // Cypress strips `connect-src` from every page it tests, so the browser can't refuse such a call here: the
        // policy it refuses it by is checked instead.
        cy.request({ url: CLIENT_HOST, headers: { Accept: "text/html" } })
          .its("headers.content-security-policy")
          .then((header) => {
            const csp = String(header);

            expect(
              csp.match(/connect-src([^;]*)/)?.[1],
              "connect-src",
            ).not.to.include(INSTANCE_ORIGIN);
            expect(csp, "the page's CSP")
              .to.include("form-action 'none'")
              .and.include("frame-src 'none'");
          });
      });
    });

    it("refuses requests from other pages, which it would otherwise sign with the key", () => {
      for (const headers of [
        { Origin: "https://attacker.example" },
        { "Sec-Fetch-Site": "cross-site" },
      ]) {
        cy.request({
          url: `${CLIENT_HOST}/api/user/current`,
          headers,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 404);
      }
    });
  });

  describe("dev diagnostics", () => {
    beforeEach(() => {
      // The dev server's buffer outlives page loads by design; start each test
      // from an empty feed so assertions only see this test's events.
      cy.request("DELETE", DIAGNOSTICS_URL);

      visitDataAppDevApp(CLIENT_HOST);
    });

    it("surfaces the sandbox-blocked request in the Blocked tab, with the fix hint", () => {
      openDevToolbar();
      devToolbarTab("Blocked").click();

      // `AllBy`: the app remounts once when the SDK store initializes, so its
      // mount-time probe can legitimately record the same block twice.
      devToolbarPanel()
        .findAllByText(/Blocked fetch to blocked\.data-app\.test/, {
          timeout: TIMEOUT_MS,
        })
        .first()
        .should("be.visible");
      devToolbarPanel()
        .findAllByText(
          /Add https:\/\/blocked\.data-app\.test to allowed_hosts in data_app\.yaml/,
        )
        .first()
        .should("be.visible");
    });

    it("captures an error thrown inside the sandboxed app end to end", () => {
      cy.findByTestId("dev-app-error-probe").click();

      openDevToolbar();
      devToolbarPanel()
        .findByText("dev-app probe error", { timeout: TIMEOUT_MS })
        .should("be.visible");

      readDiagnosticsUntil(DIAGNOSTICS_URL, "the probe error entry", (report) =>
        report.entries.some(
          (entry) =>
            entry.kind === "error" && entry.summary === "dev-app probe error",
        ),
      );
    });

    it("lists the app's real Metabase calls in the Queries tab", () => {
      cy.findByTestId("table-body", { timeout: TIMEOUT_MS }).should("exist");

      openDevToolbar();
      devToolbarTab("Queries").click();

      devToolbarPanel()
        .findByText(/Dev runs with an API key/)
        .should("be.visible");
      devToolbarPanel()
        .findAllByText(/\/api\/(dataset|card)/, { timeout: TIMEOUT_MS })
        .its("length")
        .should("be.gte", 1);
    });

    it("shows the real connection and manifest state in their tabs", () => {
      const mbUrl = String(Cypress.config("baseUrl"));

      openDevToolbar();

      devToolbarTab("Connection").click();
      devToolbarPanel()
        .findByText(mbUrl, { timeout: TIMEOUT_MS })
        .should("be.visible");
      devToolbarPanel().findByText("✓").should("exist");

      devToolbarTab("Manifest").click();
      devToolbarPanel().findByText("Vite 6 Data App").should("exist");
      // Regex: the allowed_hosts row joins the list into one text node.
      devToolbarPanel()
        .findByText(/https:\/\/allowed\.data-app\.test/)
        .should("exist");
    });

    it("serves the report to shell agents, with cursor filtering", () => {
      // Retry the full read-then-cursor pair until no POST sneaks between
      // the two GETs. Under CPU throttling the reporter's batched timer can
      // jitter enough to land a POST in that gap, so a single-pass idle
      // guard before the first GET is not enough.
      const verifyStableCursor = (attempt = 0): Cypress.Chainable<void> => {
        return cy.request(DIAGNOSTICS_URL).then(({ body: report }) => {
          expect(report.manifest?.errors).to.have.length(0);
          expect(report.clients).to.be.gte(1);

          return cy
            .request(`${DIAGNOSTICS_URL}?startEventId=${report.nextEventId}`)
            .then(({ body: filtered }) => {
              if (filtered.entries.length === 0) {
                return;
              }
              if (attempt >= 20) {
                throw new Error("Cursor never stabilized");
              }
              return cy
                .wait(250, { log: false })
                .then(() => verifyStableCursor(attempt + 1));
            });
        });
      };

      readDiagnosticsUntil(
        DIAGNOSTICS_URL,
        "a blocked-network entry and a healthy connection",
        (report) =>
          report.entries.some((entry) => entry.kind === "blocked-network") &&
          report.connection?.reachable === true,
      ).then(() => verifyStableCursor());
    });

    it("keeps the buffer across a page reload, with continuous event ids", () => {
      readDiagnosticsUntil(
        DIAGNOSTICS_URL,
        "the first page session's blocked entry",
        (report) =>
          report.entries.some((entry) => entry.kind === "blocked-network"),
      ).then((before) => {
        // The first page goes on reporting past this snapshot — its reporter
        // batches, and the blocked entry waited for above lands while the app's
        // requests are still in flight. So "the buffer grew" does not mean the
        // reloaded page has said anything yet; a batch from the page about to
        // be replaced grows it too. Wait for a session this snapshot has never
        // seen instead.
        const sessionsBefore = new Set(
          before.entries.map((entry) => entry.sessionId),
        );

        cy.reload();
        cy.findByTestId("dev-app-content", { timeout: TIMEOUT_MS }).should(
          "exist",
        );

        // A reload must not empty the buffer — the errors that prompted the
        // reload are the ones a reader most needs. The server appends the new
        // session's events under its own id sequence, so a reader that
        // consumed up to N never skips or re-reads anything.
        readDiagnosticsUntil(
          DIAGNOSTICS_URL,
          "the reloaded page's own events appended after the first session's",
          (report) =>
            report.entries.some(
              (entry) => !sessionsBefore.has(entry.sessionId),
            ),
        ).then((after) => {
          const beforeIds = before.entries.map((entry) => entry.eventId);
          const afterIds = after.entries.map((entry) => entry.eventId);

          expect(afterIds.slice(0, beforeIds.length)).to.deep.equal(beforeIds);
          afterIds.forEach((id, index) => {
            if (index > 0) {
              expect(id).to.be.greaterThan(afterIds[index - 1]);
            }
          });

          // Every session is in the buffer, tagged with the page load that
          // reported it — that stamp is what the toolbar filters on.
          const sessions = new Set(after.entries.map((e) => e.sessionId));
          expect(sessions.size).to.be.gte(2);
        });
      });
    });

    it("shows only the current page's entries in the panel after a reload", () => {
      openDevToolbar();
      devToolbarTab("Blocked").click();
      devToolbarPanel()
        .findAllByText(/Blocked fetch to blocked\.data-app\.test/, {
          timeout: TIMEOUT_MS,
        })
        .then(($before) => {
          const beforeCount = $before.length;

          cy.reload();
          cy.findByTestId("dev-app-content", { timeout: TIMEOUT_MS }).should(
            "exist",
          );
          openDevToolbar();
          devToolbarTab("Blocked").click();

          // The reloaded page re-fires the same blocked request. Without the
          // per-session filter the panel would stack a copy per reload, so the
          // count must not grow even though the server kept both sessions.
          devToolbarPanel()
            .findAllByText(/Blocked fetch to blocked\.data-app\.test/, {
              timeout: TIMEOUT_MS,
            })
            .should("have.length.at.most", beforeCount);
        });
    });

    it("empties the open toolbar when an agent clears over the endpoint", () => {
      openDevToolbar();
      devToolbarTab("Blocked").click();
      devToolbarPanel()
        .findAllByText(/Blocked fetch to blocked\.data-app\.test/, {
          timeout: TIMEOUT_MS,
        })
        .first()
        .should("be.visible");

      cy.request("DELETE", DIAGNOSTICS_URL);

      // No reload: the DELETE broadcast nudges this page's toolbar to re-read.
      devToolbarPanel()
        .findAllByText(/Blocked fetch to blocked\.data-app\.test/, {
          timeout: TIMEOUT_MS,
        })
        .should("not.exist");
      devToolbarPanel().findByText("Nothing blocked.").should("be.visible");
    });
  });

  describe("live manifest validation", () => {
    let originalManifest: string;

    before(() => {
      cy.readFile(DATA_APP_DEV_MANIFEST_PATH).then((content: string) => {
        // Strip this suite's own appended host first: an interrupted earlier
        // run can leave it behind, and capturing that as "original" would
        // restore the pollution forever after.
        originalManifest = content
          .split("\n")
          .filter((line) => !line.includes("https://added.example"))
          .join("\n");

        cy.writeFile(DATA_APP_DEV_MANIFEST_PATH, originalManifest);
      });
    });

    afterEach(() => {
      cy.writeFile(DATA_APP_DEV_MANIFEST_PATH, originalManifest);
    });

    it("pushes re-validation to the open toolbar when data_app.yaml changes", () => {
      visitDataAppDevApp(CLIENT_HOST);
      openDevToolbar();
      devToolbarTab("Manifest").click();
      devToolbarPanel()
        .findByText("Vite 6 Data App", { timeout: TIMEOUT_MS })
        .should("exist");
      devToolbarPanel()
        .findByText(/allowed_hosts changed since the dev server started/)
        .should("not.exist");

      cy.writeFile(
        DATA_APP_DEV_MANIFEST_PATH,
        originalManifest.replace(
          "  - https://allowed.data-app.test\n",
          "  - https://allowed.data-app.test\n  - https://added.example\n",
        ),
      );

      // No reload and no dev-server restart: the watcher re-validates and the
      // changed-event nudge makes the open toolbar re-read — the drifted
      // allowlist shows up along with the restart-required notice.
      devToolbarPanel()
        .findByText(/allowed_hosts changed since the dev server started/, {
          timeout: TIMEOUT_MS,
        })
        .should("be.visible");
      devToolbarPanel()
        .findByText(/https:\/\/added\.example/)
        .should("exist");

      cy.writeFile(DATA_APP_DEV_MANIFEST_PATH, originalManifest);
      cy.request("DELETE", DIAGNOSTICS_URL);

      devToolbarPanel()
        .findByText(/allowed_hosts changed since the dev server started/, {
          timeout: TIMEOUT_MS,
        })
        .should("not.exist");
    });
  });

  describe("soft reload", () => {
    let originalAppSrc: string;

    before(() => {
      cy.readFile(DATA_APP_DEV_APP_SRC_PATH).then((content: string) => {
        // Strip this suite's own marker first — see the manifest suite's note
        // on healing an interrupted earlier run.
        originalAppSrc = content.replaceAll(" — rebuilt", "");

        cy.writeFile(DATA_APP_DEV_APP_SRC_PATH, originalAppSrc);
      });
    });

    afterEach(() => {
      cy.writeFile(DATA_APP_DEV_APP_SRC_PATH, originalAppSrc);
    });

    it("rebuilds and re-renders a source change in place, without a page reload", () => {
      visitDataAppDevApp(CLIENT_HOST);

      cy.window().then((win) => {
        // A full navigation would wipe this; the soft reload must not.
        Object.assign(win, { __softReloadCanary: true });
      });

      cy.request(DIAGNOSTICS_URL)
        .its("body.lastRebuildAt")
        .then((rebuiltAtBefore: number | null) => {
          cy.writeFile(
            DATA_APP_DEV_APP_SRC_PATH,
            originalAppSrc.replace(
              "Vite 6 data app",
              "Vite 6 data app — rebuilt",
            ),
          );

          // The dev plugin rebuilds the bundle in memory and the entry
          // re-evaluates it in the live sandbox — the change shows up in place.
          cy.findByTestId("dev-app-content")
            .findByText("Vite 6 data app — rebuilt", { timeout: TIMEOUT_MS })
            .should("be.visible");

          cy.window().its("__softReloadCanary").should("equal", true);

          // The feed timestamps the rebuild, so a shell agent can tell the
          // running bundle changed.
          readDiagnosticsUntil(
            DIAGNOSTICS_URL,
            "a fresh lastRebuildAt",
            (report) =>
              report.lastRebuildAt != null &&
              report.lastRebuildAt !== rebuiltAtBefore,
          );
        });
    });

    it("withholds what a build reported once a rebuild has replaced it", () => {
      visitDataAppDevApp(CLIENT_HOST);

      cy.findByTestId("dev-app-error-probe").click();
      readDiagnosticsUntil(
        DIAGNOSTICS_URL,
        "the probe error under the build that is running",
        (report) =>
          report.entries.some(
            (entry) => entry.summary === "dev-app probe error",
          ),
      );

      cy.writeFile(
        DATA_APP_DEV_APP_SRC_PATH,
        originalAppSrc.replace("Vite 6 data app", "Vite 6 data app — rebuilt"),
      );
      cy.findByTestId("dev-app-content")
        .findByText("Vite 6 data app — rebuilt", { timeout: TIMEOUT_MS })
        .should("be.visible");

      // A mid-edit save is how the buffer fills with failures of code the
      // preview has already dropped. The rebuild re-ran the app from scratch
      // and nothing re-reported the probe error, so the default read is about
      // the bundle that is actually running.
      readDiagnosticsUntil(
        DIAGNOSTICS_URL,
        "the previous build's entries withheld",
        (report) =>
          report.staleEntries > 0 &&
          report.entries.every(
            (entry) => entry.summary !== "dev-app probe error",
          ),
      );

      // Withheld, not dropped: a reader comparing what a change fixed asks for
      // them and gets them back.
      cy.request(`${DIAGNOSTICS_URL}?includeStale=true`)
        .its("body.entries")
        .then((entries: { summary: string }[]) => {
          expect(entries.map((entry) => entry.summary)).to.include(
            "dev-app probe error",
          );
        });
    });
  });
});
