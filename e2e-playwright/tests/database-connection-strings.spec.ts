/**
 * Playwright port of e2e/test/scenarios/admin/database-connection-strings.cy.spec.ts
 *
 * The "Connection string (optional)" field on /admin/databases/create: JDBC/URI
 * parsing into the per-engine detail fields for 16 engines, the success/failure
 * feedback line, the Save button, non-clobbering of already-entered values,
 * three live-container connection tests, and the two snowplow tracking tests.
 *
 * COLLISION CHECKS (done before writing anything):
 * - `grep -rl "database-connection-strings" tests/ support/` matched only
 *   `tests/admin-databases.spec.ts`, `tests/database-writable-connection.spec.ts`
 *   and `support/admin-databases.ts` — in every case a *comment* in that file's
 *   own collision note naming this spec as a different source. No port of this
 *   spec existed, committed or uncommitted.
 * - Sibling ports in the same area (`admin-databases`, `database-routing-admin`,
 *   `database-details-permissions`, `database-writable-connection`,
 *   `reference-databases`) are ports of other sources and are imported
 *   READ-ONLY here; no shared support module was edited.
 * - New support module is `support/database-connection-strings.ts` — the exact
 *   name the brief asked for.
 *
 * INFRA TIER (probed, not read off tags):
 * - `Database connection strings` (the 4 non-nested tests): NO container, NO
 *   token, NO snowplow. Pure client-side regex parsing —
 *   `DatabaseConnectionStringField.tsx` -> `parse-connection-regex.ts`. Nothing
 *   is sent to the backend. Runs on the bare jar.
 * - `Database connection strings > actual database connections` (@external):
 *   genuinely container-tier. It creates real connections to the QA mysql
 *   (:3304) and QA postgres (:5404) `sample` databases, so it is gated on
 *   PW_QA_DB_ENABLED. Verified gate-OFF (skips cleanly) and gate-ON (passes).
 * - `Database connection strings events`: the `@snowplow` gate is REAL here,
 *   unlike the dead-setup case the brief warns about — both tests call
 *   `H.expectUnstructuredSnowplowEvent` with an exact count, so the events ARE
 *   the subject. Rule 6's no-op stub would have made both vacuous.
 * - NO token/EE gate anywhere in this spec: `DatabaseConnectionStringField` and
 *   `parse-connection-regex` live in `frontend/src/metabase/databases/`, not in
 *   `enterprise/frontend/`, and there is no `PLUGIN_*` indirection. Confirmed by
 *   grep; the spec never calls `activateToken`.
 *
 * SNOWPLOW VANTAGE — browser boundary (`installSnowplowCapture`), deliberately:
 * - Both events come from `trackSimpleEvent` in
 *   `frontend/src/metabase/databases/components/DatabaseConnectionUri/analytics.ts`,
 *   i.e. the FE-emitted class, which the browser-boundary capture sees. (The
 *   backend-emitted class — `analytics/snowplow.clj track-event!`, which is what
 *   database create/sync events are — would have been invisible here and would
 *   have needed `mb.snowplow`. That is NOT this spec.)
 * - The slot collector (`mb.snowplow`) would also see these, since the browser
 *   POSTs to whatever `snowplow-url` advertises. It was rejected because both
 *   tests assert an EXACT count (1, and "still 1"), and the collector
 *   accumulates for the lifetime of the worker across tests and repeat-each
 *   runs, whereas `installSnowplowCapture` is per-`page` and therefore
 *   per-test. Isolation is load-bearing for a count assertion.
 * - `installSnowplowCapture` also re-points `snowplow-url` at the app's own
 *   origin, which removes the CORS preflight that Playwright cannot intercept.
 *
 * PORT NOTES:
 * - `cy.paste(text)` -> `paste()` in support/database-connection-strings.ts: a
 *   verbatim port of the native-value-setter + `change` + ClipboardEvent
 *   sequence. NOT `fill()` (fires `input`, clears first) and NOT
 *   `pressSequentially()` (would run the parse effect once per keystroke, which
 *   breaks the exact event-count assertions).
 * - `cy.findByText(s)` is EXACT in testing-library and matches only elements
 *   whose DIRECT child text nodes equal `s` (`getNodeText`). Playwright's
 *   `getByText` reads full `textContent`, so it also matches every ancestor —
 *   here the `<Text component="span">` wrapper AND the `<Group component="span">`
 *   inside it. `:text-is()` matches only the SMALLEST such element, which is the
 *   testing-library semantics, so `exactText()` below uses it.
 * - `cy.findByTextEnsureVisible(s)` is literally `findByText(s).should("be.visible")`
 *   -> `toBeVisible()`. Where upstream chains `.should("exist")` onto it, the
 *   port keeps both (`toBeVisible` then `toBeAttached`) rather than merging.
 * - `cy.findByText(s).should("exist")` -> `toBeAttached()`, not `toBeVisible()`.
 * - `cy.intercept().as()` + `cy.wait("@alias")`: `@createDatabase` is awaited
 *   immediately after the click that causes it, but `@getDatabases` is consumed
 *   in a LOOP by `waitForDbSync`, which `page.waitForResponse` cannot do. Both
 *   are ported as `ResponseRecorder` (support/admin-databases.ts) registered
 *   exactly where Cypress registers the intercept — the same queue semantics.
 * - `cy.url().should("match", ...)` retries in Cypress -> `expect.poll`.
 *
 * ⚠️ VACUOUS UPSTREAM ASSERTIONS — kept verbatim, flagged here (see findings):
 * - `{ label: "Use a secure connection (SSL)", value: "on", isChecked: true }`
 *   drives `should("have.value", "on")` against a `<input type="checkbox">`.
 *   `"on"` is the HTML *default* `value` of a checkbox with no `value`
 *   attribute, and it does NOT change with checkedness. That assertion is very
 *   close to a tautology: it is satisfied whether the box is checked or not.
 *   The `should("be.checked")` that follows it is the assertion doing the work.
 *   Ported verbatim (both), because dropping the value check would be dropping
 *   an upstream assertion, and strengthening it would be inventing intent.
 * - No `should("be.empty")` and no argument-less `should("not.have.value")`
 *   appears anywhere in this spec — the brief flagged both as "extremely
 *   likely" in a connection-form spec, and neither reproduces here. Stated
 *   plainly rather than banked.
 *
 * 🔴 CREDENTIALS: several fixtures embed passwords in the connection-string
 * body. They are test-only literals carried over verbatim from upstream and are
 * never logged, echoed, or written to the findings file.
 */
import {
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
  ResponseRecorder,
  button,
  chooseDatabase,
  labeled,
  pathnameIs,
  waitForDbSync,
} from "../support/admin-databases";
import { paste, typeAppending } from "../support/database-connection-strings";
import { test, expect } from "../support/fixtures";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { Page } from "@playwright/test";

const QA_DB_SKIP =
  "@external — requires the QA mysql (:3304) / postgres (:5404) containers (set PW_QA_DB_ENABLED)";

const SUCCESS_TEXT = "Connection details pre-filled below.";
const FAILURE_TEXT = "Couldn’t use this connection string.";
const CONNECTION_STRING_LABEL = "Connection string (optional)";

/**
 * Port of testing-library's `findByText(string)`: an EXACT match against the
 * element's own direct text nodes. Playwright's `getByText` compares full
 * `textContent` and so also matches ancestors; `:text-is()` matches only the
 * smallest element with that exact text, which is the same element
 * testing-library resolves.
 */
function exactText(page: Page, text: string) {
  return page.locator(`:text-is(${JSON.stringify(text)})`);
}

function connectionStringField(page: Page) {
  return labeled(page, CONNECTION_STRING_LABEL);
}

type ExpectedField = { label: string; value: string; isChecked?: boolean };

const databaseTestCases: Array<{
  engine: string;
  connectionString: string;
  expectedFields: ExpectedField[];
}> = [
  {
    engine: "Athena",
    connectionString: "jdbc:athena://WorkGroup=primary;Region=us-east-1;",
    expectedFields: [
      { label: "Region", value: "us-east-1" },
      { label: "Workgroup", value: "primary" },
    ],
  },
  {
    engine: "BigQuery",
    connectionString:
      "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=MyBigQueryProject;OAuthType=1;",
    expectedFields: [
      { label: "Project ID (override)", value: "MyBigQueryProject" },
      { label: "Display name", value: "MyBigQueryProject" },
    ],
  },
  {
    engine: "ClickHouse",
    connectionString:
      "jdbc:clickhouse://localhost:8443/testdb?ssl=true&user=testuser",
    expectedFields: [
      { label: "Host", value: "localhost" },
      { label: "Port", value: "8443" },
      { label: "Databases", value: "All" },
      { label: "Display name", value: "testdb" },
      { label: "Username", value: "testuser" },
      { label: "Additional JDBC connection string options", value: "ssl=true" },
      { label: "Use a secure connection (SSL)", value: "on", isChecked: true },
    ],
  },
  {
    engine: "Druid JDBC",
    connectionString:
      "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true",
    expectedFields: [
      { label: "Host", value: "localhost" },
      { label: "Router node port", value: "8888" },
    ],
  },
  {
    engine: "Databricks",
    connectionString:
      "jdbc:databricks://127.0.0.1:8123;httpPath=/sql/1.0/endpoints/abc;OAuthSecret=1234567890;OAuth2ClientId=xyz",
    expectedFields: [
      { label: "Host", value: "127.0.0.1" },
      { label: "HTTP Path", value: "/sql/1.0/endpoints/abc" },
      { label: "Service Principal OAuth Secret", value: "1234567890" },
      { label: "Service Principal Client ID", value: "xyz" },
    ],
  },
  {
    engine: "MySQL",
    connectionString:
      "jdbc:mysql://testuser:testpass@host:3306/dbname?ssl=true",
    expectedFields: [
      { label: "Host", value: "host" },
      { label: "Port", value: "3306" },
      { label: "Database name", value: "dbname" },
      { label: "Display name", value: "dbname" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
      { label: "Use a secure connection (SSL)", value: "on", isChecked: true },
    ],
  },
  {
    engine: "Oracle",
    connectionString:
      "jdbc:oracle:thin:testuser/testpass@mydbhost:1521/mydbservice?ssl_server_cert_dn=ServerDN",
    expectedFields: [
      { label: "Host", value: "mydbhost" },
      { label: "Port", value: "1521" },
      { label: "Oracle service name", value: "mydbservice" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
    ],
  },
  {
    engine: "PostgreSQL",
    connectionString: "jdbc:postgresql://testuser:testpass@localhost:5432/mydb",
    expectedFields: [
      { label: "Host", value: "localhost" },
      { label: "Port", value: "5432" },
      { label: "Database name", value: "mydb" },
      { label: "Display name", value: "mydb" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
    ],
  },
  {
    engine: "Presto",
    connectionString:
      "jdbc:presto://host:1234/sample-catalog/sample-schema?SSL=true&SSLTrustStorePassword=1234",
    expectedFields: [
      { label: "Host", value: "host" },
      { label: "Port", value: "1234" },
      { label: "Catalog", value: "sample-catalog" },
      { label: "Display name", value: "sample-catalog" },
      { label: "Schema (optional)", value: "sample-schema" },
      { label: "Use a secure connection (SSL)", value: "on", isChecked: true },
      { label: "Additional JDBC options", value: "SSLTrustStorePassword=1234" },
    ],
  },
  {
    engine: "Redshift",
    connectionString:
      "jdbc:redshift://examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com:5439/dev",
    expectedFields: [
      {
        label: "Host",
        value: "examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com",
      },
      { label: "Port", value: "5439" },
      { label: "Database name", value: "dev" },
      { label: "Display name", value: "dev" },
    ],
  },
  {
    engine: "Snowflake",
    connectionString:
      "snowflake://testuser:testpass@example.snowflakecomputing.com/?db=maindb&warehouse=mainwarehouse",
    expectedFields: [
      { label: "Account name", value: "example.snowflakecomputing.com" },
      { label: "Database name (case sensitive)", value: "maindb" },
      { label: "Display name", value: "maindb" },
      { label: "Warehouse", value: "mainwarehouse" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
    ],
  },
  {
    engine: "Spark SQL",
    connectionString: "jdbc:sparksql:Server=127.0.0.1;Port=10000",
    expectedFields: [{ label: "Host", value: "127.0.0.1" }],
  },
  {
    engine: "SQLite",
    connectionString: "jdbc:sqlite:///C:/path/to/database.db",
    expectedFields: [{ label: "Filename", value: "C:/path/to/database.db" }],
  },
  {
    engine: "SQL Server",
    connectionString:
      "jdbc:sqlserver://mydbhost:1433;databaseName=mydb;username=testuser;password=testpass",
    expectedFields: [
      { label: "Host", value: "mydbhost" },
      { label: "Port", value: "1433" },
      { label: "Database name", value: "mydb" },
    ],
  },
  {
    engine: "Starburst (Trino)",
    connectionString:
      "jdbc:trino://starburst.example.com:43011/hive/sales?user=test&password=secret&SSL=true&roles=system:myrole",
    expectedFields: [
      { label: "Host", value: "starburst.example.com" },
      { label: "Port", value: "43011" },
      { label: "Catalog", value: "hive" },
      { label: "Display name", value: "hive" },
      { label: "Schema (optional)", value: "sales" },
    ],
  },
  {
    engine: "Vertica",
    connectionString:
      "jdbc:vertica://vertica.example.com:1234/databaseName?user=jane",
    expectedFields: [
      { label: "Host", value: "vertica.example.com" },
      { label: "Port", value: "1234" },
      { label: "Database name", value: "databaseName" },
      { label: "Display name", value: "databaseName" },
      { label: "Username", value: "jane" },
    ],
  },
];

test.describe("Database connection strings", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should parse connection strings for all supported databases", async ({
    page,
  }) => {
    await page.goto("/admin/databases/create");

    for (const { engine, connectionString, expectedFields } of databaseTestCases) {
      await chooseDatabase(page, engine);

      await paste(connectionStringField(page), connectionString);

      // NOTE: `DatabaseConnectionStringField` clears this message after
      // FEEDBACK_TIMEOUT = 2000ms, so this is a "did it ever appear" check with
      // a hard 2s budget, not a stable state. `toBeAttached` polls immediately
      // and the parse is synchronous, so it lands well inside that window.
      await expect(exactText(page, SUCCESS_TEXT)).toBeAttached();

      for (const { label, value, isChecked } of expectedFields) {
        // ⚠️ For the "Use a secure connection (SSL)" rows this is
        // `have.value "on"` against a checkbox, which is the HTML default and
        // does not track checkedness — near-tautological upstream. Kept
        // verbatim; the `toBeChecked()` below is the real assertion.
        await expect(labeled(page, label)).toHaveValue(value);
        if (isChecked) {
          await expect(labeled(page, label)).toBeChecked();
        }
      }
    }
  });

  test("should enable the 'Save' button when the connection string is valid", async ({
    page,
  }) => {
    await page.goto("/admin/databases/create");

    await chooseDatabase(page, "MySQL");

    await paste(
      connectionStringField(page),
      "jdbc:mysql://testuser:testpass@host:3306/dbname?ssl=true",
    );

    await expect(button(page, "Save")).toBeEnabled();
  });

  test("should show a warning if the connection string is invalid", async ({
    page,
  }) => {
    await page.goto("/admin/databases/create");

    await chooseDatabase(page, "MySQL");

    await paste(connectionStringField(page), "invalid");

    await expect(exactText(page, FAILURE_TEXT)).toBeVisible();
  });

  test("should not clear the existing values", async ({ page }) => {
    await page.goto("/admin/databases/create");

    await chooseDatabase(page, "PostgreSQL");
    // `cy.type` on the empty Port field (it only has a placeholder).
    await typeAppending(labeled(page, "Port"), "1111");

    await paste(
      connectionStringField(page),
      "postgresql://postgres:password@db.apbkobhfnmcqqzqeeqss.supabase.co/postgres",
    );

    await expect(labeled(page, "Port")).toHaveValue("1111");
    await expect(labeled(page, "Database type")).toHaveValue("PostgreSQL");
  });

  test.describe("actual database connections", () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

    let createDatabase: ResponseRecorder;
    let getDatabases: ResponseRecorder;

    test.beforeEach(async ({ page }) => {
      // Port of the two `cy.intercept(...).as(...)` calls. Both are
      // ResponseRecorders rather than `waitForResponse`, registered exactly
      // where Cypress registers the intercept: `@getDatabases` is consumed in a
      // LOOP by waitForDbSync, which `waitForResponse` cannot reproduce.
      createDatabase = new ResponseRecorder(
        page,
        "POST",
        pathnameIs("/api/database"),
      );
      getDatabases = new ResponseRecorder(
        page,
        "GET",
        pathnameIs("/api/database"),
      );
    });

    test("should successfully connect to MySQL using connection string", async ({
      page,
    }) => {
      await page.goto("/admin/databases/create");

      await chooseDatabase(page, "MySQL");

      const connectionString = `jdbc:mysql://metabase:metasample123@localhost:${QA_MYSQL_PORT}/sample?allowPublicKeyRetrieval=true`;

      await paste(connectionStringField(page), connectionString);

      await expect(labeled(page, "Host")).toHaveValue("localhost");
      await expect(labeled(page, "Port")).toHaveValue(String(QA_MYSQL_PORT));
      await expect(labeled(page, "Database name")).toHaveValue("sample");
      await expect(labeled(page, "Username")).toHaveValue("metabase");
      await expect(labeled(page, "Password")).toHaveValue("metasample123");

      await expect(button(page, "Save")).toBeEnabled();
      await button(page, "Save").click();

      const response = await createDatabase.next();
      expect(response.status()).toBe(200);
      expect(((await response.json()) as { name: string }).name).toBe("sample");

      await expect.poll(() => page.url()).toMatch(/\/admin\/databases\/\d/);
      await waitForDbSync(getDatabases);

      await expect(
        page.getByRole("link", { name: "Manage permissions", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Browse data/ }),
      ).toBeVisible();
    });

    test("should successfully connect to PostgreSQL using connection string", async ({
      page,
    }) => {
      await page.goto("/admin/databases/create");

      await chooseDatabase(page, "PostgreSQL");

      const connectionString = `jdbc:postgresql://metabase:metasample123@localhost:${QA_POSTGRES_PORT}/sample`;

      await paste(connectionStringField(page), connectionString);

      // Upstream is `findByTextEnsureVisible(...).should("exist")` — a
      // visibility check with a redundant existence check chained onto it.
      // Both are kept rather than merged.
      await expect(exactText(page, SUCCESS_TEXT)).toBeVisible();
      await expect(exactText(page, SUCCESS_TEXT)).toBeAttached();

      await expect(labeled(page, "Host")).toHaveValue("localhost");
      await expect(labeled(page, "Port")).toHaveValue(String(QA_POSTGRES_PORT));
      await expect(labeled(page, "Database name")).toHaveValue("sample");
      await expect(labeled(page, "Username")).toHaveValue("metabase");
      await expect(labeled(page, "Password")).toHaveValue("metasample123");

      await expect(button(page, "Save")).toBeEnabled();
      await button(page, "Save").click();

      const response = await createDatabase.next();
      expect(response.status()).toBe(200);
      expect(((await response.json()) as { name: string }).name).toBe("sample");

      await expect.poll(() => page.url()).toMatch(/\/admin\/databases\/\d/);
      await waitForDbSync(getDatabases);

      await expect(
        page.getByRole("link", { name: "Manage permissions", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Browse data/ }),
      ).toBeVisible();
    });

    test("should handle connection failures gracefully", async ({ page }) => {
      await page.goto("/admin/databases/create");

      await chooseDatabase(page, "PostgreSQL");

      const invalidConnectionString = `jdbc:postgresql://baduser:wrongpass@localhost:${QA_POSTGRES_PORT}/nonexistent`;

      await paste(connectionStringField(page), invalidConnectionString);

      await expect(button(page, "Save")).toBeEnabled();
      await button(page, "Save").click();

      const response = await createDatabase.next();
      expect(response.status()).not.toBe(200);

      // `cy.button("Failed").should("exist")` — existence, not visibility.
      await expect(button(page, "Failed")).toBeAttached();
    });
  });
});

test.describe("Database connection strings events", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    // Port of H.resetSnowplow() + H.enableTracking(): the capture is created
    // fresh per test (so it starts empty, i.e. "reset") and its init script
    // forces anon-tracking/snowplow on in the browser.
    //
    // Upstream restores TWICE for these tests (once in the file-level
    // beforeEach, once here). The second restore is redundant — it restores the
    // same default snapshot — and re-running it after signing in would only
    // force a re-sign-in. Collapsed to one restore + sign-in.
    await mb.restore();
    await mb.signInAsAdmin();
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
    await page.goto("/admin/databases/create?engine=mysql");
  });

  test("should track success events correctly", async ({ page }) => {
    const successEvent = {
      event: "connection_string_parsed_success",
      triggered_from: "full-page",
    };

    await connectionStringField(page).focus();
    await paste(
      connectionStringField(page),
      "jdbc:mysql://testuser:testpass@host:3306/dbname?ssl=true",
    );
    await paste(
      connectionStringField(page),
      "jdbc:mysql://a:b@c:3/dbname?ssl=false",
    );

    await expect(exactText(page, SUCCESS_TEXT)).toBeVisible();
    await expect(exactText(page, SUCCESS_TEXT)).toBeAttached();

    // The blur is what emits: `handleBlur` reads `lastParseStatusRef`.
    await labeled(page, "Display name").click();

    await expectUnstructuredSnowplowEvent(snowplow, successEvent, 1);

    await connectionStringField(page).click();
    await labeled(page, "Display name").click();

    // Should not track the same event again — `handleBlur` nulls the ref after
    // emitting, and re-focusing does not re-run the parse effect.
    await expectUnstructuredSnowplowEvent(snowplow, successEvent, 1);
  });

  test("should track failure events correctly", async ({ page }) => {
    await connectionStringField(page).focus();
    await paste(connectionStringField(page), "broken string");
    await typeAppending(connectionStringField(page), "also not a valid string");

    await expect(exactText(page, FAILURE_TEXT)).toBeVisible();
    await expect(exactText(page, FAILURE_TEXT)).toBeAttached();

    await labeled(page, "Display name").click();

    await expectUnstructuredSnowplowEvent(
      snowplow,
      {
        event: "connection_string_parsed_failed",
        triggered_from: "full-page",
      },
      1,
    );
  });
});
