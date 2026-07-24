/**
 * Playwright port of
 * e2e/test/scenarios/onboarding/add-initial-data.cy.spec.ts
 *
 * Instance state
 * --------------
 * Every test uses the plain `default` snapshot (`H.restore()`), NOT `blank`.
 * The corrupt-`e2e/snapshots/blank.sql` hazard that broke the sibling
 * `onboarding-setup` port therefore does not apply here.
 *
 * The spec does have a real, undeclared instance-state dependency though:
 * the "Getting Started" sidebar section renders only when
 * `getIsNewInstance` (frontend/src/metabase/selectors/onboarding.ts:9) is true,
 * i.e. `instance-creation` is within 30 days. `instance-creation` is derived
 * from the FIRST USER'S creation timestamp baked into the snapshot
 * (`analytics/settings.clj:80`), so if this box's `e2e/snapshots/default.sql`
 * ever ages past 30 days, test 1 and the white-label test start failing in a
 * way that looks exactly like port drift. Measured on this box: 2026-07-17,
 * i.e. 3 days old. Recorded in findings-inbox/add-initial-data.md.
 *
 * Gates
 * -----
 * - `@external` on the first top-level describe is NOT a QA-database tag here.
 *   Nothing in that describe touches postgres/mysql/mongo; the only external
 *   service it needs is the snowplow-micro container that `H.resetSnowplow` /
 *   `H.expectUnstructuredSnowplowEvent` talk to. The port captures events at
 *   the browser boundary instead, so there is no container and nothing to gate:
 *   no `PW_QA_DB_ENABLED` skip is added. Verified with a gate-OFF control
 *   (identical results with and without the variable).
 * - The white-label test genuinely needs the `whitelabel` token feature and is
 *   gated with `resolveToken` (PORTING rule 7). Traced in the findings file:
 *   `application-name` carries `:feature :whitelabel` (appearance/settings.clj:20)
 *   so the PUT 500s and the getter falls back to "Metabase" without it, AND the
 *   frontend `getIsWhiteLabeling` is only registered by the EE whitelabel
 *   plugin. Both gates flip together.
 *
 * Snowplow vantage
 * ----------------
 * All five events this spec asserts on (`data_add_modal_opened`,
 * `csv_tab_clicked`, `database_tab_clicked`, `database_setup_selected`,
 * `csv_upload_clicked`) are FRONTEND-emitted via `trackSimpleEvent`
 * (MainNavbar/analytics.ts, AddDataModal/analytics.ts) — there is no `.clj`
 * emission site for any of them. So the browser-boundary capture
 * (`installSnowplowCapture`) is the correct seam; the per-slot collector would
 * see nothing, and in fact currently CANNOT see frontend events at all (its
 * preflight omits `Access-Control-Allow-Credentials`). PORTING rule 6's no-op
 * stub is wrong here — the events ARE the subject of all five tests.
 * `H.expectNoBadSnowplowEvents` degrades to a structural check: it does NOT
 * catch Iglu schema-validation failures (see search-snowplow.ts's docstring).
 *
 * Assertion-semantics notes
 * -------------------------
 * - `findAllByRole("option").should("contain", x)` is chai-jquery's ANY-OF
 *   case on a multi-element subject, not first-match — ported as
 *   `expectAnyContains` (see support/add-initial-data.ts).
 * - `findByLabelText(...)` / `findByText(str)` are EXACT in testing-library →
 *   `{ exact: true }` (PORTING rule 1). `cy.contains(str)` is a case-sensitive
 *   substring → `caseSensitiveSubstring` regex.
 * - `cy.location(...).should("eq", …)` retries → `expect.poll`.
 * - `should("not.exist")` → `toHaveCount(0)` (equivalent retrying form). Each
 *   one is preceded by an anchor that only exists in the LOADED state, because
 *   a `.within()` rooted at a `findByRole` carries an implicit existence
 *   assertion that a naive port drops.
 * - `cy.intercept("PUT", …) + cy.wait(@alias)` → `waitForResponse` registered
 *   before the triggering click (PORTING rule 2).
 */
import type { FrameLocator } from "@playwright/test";

import {
  CSV_FILE,
  addDataModal,
  dropFileOn,
  expectAnyContains,
  expectNoneContains,
  expectPathname,
  expectSearch,
  frameNavigationSidebar,
  frameSidebarSection,
  getTab,
  openAddDataModalFromSidebar,
  openTab,
  sidebarSectionButton,
} from "../support/add-initial-data";
import { USER_GROUPS } from "../support/admin-people";
import { resolveToken } from "../support/api";
import { updateCollectionGraph } from "../support/click-behavior";
import { statusRoot } from "../support/collections-uploads";
import {
  entityPickerModal,
  entityPickerModalItem,
} from "../support/entity-picker";
import { goToMainApp } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { SECOND_COLLECTION_ID } from "../support/question-new";
import { FIRST_COLLECTION_ID, SAMPLE_DB_ID } from "../support/sample-data";
import type { UserName } from "../support/sample-data";
import { visitFullAppEmbeddingUrl } from "../support/search";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import {
  tableInteractiveBody,
  tableInteractiveHeader,
} from "../support/table-column-settings";
import { caseSensitiveSubstring } from "../support/text";
import { navigationSidebar, popover, sidebarSection } from "../support/ui";

const UPLOADS_SETTINGS = {
  db_id: SAMPLE_DB_ID,
  schema_name: "PUBLIC",
  table_prefix: null,
};

test.describe("better onboarding via sidebar", () => {
  // Upstream tags this describe `@external`. The only external service it
  // reaches is snowplow-micro, which the browser-boundary capture replaces —
  // see the header. No QA database is touched, so nothing is gated.
  test.describe("Add data modal analytics", () => {
    let capture: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      // Must be installed before the first navigation: the tracker is created
      // during app bootstrap.
      capture = await installSnowplowCapture(page, mb.baseUrl);
      capture.reset(); // H.resetSnowplow()
      await mb.restore();
      await mb.signInAsAdmin();
      // H.enableTracking(). The capture already forces this on in the
      // bootstrap blob and in /api/session/properties, but the backend write
      // is upstream's and is kept so the port does not depend on the override.
      await mb.api.put("/api/setting/anon-tracking-enabled", { value: true });
    });

    test.afterEach(() => {
      expectNoBadSnowplowEvents(capture);
    });

    test("should track the button click from the 'Getting Started' section", async ({
      page,
    }) => {
      await page.goto("/");

      const addYourData = navigationSidebar(page)
        .getByRole("tab", { name: /^Getting Started/i })
        .getByLabel("Add your data", { exact: true });
      await expect(addYourData).toBeVisible();
      await addYourData.click();

      await expect(addDataModal(page)).toBeVisible();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "data_add_modal_opened",
        triggered_from: "getting-started",
      });
    });

    test("should track the button click from the 'Data' section", async ({
      page,
    }) => {
      await page.goto("/");
      await openAddDataModalFromSidebar(page);

      await expect(addDataModal(page)).toBeVisible();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "data_add_modal_opened",
        triggered_from: "left-nav",
      });
    });

    test("should track tab clicks within the 'Add data' modal", async ({
      page,
    }) => {
      await page.goto("/");
      await openAddDataModalFromSidebar(page);

      // Tracking shouldn't happen on the default open tab.
      await expect(getTab(page, "Database")).toHaveAttribute(
        "data-active",
        "true",
      );

      // Track when CSV tab opens.
      await openTab(page, "CSV");
      await expectUnstructuredSnowplowEvent(capture, {
        event: "csv_tab_clicked",
        triggered_from: "add-data-modal",
      });

      // Ignore the repeated click.
      await openTab(page, "CSV");
      await expectUnstructuredSnowplowEvent(
        capture,
        {
          event: "csv_tab_clicked",
          triggered_from: "add-data-modal",
        },
        1,
      );

      // Track when Database tab opens.
      await openTab(page, "Database");
      // We confirm that it didn't track the default open tab because the
      // following assertion passes. If there were multiple events like this,
      // the count would be higher.
      await expectUnstructuredSnowplowEvent(
        capture,
        {
          event: "database_tab_clicked",
          triggered_from: "add-data-modal",
        },
        1,
      );
    });

    test("should track database selection", async ({ page }) => {
      await page.goto("/");
      await openAddDataModalFromSidebar(page);

      const snowflake = addDataModal(page)
        .getByRole("listbox")
        .getByText("Snowflake", { exact: true });
      await expect(snowflake).toBeVisible();
      await snowflake.click();

      await expectPathname(page, "/admin/databases/create");

      await expectUnstructuredSnowplowEvent(capture, {
        event: "database_setup_selected",
        event_detail: "snowflake",
        triggered_from: "add-data-modal",
      });
    });

    test("should track CSV file selection click", async ({ page, mb }) => {
      // Enable uploads.
      await mb.api.put("/api/setting/uploads-settings", {
        value: UPLOADS_SETTINGS,
      });

      await page.goto("/");
      await openAddDataModalFromSidebar(page);
      await openTab(page, "CSV");
      await addDataModal(page).getByText("Select a file", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "csv_upload_clicked",
        triggered_from: "add-data-modal",
      });
    });
  });
});

test.describe("Add data modal", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test("should hide Getting Started but still offer to add data for white labeled instances", async ({
    page,
    mb,
  }) => {
    // PORTING rule 7. Traced in findings-inbox/add-initial-data.md: without
    // the `whitelabel` feature the PUT below 500s AND the frontend selector is
    // never registered, so both halves of the assertion would be wrong.
    test.skip(
      !resolveToken("pro-self-hosted"),
      "needs the pro-self-hosted token (whitelabel feature)",
    );

    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // The condition will not kick in without changing the app name.
    // Do not remove this API call.
    await mb.api.put("/api/setting/application-name", {
      value: "FooBar, Inc.",
    });

    await page.goto("/");

    const sidebar = navigationSidebar(page);
    // Anchor: "Home" renders in the same MainNavbarView pass that evaluates
    // `shouldDisplayGettingStarted`, so the absence check below is not
    // satisfied merely by the sidebar not having painted yet.
    await expect(sidebar.getByText("Home", { exact: true })).toBeVisible();
    await expect(sidebar.getByText(/Getting Started/i)).toHaveCount(0);

    // Adding data from the 'Data' section should work.
    await sidebarSectionButton(page, "Data", "Add data").click();

    await expect(addDataModal(page)).toBeVisible();
  });

  test.describe("'Database' tab", () => {
    test("should work properly for admins", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      await page.goto("/");
      await openAddDataModalFromSidebar(page);

      const modal = addDataModal(page);
      const options = modal.getByRole("option");

      // Admin should be able to manage databases.
      await expect(
        modal.getByRole("link", { name: "Manage databases", exact: true }),
      ).toHaveAttribute("href", "/admin/databases");

      // Elevated engines should be shown initially.
      await expect(options).toHaveCount(6);
      for (const engine of [
        "MySQL",
        "PostgreSQL",
        "SQL Server",
        "Amazon Redshift",
        "BigQuery",
        "Snowflake",
      ]) {
        await expectAnyContains(options, engine);
      }

      // The list is initially not expanded.
      await expect(
        modal.getByText("Show more", { exact: true }),
      ).toBeVisible();

      // Searching automatically expands the list.
      const search = modal.getByPlaceholder("Search databases", {
        exact: true,
      });
      // pressSequentially, not fill(): the list filters on real keystrokes.
      await search.click();
      await search.pressSequentially("re");
      await expectAnyContains(options, "Presto");

      // Collapsing the list resets search value and shows the initial
      // elevated engines list.
      await modal.getByText("Hide", { exact: true }).click();
      await expect(search).toHaveValue("");
      await expect(options).toHaveCount(6);
      for (const engine of [
        "MySQL",
        "PostgreSQL",
        "SQL Server",
        "Amazon Redshift",
        "BigQuery",
        "Snowflake",
      ]) {
        await expectAnyContains(options, engine);
      }
      await expectNoneContains(options, "Presto");

      // Admin can manually expand the list.
      await modal.getByText("Show more", { exact: true }).click();
      await expect
        .poll(() => options.count())
        .toBeGreaterThan(6);

      // Clicking on an engine opens the database form for that engine.
      await modal.getByText("Snowflake", { exact: true }).click();
      await expectPathname(page, "/admin/databases/create");
      await expectSearch(page, "?engine=snowflake");

      await expect(
        page.getByRole("heading", { name: "Add a database", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Database type", { exact: true }),
      ).toHaveValue("Snowflake");
    });

    test("should not offer to add data when in full app embedding", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      const frame: FrameLocator = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        qs: {},
        baseUrl: mb.baseUrl,
      });

      const sidebar = frameNavigationSidebar(frame);
      await expect(sidebar.getByText("Home", { exact: true })).toBeVisible();

      // Make sure we don't display the 'Getting Started' section.
      await expect(sidebar.getByText(/Getting Started/i)).toHaveCount(0);
      await expect(
        sidebar.getByText("Add your data", { exact: true }),
      ).toHaveCount(0);

      // Make sure we don't display the 'Add data' button in the 'Data' section.
      await expect(sidebar.getByText(/^Data$/i)).toBeVisible();
      // Anchor the absence on the section itself existing — upstream's
      // `.within()` on `navigationSidebar()` carried that implicitly and the
      // Data-section heading assertion above supplies it.
      await expect(frameSidebarSection(frame, "Data")).toHaveCount(1);
      await expect(
        sidebar.getByLabel("Add data", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("'CSV' tab", () => {
    test("admins should be able to enable uploads initially", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await page.goto("/");
      await openAddDataModalFromSidebar(page);
      await openTab(page, "CSV");
      await addDataModal(page)
        .getByText("Enable uploads", { exact: true })
        .click();

      await expectPathname(page, "/admin/settings/uploads");

      await page.getByLabel("Database to use for uploads", { exact: true }).click();
      await popover(page)
        .getByText(caseSensitiveSubstring("Sample Database"))
        .first()
        .click();
      await page.getByLabel("Schema", { exact: true }).click();
      await popover(page)
        .getByText(caseSensitiveSubstring("PUBLIC"))
        .first()
        .click();

      // PORTING rule 2: register before the triggering click.
      const enableUploads = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === "/api/setting/uploads-settings",
      );
      await page
        .getByRole("button", { name: "Enable uploads", exact: true })
        .click();
      await enableUploads;

      await goToMainApp(page);

      await openAddDataModalFromSidebar(page);
      await openTab(page, "CSV");

      const modal = addDataModal(page);
      await modal
        .locator("#add-data-modal-upload-csv-input")
        .setInputFiles(CSV_FILE);
      await expect(
        modal.getByLabel("Select a collection", { exact: true }),
      ).toContainText("Our analytics");

      const uploadButton = modal.getByRole("button", {
        name: "Upload",
        exact: true,
      });
      await expect(uploadButton).toBeEnabled();
      await uploadButton.click();

      await expect(addDataModal(page)).toHaveCount(0);
      await statusRoot(page)
        .getByText("Start exploring", { exact: true })
        .click();

      // Assert that we loaded the model created from CSV.
      await expect(
        page
          .getByTestId("question-row-count")
          .getByText("Showing 1 row", { exact: true }),
      ).toBeVisible();

      const crumbs = page.getByTestId("head-crumbs-container");
      await expect(crumbs).toContainText("Our analytics");
      await expect(crumbs).toContainText("Foo Bar");

      await expect(tableInteractiveHeader(page)).toContainText("Header1");
      await expect(tableInteractiveHeader(page)).toContainText("Header2");
      await expect(tableInteractiveBody(page)).toContainText("value1");
      await expect(tableInteractiveBody(page)).toContainText("value2");
    });

    test("CSV upload should work for non-admins with spotty collection permissions", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();

      // Enable uploads.
      await mb.api.put("/api/setting/uploads-settings", {
        value: UPLOADS_SETTINGS,
      });

      await updateCollectionGraph(mb.api, {
        [USER_GROUPS.DATA_GROUP]: {
          [FIRST_COLLECTION_ID]: "read",
          [SECOND_COLLECTION_ID]: "write",
        },
      });

      // `nocollection` is outside the fixture's typed USERS map but present in
      // the snapshot login cache (mirrors collections-permissions.spec).
      await mb.signIn("nocollection" as UserName);
      await page.goto("/");
      await openAddDataModalFromSidebar(page);
      await openTab(page, "CSV");

      const modal = addDataModal(page);
      const uploadButton = modal.getByRole("button", {
        name: "Upload",
        exact: true,
      });
      await expect(uploadButton).toBeDisabled();

      await dropFileOn(
        modal.getByTestId("add-data-modal-csv-dropzone"),
        CSV_FILE,
      );

      const collectionButton = modal.getByLabel("Select a collection", {
        exact: true,
      });
      await expect(collectionButton).toContainText(
        "No Collection Tableton's Personal Collection",
      );
      await collectionButton.click();

      const picker = entityPickerModal(page);
      await entityPickerModalItem(page, 0, "Collections").click();
      await entityPickerModalItem(page, 1, "First collection").click();
      await expect(
        picker.getByRole("button", {
          name: "Select this collection",
          exact: true,
        }),
      ).toBeDisabled();
      await entityPickerModalItem(page, 2, "Second collection").click();
      const selectCollection = picker.getByRole("button", {
        name: "Select this collection",
        exact: true,
      });
      await expect(selectCollection).toBeEnabled();
      await selectCollection.click();

      await expect(collectionButton).toContainText("Second collection");
      await expect(uploadButton).toBeEnabled();
      await uploadButton.click();

      await expect(addDataModal(page)).toHaveCount(0);
      await statusRoot(page)
        .getByText("Start exploring", { exact: true })
        .click();

      // Assert that we loaded the model created from CSV.
      await expect(
        page
          .getByTestId("question-row-count")
          .getByText("Showing 1 row", { exact: true }),
      ).toBeVisible();

      const crumbs = page.getByTestId("head-crumbs-container");
      await expect(crumbs).toContainText("Second collection");
      await expect(crumbs).toContainText("Foo Bar");

      await expect(tableInteractiveHeader(page)).toContainText("Header1");
      await expect(tableInteractiveHeader(page)).toContainText("Header2");
      await expect(tableInteractiveBody(page)).toContainText("value1");
      await expect(tableInteractiveBody(page)).toContainText("value2");
    });

    test("should be hidden for non-admins without upload permissions", async ({
      page,
      mb,
    }) => {
      await mb.signInAsNormalUser();
      await page.goto("/");

      // Upstream's `cy.findByRole("section", { name: "Data" }).within(...)`
      // carries an implicit existence assertion on the section — ported
      // explicitly so the absence check below cannot pass on an unrendered page.
      const dataSection = sidebarSection(page, "Data");
      await expect(dataSection).toBeVisible();
      await expect(
        dataSection.getByLabel("Add data", { exact: true }),
      ).toHaveCount(0);
    });
  });
});
