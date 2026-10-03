/**
 * Playwright port of e2e/test/scenarios/admin/databases.cy.spec.js
 *
 * The admin database surface: adding databases (postgres/mongo/mysql/BigQuery),
 * the connection-help side panel, error/exception handling on the database
 * pages, the sample-database lifecycle (sync/rescan/discard/remove/restore),
 * and the "Add a database" browse card's snowplow event.
 *
 * COLLISION CHECKS (done before writing):
 * - Source dir `e2e/test/scenarios/admin/` also holds a `databases/` DIRECTORY
 *   (containing `database-writable-connection.cy.spec.ts`) and
 *   `database-connection-strings.cy.spec.ts`. Neither shares a basename with
 *   `databases.cy.spec.js`; there is no `databases.cy.spec.ts` sibling. This is
 *   a port of the top-level `.js` file only.
 * - `e2e/test-component/` contains no database specs.
 * - `tests/` had no `admin-databases.spec.ts`. The neighbouring landed ports
 *   (`database-routing-admin`, `database-details-permissions`,
 *   `reference-databases`, `admin-datamodel`) are ports of different sources.
 * - Support module is `support/admin-databases.ts` — the name the brief asked
 *   for, no deviation.
 *
 * INFRA TIER (verified per-describe, not from tags):
 * - `external databases > enable actions` (@external @actions) restores the
 *   `mysql-writable` / `postgres-writable` snapshots and reads WRITABLE_DB_ID.
 *   Both snapshots exist in e2e/snapshots, and the writable DBs live INSIDE the
 *   running `postgres-sample` / `mysql-sample` containers (:5404 / :3304), so
 *   these DO execute under PW_QA_DB_ENABLED.
 * - `admin > database > add > external databases` really does create live
 *   connections to the QA postgres (:5404), mongo (:27004) and mysql (:3304)
 *   containers — genuinely container-tier, gated on PW_QA_DB_ENABLED.
 * - `Google service account JSON upload` is nested under the `add` describe but
 *   is NOT tagged @external and mocks `POST /api/database` end to end — it
 *   needs NO container and runs on the bare jar. (Tags mislead here in the
 *   "tagged-parent, untagged-child" direction: it inherits the parent
 *   beforeEach, not the @external tag.)
 * - `database page > side panel`, `exceptions`, `sample database` and
 *   `add database card` need no container. The side-panel docs come from a
 *   build-time `import("docs/databases/connections/<x>.md")` chunk
 *   (useEngineDocMarkdownContent.tsx), NOT a network fetch.
 * - `database page > side panel` calls `H.activateToken("pro-self-hosted")` →
 *   token-gated. Probed rather than assumed (see findings).
 *
 * PORT NOTES:
 * - `cy.intercept(...).as(x)` → `page.waitForResponse` registered before the
 *   trigger (PORTING rule 2). The `@getDatabase` alias (GET /api/database/:id)
 *   registered in the `add` beforeEach is NEVER awaited — dropped.
 * - Three aliases are awaited LONG after their intercept is registered, so a
 *   `waitForResponse` at the trigger point can never match. They are ported as
 *   `ResponseRecorder` (support/admin-databases.ts) registered exactly where
 *   Cypress registers the intercept, with `next()` consuming an index — the
 *   same queue semantics `cy.wait` has. MEASURED failures without it:
 *   `@getDatabases` (waitForDbSync calls it in a loop), `@usage_info`
 *   (RTK-Query cached; its only request fires at page mount because
 *   DeleteDatabaseModal is rendered eagerly with an `opened` prop) and the
 *   second `@loadDatabases` after `goToMainApp()` (satisfied by the refetch the
 *   DELETE already triggered).
 * - `findByText`/`findByLabelText`/`findByRole(name)` with STRING args →
 *   `{ exact: true }` (PORTING rule 1); regex args pass through. `cy.contains`
 *   → case-sensitive substring regex + `.first()`.
 * - A bare `cy.findByText(x)` with no `.should()` is an EXISTENCE assertion
 *   (testing-library throws when absent), so it is ported as `toBeAttached()`,
 *   not `toBeVisible()`.
 * - `cy.findAllByTestId(x).should("contain.text", y)` on a MULTI-element
 *   subject is a chai-jquery CONCATENATION, not an any-of and not a first-match
 *   (PORTING) — ported via `expectConcatenatedTextToContain`. Same for
 *   `cy.get("nav").should("contain", …)`.
 * - Mantine Switch toggles: click the labelled input with `{ force: true }`
 *   (PORTING rule 4). Mantine puts `data-checked` on the input itself
 *   (@mantine/core Switch.cjs:137), so upstream's
 *   `should("have.attr","data-checked","true")` on the findByLabelText result
 *   ports directly.
 * - Mantine `Select` rows are picked by `role="option"` and filtered by an
 *   escaped substring regex, never by exact accessible name (`renderOption`
 *   injects the engine logo — PORTING).
 * - `H.resetSnowplow()`/`H.enableTracking()` → `installSnowplowCapture`
 *   (support/search-snowplow.ts). The event IS the subject of the last
 *   describe, so rule 6's no-op stub would have made it vacuous.
 * - `Cypress.expose("IS_ENTERPRISE")` → `!(await isOssBackend(mb.api))`. The
 *   spike backend is an EE jar, so the enterprise branches execute.
 */
import { isOssBackend } from "../support/admin";
import {
  ResponseRecorder,
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
  SAMPLE_DB_ID,
  writableDbName,
  WRITABLE_DB_ID,
  button,
  chooseDatabase,
  editDatabase,
  expectConcatenatedTextToContain,
  fieldInfoIcon,
  labeled,
  pathnameIs,
  pathnameMatches,
  patchJsonResponse,
  selectFieldOption,
  toggleFieldWithDisplayName,
  typeAndBlurUsingLabel,
  visitDatabase,
  waitForDbSync,
} from "../support/admin-databases";
import { resolveToken } from "../support/api";
import { tooltip } from "../support/charts";
import { createQuestion } from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { findByDisplayValue, goToMainApp } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { ORDERS_QUESTION_ID, SAMPLE_DATABASE } from "../support/sample-data";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { modal, popover } from "../support/ui";
import type { Page } from "@playwright/test";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const QA_DB_SKIP =
  "@external — requires the QA postgres/mysql/mongo containers (set PW_QA_DB_ENABLED)";

function waitForResponse(
  page: Page,
  method: string,
  matcher: (url: URL) => boolean,
) {
  return page.waitForResponse(
    (r) => r.request().method() === method && matcher(new URL(r.url())),
  );
}

/** `cy.url().should("match", /\/admin\/databases\/\d/)` — Cypress retries
 * location assertions, so this must be `expect.poll` (PORTING). */
async function expectDatabaseDetailUrl(page: Page) {
  await expect.poll(() => page.url()).toMatch(/\/admin\/databases\/\d/);
}

async function expectPathname(page: Page, pathname: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

// ============================================================================

test.describe("admin > database > external databases > enable actions", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

  for (const dialect of ["mysql", "postgres"] as const) {
    test(`should show ${dialect} writable_db with actions enabled`, async ({
      page,
      mb,
    }) => {
      await mb.restore(`${dialect}-writable`);
      await mb.signInAsAdmin();

      const body = await visitDatabase(page, WRITABLE_DB_ID);
      expect(String(body.name)).toContain("Writable");
      expect(String(body.name).toLowerCase()).toContain(dialect);
      expect(body.details.dbname).toBe(writableDbName());
      expect(body.settings["database-enable-actions"]).toBe(true);

      await expect(labeled(page, "Model actions")).toBeChecked();
    });
  }
});

test.describe("admin > database > add", () => {
  let dbList: ResponseRecorder;

  test.beforeEach(async ({ page, mb }) => {
    // Attach the @getDatabases recorder before anything navigates.
    dbList = new ResponseRecorder(page, "GET", pathnameIs("/api/database"));

    await mb.restore();
    await mb.signInAsAdmin();

    // @createDatabase / @getDatabases are registered at their trigger points;
    // @getDatabase (GET /api/database/:id) is never awaited upstream — dropped.

    await page.goto("/admin/databases/create");
    // should display a setup help card
    await expect(
      page.getByText("Need help connecting?", { exact: true }),
    ).toBeAttached();

    await labeled(page, "Database type").click();
  });

  test.describe("external databases", () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

    test.describe("postgres", () => {
      test.beforeEach(async ({ page, mb }) => {
        if (!(await isOssBackend(mb.api))) {
          // EE should ship with Oracle and Vertica as options
          await expect(
            popover(page).getByText("Oracle", { exact: true }),
          ).toBeAttached();
          await expect(
            popover(page).getByText("Vertica", { exact: true }),
          ).toBeAttached();
        }

        await popover(page)
          .getByRole("option")
          .filter({ hasText: /PostgreSQL/ })
          .first()
          .click();

        const form = page.getByTestId("database-form");

        await form.getByText("Show advanced options", { exact: true }).click();
        await expect(
          labeled(form, /Rerun queries for simple explorations/),
        ).toHaveAttribute("data-checked", "true");
        // Reproduces (metabase#14334)
        await expect(
          form.getByText("Additional JDBC connection string options", {
            exact: true,
          }),
        ).toBeAttached();
        // Reproduces (metabase#17450)
        const scheduling = labeled(form, /Choose when syncs and scans happen/);
        await scheduling.click({ force: true });
        await expect(scheduling).toHaveAttribute("data-checked", "true");

        await expect(
          await findByDisplayValue(
            form,
            "Never, I'll do this manually if I need to",
          ),
        ).toBeAttached();

        // make sure tooltips behave as expected.
        // Upstream uses `.trigger("mouseenter")` (a synthetic dispatch);
        // Mantine's Tooltip listens through React's synthetic onMouseEnter,
        // which a dispatched `mouseenter` does not reach, so this is a real
        // hover. Recorded as a deliberate deviation.
        await fieldInfoIcon(form, "Host").hover();

        await expect(
          tooltip(page).getByText(/your database's ip address/i),
        ).toBeVisible();

        await expect(fieldInfoIcon(form, "Port")).toHaveCount(0);

        // make sure fields needed to connect to the database are properly
        // trimmed (metabase#12972)
        await typeAndBlurUsingLabel(form, /Display name/, "QA Postgres12");
        await typeAndBlurUsingLabel(form, /Host/, "localhost");
        await typeAndBlurUsingLabel(form, /Port/, String(QA_POSTGRES_PORT));
        await typeAndBlurUsingLabel(form, /Database name/, "sample");
        await typeAndBlurUsingLabel(form, /Username/, "metabase");
        await typeAndBlurUsingLabel(form, /Password/, "metasample123");

        const confirmSSLFields = async (
          visible: string[],
          hidden: string[],
        ) => {
          for (const field of visible) {
            await expect(page.getByText(new RegExp(field))).toBeAttached();
          }
          for (const field of hidden) {
            await expect(page.getByText(new RegExp(field))).toHaveCount(0);
          }
        };

        const ssl = "Use a secure connection \\(SSL\\)",
          sslMode = "SSL Mode",
          useClientCert = "Authenticate client certificate\\?",
          clientPemCert = "SSL Client Certificate \\(PEM\\)",
          clientPkcsCert = "SSL Client Key \\(PKCS-8/DER\\)",
          sslRootCert = "SSL Root Certificate \\(PEM\\)";

        // initially, all SSL sub-properties should be hidden
        await confirmSSLFields(
          [ssl],
          [sslMode, useClientCert, clientPemCert, clientPkcsCert, sslRootCert],
        );

        await toggleFieldWithDisplayName(page, ssl);
        // when ssl is enabled, the mode and "enable client cert" options
        // should be shown
        await confirmSSLFields(
          [ssl, sslMode, useClientCert],
          [clientPemCert, clientPkcsCert, sslRootCert],
        );

        await toggleFieldWithDisplayName(page, useClientCert);
        // when the "enable client cert" option is enabled, its sub-properties
        // should be shown
        await confirmSSLFields(
          [ssl, sslMode, useClientCert, clientPemCert, clientPkcsCert],
          [sslRootCert],
        );

        await selectFieldOption(page, "SSL Mode", "verify-ca");
        // when the ssl mode is set to "verify-ca", then the root cert option
        // should be shown
        await confirmSSLFields(
          [
            ssl,
            sslMode,
            useClientCert,
            clientPemCert,
            clientPkcsCert,
            sslRootCert,
          ],
          [],
        );
        await toggleFieldWithDisplayName(page, ssl);

        const save = button(page, "Save");
        await expect(save).toBeEnabled();
        const createDatabase = waitForResponse(
          page,
          "POST",
          pathnameIs("/api/database"),
        );
        await save.click();

        const created = await createDatabase;
        const requestBody = created.request().postDataJSON();
        expect(requestBody.details.host).toBe("localhost");
        expect(requestBody.details.dbname).toBe("sample");
        expect(requestBody.details.user).toBe("metabase");

        await expectDatabaseDetailUrl(page);

        await waitForDbSync(dbList);
      });

      test("should add Postgres database and redirect to db info page (metabase#12972, metabase#14334, metabase#17450)", async ({
        page,
      }) => {
        await expect(
          page.getByRole("status").getByText("Done!", { exact: true }),
        ).toBeAttached();

        await expect(
          page.getByRole("link", { name: "Manage permissions", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: /Browse data/ }),
        ).toBeVisible();

        await expect(page.getByTestId("database-header-section")).toContainText(
          "QA Postgres12",
        );

        await expectConcatenatedTextToContain(
          page.getByTestId("database-connection-info-section"),
          "Connected",
        );

        await editDatabase(page);

        await expect(
          labeled(page, /Choose when syncs and scans happen/),
        ).toHaveAttribute("data-checked", "true");

        await expect(
          await findByDisplayValue(
            page.getByTestId("database-form"),
            "Never, I'll do this manually if I need to",
          ),
        ).toBeAttached();
      });
    });

    test("should add Mongo database and redirect to db info page", async ({
      page,
    }) => {
      await popover(page)
        .getByRole("option")
        .filter({ hasText: /MongoDB/ })
        .first()
        .click();

      await typeAndBlurUsingLabel(page, "Display name", "QA Mongo");
      await typeAndBlurUsingLabel(page, "Host", "localhost");
      await typeAndBlurUsingLabel(page, "Port", String(QA_MONGO_PORT));
      await typeAndBlurUsingLabel(page, "Database name", "sample");
      await typeAndBlurUsingLabel(page, "Username", "metabase");
      await typeAndBlurUsingLabel(page, "Password", "metasample123");
      await typeAndBlurUsingLabel(
        page,
        "Authentication database (optional)",
        "admin",
      );

      await page
        .getByRole("button", { name: /Show advanced options/ })
        .click();
      await expect(
        labeled(page, "Additional connection string options (optional)"),
      ).toBeVisible();

      const save = page.getByRole("button", { name: /Save/ });
      await expect(save).toBeEnabled();
      const createDatabase = waitForResponse(
        page,
        "POST",
        pathnameIs("/api/database"),
      );
      await save.click();
      await createDatabase;

      await expectDatabaseDetailUrl(page);

      await expect(page.getByTestId("database-header-section")).toContainText(
        "QA Mongo",
      );

      const status = page.getByRole("status");
      await expect(status.getByText("Syncing…", { exact: true })).toBeAttached();
      await expect(status.getByText("Done!", { exact: true })).toBeAttached();

      await expect(
        page.getByRole("link", { name: "Manage permissions", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Browse data/ }),
      ).toBeVisible();
    });

    test("should add Mongo database via the connection string", async ({
      page,
    }) => {
      const badDBString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}`;
      const badPasswordString = `mongodb://metabase:wrongPassword@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;
      const validConnectionString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;

      // `H.popover().findByText("MongoDB").click({ force: true })` — Cypress's
      // force DISPATCHES at the text node's element; the Mantine option row
      // above it handles the click, so the event bubbles there (PORTING).
      await popover(page)
        .getByText("MongoDB", { exact: true })
        .dispatchEvent("click");

      const form = page.getByTestId("database-form");

      await labeled(form, "Use a connection string").click({ force: true });
      await typeAndBlurUsingLabel(form, "Display name", "QA Mongo");
      await expect(labeled(form, "Port")).toHaveCount(0);

      const connectionString = labeled(form, "Paste your connection string");
      await connectionString.click();
      await connectionString.fill(badDBString);

      const save = button(form, "Save");
      await expect(save).toBeEnabled();
      await save.click();
      await expect(
        form.getByText(/No database name specified/),
      ).toBeAttached();
      await expect(button(form, "Failed")).toBeAttached();

      await connectionString.fill(badPasswordString);

      await expect(save).toBeEnabled({ timeout: 7000 });
      await save.click();
      await expect(form.getByText(/Authentication failed/)).toBeAttached();
      await expect(button(form, "Failed")).toBeAttached();

      await connectionString.fill(validConnectionString);

      await expect(save).toBeEnabled({ timeout: 7000 });
      const createDatabase = waitForResponse(
        page,
        "POST",
        pathnameIs("/api/database"),
      );
      await save.click();
      await createDatabase;

      await expectDatabaseDetailUrl(page);

      await expect(page.getByTestId("database-header-section")).toContainText(
        "QA Mongo",
      );

      const status = page.getByRole("status");
      await expect(status.getByText("Syncing…", { exact: true })).toBeAttached();
      await expect(status.getByText("Done!", { exact: true })).toBeAttached();

      await expect(
        page.getByRole("link", { name: "Manage permissions", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Browse data/ }),
      ).toBeVisible();
    });

    test("should add MySQL database and redirect to db info page", async ({
      page,
    }) => {
      // `cy.contains("MySQL")` — case-sensitive substring, first DOM hit.
      await page.getByText(/MySQL/).first().dispatchEvent("click");
      await page.getByText("Show advanced options", { exact: true }).click();
      await expect(
        page.getByText(/Additional JDBC connection string options/).first(),
      ).toBeAttached();

      await typeAndBlurUsingLabel(page, "Display name", "QA MySQL8");
      await typeAndBlurUsingLabel(page, "Host", "localhost");
      await typeAndBlurUsingLabel(page, "Port", String(QA_MYSQL_PORT));
      await typeAndBlurUsingLabel(page, "Database name", "sample");
      await typeAndBlurUsingLabel(page, "Username", "metabase");
      await typeAndBlurUsingLabel(page, "Password", "metasample123");

      // Bypass the RSA public key error for MySQL database
      // https://github.com/metabase/metabase/issues/12545
      await typeAndBlurUsingLabel(
        page,
        "Additional JDBC connection string options",
        "allowPublicKeyRetrieval=true",
      );

      const save = page.getByText("Save", { exact: true });
      await expect(save).toBeEnabled();
      const createDatabase = waitForResponse(
        page,
        "POST",
        pathnameIs("/api/database"),
      );
      await save.click();
      await createDatabase;

      await expectDatabaseDetailUrl(page);

      await expect(page.getByTestId("database-header-section")).toContainText(
        "QA MySQL8",
      );

      const status = page.getByRole("status");
      await expect(status.getByText("Syncing…", { exact: true })).toBeVisible();
      await expect(status.getByText("Syncing…", { exact: true })).toHaveCount(0);
      await expect(status.getByText("Done!", { exact: true })).toBeVisible();

      await expect(
        page.getByRole("link", { name: "Manage permissions", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Browse data/ }),
      ).toBeVisible();
    });
  });

  test.describe("Google service account JSON upload", () => {
    const serviceAccountJSON = '{"foo": 123}';

    test("should work for BigQuery", async ({ page }) => {
      await page.goto("/admin/databases/create");

      await chooseDatabase(page, "BigQuery");
      await typeAndBlurUsingLabel(page, "Display name", "BQ");
      await selectFieldOption(page, "Datasets", "Only these...");
      const datasets = page.getByPlaceholder("E.x. public,auth*");
      await datasets.click();
      await datasets.fill("some-dataset");

      // mockUploadServiceAccountJSON: Cypress builds a File, assigns it to
      // input.files and fires change + blur. setInputFiles does the assignment
      // and the change dispatch; the blur is kept explicitly.
      const fileInput = page.locator("input[type=file]");
      await fileInput.setInputFiles({
        name: "service-account.json",
        mimeType: "application/json",
        buffer: Buffer.from(serviceAccountJSON),
      });
      await fileInput.dispatchEvent("blur");

      // mockSuccessfulDatabaseSave
      let createBody: any;
      await page.route(pathnameIs("/api/database"), async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        createBody = route.request().postDataJSON();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: 42 }),
        });
      });

      const createDatabase = waitForResponse(
        page,
        "POST",
        pathnameIs("/api/database"),
      );
      await button(page, "Save").click();
      await createDatabase;

      expect(createBody.details["service-account-json"]).toBe(
        serviceAccountJSON,
      );
    });
  });
});

test.describe("database page > side panel", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires a pro-self-hosted token (H.activateToken in the beforeEach)",
  );

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await page.goto("/admin/databases/create");
  });

  test("should show side panel with help content when 'Help is here' is clicked", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Help is here/ }).click();
    const panel = page.getByTestId("database-help-side-panel");
    await expect(panel.getByText("Add PostgreSQL", { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /Read the full docs/ }),
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: /Talk to an expert/ }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Invite a teammate to help you/ }),
    ).toBeVisible();
  });

  test("should update the side panel content when the engine is changed", async ({
    page,
  }) => {
    const enginesMap = [
      { name: "Amazon Athena", file: "athena" },
      { name: "BigQuery", file: "bigquery" },
      { name: "Amazon Redshift", file: "redshift" },
      { name: "ClickHouse", file: "clickhouse" },
      { name: "Databricks", file: "databricks" },
      { name: "Druid JDBC", file: "druid" },
      { name: "MongoDB", file: "mongo" },
      { name: "MySQL", file: "mysql" },
      { name: "PostgreSQL", file: "postgresql" },
      { name: "Presto", file: "presto" },
      { name: "SQL Server", file: "sql-server" },
      { name: "Snowflake", file: "snowflake" },
      { name: "Spark SQL", file: "sparksql" },
      { name: "Starburst (Trino)", file: "starburst" },
    ];

    for (const engineSpec of enginesMap) {
      await labeled(page.getByTestId("database-form"), "Database type").click();
      await popover(page)
        .getByRole("option")
        .filter({ hasText: engineSpec.name })
        .first()
        .click();
      await page.getByRole("button", { name: /Help is here/ }).click();

      const panel = page.getByTestId("database-help-side-panel");
      await expect(
        panel.getByText("Add " + engineSpec.name, { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("link", { name: /Read the full docs/ }),
      ).toHaveAttribute("href", new RegExp(engineSpec.file));

      // Check we don't have an error when loading the doc contents
      await expect(panel.getByRole("alert")).toHaveCount(0);
      await expect(
        panel.getByText(/Failed to load detailed documentation/),
      ).toHaveCount(0);

      await page.getByRole("button", { name: /Close panel/ }).click();
      await expect(
        page.getByTestId("database-help-side-panel"),
      ).toHaveCount(0);
    }
  });
});

test.describe("scenarios > admin > databases > exceptions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should handle malformed (null) database details (metabase#25715)", async ({
    page,
  }) => {
    await patchJsonResponse(
      page,
      pathnameIs(`/api/database/${SAMPLE_DB_ID}`),
      (body) => {
        body.details = null;
      },
    );

    const loadDatabase = waitForResponse(
      page,
      "GET",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}`),
    );
    await page.goto("/admin/databases/1");
    await loadDatabase;

    // It is unclear how this issue will be handled,
    // but at the very least it shouldn't render the blank page.
    await expectConcatenatedTextToContain(page.locator("nav"), "Metabase Admin");
    // The response still contains the database name,
    // so there's no reason we can't display it.
    await expect(page.getByText(/Sample Database/i).first()).toBeAttached();
    // This seems like a reasonable CTA if the database is beyond repair.
    await expect(button(page, "Remove this database")).toBeEnabled();
  });

  test("should handle is_attached_dwh databases", async ({ page }) => {
    await patchJsonResponse(
      page,
      pathnameIs(`/api/database/${SAMPLE_DB_ID}`),
      (body) => {
        body.details = null;
        body.is_attached_dwh = true;
      },
    );

    const loadDatabase = waitForResponse(
      page,
      "GET",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}`),
    );
    await page.goto("/admin/databases/1");
    await loadDatabase;

    await expect(page.getByTestId("main-logo")).toBeAttached();
    await expect(
      page.getByTestId("breadcrumbs").getByText("Sample Database", {
        exact: true,
      }),
    ).toBeAttached();

    const editButton = page
      .getByTestId("database-connection-info-section")
      .getByRole("button", { name: "Edit connection details", exact: true });
    await expect(editButton).toBeDisabled();
    await expect(editButton).toBeDisabled();
    // `trigger("mouseenter", { force: true })` on a DISABLED button: a real
    // hover is refused / swallowed by the disabled control (PORTING), so this
    // is a forced hover.
    await editButton.hover({ force: true });

    await expect(
      tooltip(page).getByText("The sample database cannot be edited.", {
        exact: true,
      }),
    ).toBeAttached();
    await expect(page.getByTestId("database-actions-panel")).toHaveCount(0);
  });

  test("should show error upon a bad request", async ({ page }) => {
    await page.route(pathnameIs("/api/database"), async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "text/plain",
        body: "DATABASE CONNECTION ERROR",
      });
    });

    await page.goto("/admin/databases/create");

    await typeAndBlurUsingLabel(page, "Display name", "Test");
    await typeAndBlurUsingLabel(page, "Database name", "db");
    await typeAndBlurUsingLabel(page, "Username", "admin");

    const createDatabase = waitForResponse(
      page,
      "POST",
      pathnameIs("/api/database"),
    );
    await button(page, "Save").click();
    await createDatabase;

    await expect(
      page
        .getByTestId("database-form")
        .locator("..")
        .getByText("DATABASE CONNECTION ERROR", { exact: true }),
    ).toBeVisible();
  });

  test("should show specific error message when error is on host or port", async ({
    page,
  }) => {
    await page.route(pathnameIs("/api/database"), async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message: "DATABASE CONNECTION ERROR",
          errors: {
            host: "Check your host",
            port: "Check your port",
          },
        }),
      });
    });

    await page.goto("/admin/databases/create");

    await typeAndBlurUsingLabel(page, "Display name", "Test");
    await typeAndBlurUsingLabel(page, "Database name", "db");
    await typeAndBlurUsingLabel(page, "Username", "admin");

    const createDatabase = waitForResponse(
      page,
      "POST",
      pathnameIs("/api/database"),
    );
    await button(page, "Save").click();
    await createDatabase;

    const formParent = page.getByTestId("database-form").locator("..");
    await expect(
      formParent.getByText("DATABASE CONNECTION ERROR", { exact: true }),
    ).toHaveCount(0);
    await expect(
      formParent.getByText(/Make sure your Host and Port settings are correct/),
    ).toBeVisible();
  });

  test("should handle non-existing databases (metabase#11037)", async ({
    page,
  }) => {
    const loadDatabase = waitForResponse(
      page,
      "GET",
      pathnameIs("/api/database/999"),
    );
    await page.goto("/admin/databases/999");
    const response = await loadDatabase;
    expect(response.status()).toBe(404);

    await expect(page.getByText("Not found.", { exact: true })).toBeAttached();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("should handle a failure to `GET` the list of all databases (metabase#20471)", async ({
    page,
    mb,
  }) => {
    const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

    const isEnterprise = !(await isOssBackend(mb.api));
    if (isEnterprise) {
      await mb.api.activateToken("pro-self-hosted");
    }

    // Ported LITERALLY (PORTING): the EE branch's intercept requires
    // `exclude_uneditable_details=true` to be present, so an unfiltered
    // GET /api/database is left to reach the real backend.
    await page.route(
      (url) =>
        url.pathname === "/api/database" &&
        (!isEnterprise ||
          url.searchParams.get("exclude_uneditable_details") === "true"),
      async (route) => {
        if (route.request().method() !== "GET") {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: errorMessage }),
        });
      },
    );

    const failedGet = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        new URL(r.url()).pathname === "/api/database" &&
        r.status() === 500,
    );
    await page.goto("/admin/databases");
    await failedGet;

    await expect(page.getByText(/Something.s gone wrong/)).toBeAttached();
    await expect(
      page.getByText(
        /We.ve run into an error\. You can try refreshing the page, or just go back\./,
      ),
    ).toBeAttached();

    await expect(
      page.getByText(errorMessage, { exact: true }),
    ).not.toBeVisible();
    await page.getByText("Show error details", { exact: true }).click();
    await expect(page.getByText(errorMessage, { exact: true })).toBeVisible();
  });
});

test.describe("scenarios > admin > databases > sample database", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("database actions", async ({ page, mb }) => {
    // The five `cy.intercept(...).as(...)` calls at the top of the upstream
    // test, ported as recorders registered at the SAME point (see
    // ResponseRecorder). `@usage_info` in particular fires once, when the page
    // mounts — `DeleteDatabaseModal` runs useGetDatabaseUsageInfoQuery eagerly
    // via its `opened` prop — so a waitForResponse registered at the
    // "Remove this database" click can never match, and hangs.
    const syncSchema = new ResponseRecorder(
      page,
      "POST",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}/sync_schema`),
    );
    const rescanValues = new ResponseRecorder(
      page,
      "POST",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}/rescan_values`),
    );
    const discardValues = new ResponseRecorder(
      page,
      "POST",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}/discard_values`),
    );
    const usageInfo = new ResponseRecorder(
      page,
      "GET",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}/usage_info`),
    );
    const deleteRequest = new ResponseRecorder(
      page,
      "DELETE",
      pathnameIs(`/api/database/${SAMPLE_DB_ID}`),
    );

    // model
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    // Create a segment through API
    await createSegment(mb.api, {
      name: "Small orders",
      description: "All orders with a total under $100.",
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
      },
    });

    // metric
    await createQuestion(mb.api, {
      name: "Revenue",
      description: "Sum of orders subtotal",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
      },
    });

    await visitDatabase(page, SAMPLE_DB_ID);

    // lets you trigger the manual database schema sync
    await button(page, "Sync database schema").click();
    await syncSchema.next();
    await expect(
      page.getByText("Sync triggered!", { exact: true }),
    ).toBeAttached();

    // lets you trigger the manual rescan of field values
    await page.getByText("Re-scan field values", { exact: true }).click();
    await rescanValues.next();
    await expect(
      page.getByText("Scan triggered!", { exact: true }),
    ).toBeAttached();

    // lets you discard saved field values
    const danger = page.getByTestId("database-danger-zone-section");
    await button(danger, "Discard saved field values").click();

    const discardModal = modal(page);
    await expect(discardModal.getByRole("heading")).toHaveText(
      "Discard saved field values",
    );
    await expect(
      discardModal.getByText("Are you sure you want to do this?", {
        exact: true,
      }),
    ).toBeAttached();
    await button(discardModal, "Yes").click();
    await discardValues.next();

    // lets you remove the Sample Database
    await button(danger, "Remove this database").click();
    await usageInfo.next();

    const deleteModal = modal(page);
    const deleteButton = button(deleteModal, "Delete this DB connection");
    await expect(deleteButton).toBeDisabled();

    for (const label of [
      /Delete [0-9]* saved questions?/,
      /Delete [0-9]* models?/,
      /Delete [0-9]* metrics?/,
      /Delete [0-9]* segments?/,
    ]) {
      const checkbox = labeled(deleteModal, label);
      await expect(checkbox).not.toBeChecked();
      await checkbox.click({ force: true });
      await expect(checkbox).toBeChecked();
    }

    await expect(
      deleteModal.getByText(
        "This will delete every saved question, model, metric, and segment you’ve made that uses this data, and can’t be undone. Transforms that use this database won’t be deleted, but they will stop working.",
        { exact: true },
      ),
    ).toBeAttached();

    await expect(deleteButton).toBeDisabled();

    const confirmation = deleteModal.getByPlaceholder(
      "Are you completely sure?",
    );
    await confirmation.click();
    await confirmation.fill("Sample Database");
    await confirmation.blur();

    // `cy.intercept("GET", "/api/database").as("fetchDatabases")` is registered
    // HERE upstream, immediately before the click, so a plain waitForResponse
    // is the faithful shape for this one.
    const fetchDatabases = waitForResponse(
      page,
      "GET",
      pathnameIs("/api/database"),
    );
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();
    await Promise.all([deleteRequest.next(), fetchDatabases]);

    await expectPathname(page, "/admin/databases/"); // FIXME why the trailing slash?

    const restoreSample = waitForResponse(
      page,
      "POST",
      pathnameIs("/api/database/sample_database"),
    );
    await page
      .getByText(/Bring the sample database back/)
      .first()
      .click({ timeout: 10_000 });
    await restoreSample;

    // `cy.findAllByRole("cell").contains("Sample Database")` yields the DEEPEST
    // element containing the text inside the cell set — the link, not the cell
    // itself. Filtering the cells and clicking the cell lands on its padding
    // and does not navigate (measured: still on /admin/databases/).
    await page
      .getByRole("cell")
      .getByText(/Sample Database/)
      .first()
      .click();
    const newSampleDatabaseId = SAMPLE_DB_ID + 1;
    await expectPathname(page, `/admin/databases/${newSampleDatabaseId}`);
  });

  test("updates databases list in Browse databases after bringing sample database back", async ({
    page,
  }) => {
    // The five upstream intercepts, registered where upstream registers them.
    const loadDatabases = new ResponseRecorder(
      page,
      "GET",
      pathnameIs("/api/database"),
    );
    const restoreSampleDatabase = new ResponseRecorder(
      page,
      "POST",
      pathnameIs("/api/database/sample_database"),
    );
    const loadDatabaseUsageInfo = new ResponseRecorder(
      page,
      "GET",
      pathnameMatches(/^\/api\/database\/\d+\/usage_info$/),
    );
    const loadDatabase = new ResponseRecorder(
      page,
      "GET",
      pathnameMatches(/^\/api\/database\/\d+$/),
    );
    const deleteDatabase = new ResponseRecorder(
      page,
      "DELETE",
      pathnameMatches(/^\/api\/database\/\d+$/),
    );

    await page.goto("/admin/databases");
    await loadDatabases.next();

    await page
      .getByTestId("database-list")
      .getByText("Sample Database", { exact: true })
      .click();
    await loadDatabase.next();

    await button(page, "Remove this database").click();
    await loadDatabaseUsageInfo.next();

    const deleteModal = modal(page);
    await labeled(deleteModal, /Delete \d+ saved questions?/).click({
      force: true,
    });
    await labeled(deleteModal, /Delete \d+ model?/).click({ force: true });
    await deleteModal
      .getByTestId("database-name-confirmation-input")
      .fill("Sample Database");
    await deleteModal
      .getByText("Delete this DB connection", { exact: true })
      .click();
    await deleteDatabase.next();

    await expect(
      page
        .getByTestId("database-list")
        .getByText("Sample Database", { exact: true }),
    ).toHaveCount(0);

    await goToMainApp(page);
    await loadDatabases.next();

    await expect(
      page
        .getByTestId("main-navbar-root")
        .getByLabel("Browse databases", { exact: true }),
    ).toHaveCount(0);

    await page.goto("/admin/databases");
    await page
      .getByTestId("database-list")
      .getByText("Bring the sample database back", { exact: true })
      .click();
    await restoreSampleDatabase.next();

    await expect(
      page
        .getByTestId("database-list")
        .getByText("Sample Database", { exact: true }),
    ).toBeAttached();

    await goToMainApp(page);
    await loadDatabases.next();

    const browseDatabases = page
      .getByTestId("main-navbar-root")
      .getByLabel("Browse databases", { exact: true });
    await expect(browseDatabases).toBeAttached();
    await browseDatabases.click();

    await expect(
      page
        .getByTestId("database-browser")
        .getByText("Sample Database", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("add database card", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    // H.resetSnowplow() + H.enableTracking(): the capture starts empty and
    // forces anon-tracking/snowplow on in the browser.
    await mb.restore();
    await mb.signInAsAdmin();
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  test("should track the click on the card", async ({ page }) => {
    await page.goto("/browse/databases");

    const addDatabaseCard = page
      .getByTestId("database-browser")
      .getByRole("link")
      .last();

    await addDatabaseCard.getByText("Add a database", { exact: true }).click();
    await expectPathname(page, "/admin/databases/create");
    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "database_add_clicked",
      triggered_from: "db-list",
    });
  });
});
