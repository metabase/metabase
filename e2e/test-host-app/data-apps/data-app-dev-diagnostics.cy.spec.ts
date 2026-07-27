import {
  DATA_APP_DEV_DIAGNOSTICS_PATH,
  devToolbarPanel,
  devToolbarTab,
  openDevToolbar,
  readDiagnosticsUntil,
} from "e2e/support/helpers/e2e-data-app-dev-helpers";
import {
  DATA_APP_DEV_APP_SRC_PATH,
  DATA_APP_DEV_MANIFEST_PATH,
  setUpDataAppDevServer,
  tearDownDataAppDevServer,
  visitDataAppDevApp,
} from "e2e/support/helpers/e2e-data-app-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";

const TIMEOUT_MS = 40000;

const CLIENT_PORT = Cypress.expose("CLIENT_PORT");
const CLIENT_HOST = `http://localhost:${CLIENT_PORT}`;

const DIAGNOSTICS_URL = `${CLIENT_HOST}${DATA_APP_DEV_DIAGNOSTICS_PATH}`;

describe("Embedding SDK: data-app dev diagnostics", () => {
  before(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    setUpDataAppDevServer(CLIENT_HOST);
  });

  after(() => {
    tearDownDataAppDevServer();
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
      readDiagnosticsUntil(
        DIAGNOSTICS_URL,
        "a blocked-network entry and a healthy connection",
        (report) =>
          report.entries.some((entry) => entry.kind === "blocked-network") &&
          report.connection?.reachable === true,
      ).then((report) => {
        expect(report.manifest?.errors).to.have.length(0);
        expect(report.clients).to.be.gte(1);

        // A reader that has consumed everything sees an empty page, not a replay.
        cy.request(`${DIAGNOSTICS_URL}?startEventId=${report.nextEventId}`)
          .its("body.entries")
          .should("be.empty");
      });
    });

    it("keeps the buffer across a page reload, with continuous event ids", () => {
      readDiagnosticsUntil(
        DIAGNOSTICS_URL,
        "the first page session's blocked entry",
        (report) =>
          report.entries.some((entry) => entry.kind === "blocked-network"),
      ).then((before) => {
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
          "the reloaded page's events appended after the first session's",
          (report) => report.entries.length > before.entries.length,
        ).then((after) => {
          const beforeIds = before.entries.map((entry) => entry.eventId);
          const afterIds = after.entries.map((entry) => entry.eventId);

          expect(afterIds.slice(0, beforeIds.length)).to.deep.equal(beforeIds);
          afterIds.forEach((id, index) => {
            if (index > 0) {
              expect(id).to.be.greaterThan(afterIds[index - 1]);
            }
          });
        });
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

      // `allowed_hosts` is the manifest's last key, so appending stays valid YAML.
      cy.writeFile(
        DATA_APP_DEV_MANIFEST_PATH,
        `${originalManifest}  - https://added.example\n`,
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
  });
});
