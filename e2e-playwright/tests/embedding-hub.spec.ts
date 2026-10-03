/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-hub/embedding-hub.cy.spec.ts
 *
 * Port notes
 * ----------
 * - QA-DB tier: 8 of the 36 tests restore the `postgres-12` /
 *   `postgres-writable` snapshots or add the QA Postgres12 container as a
 *   database. Those are gated on PW_QA_DB_ENABLED (PORTING rule 6). The other
 *   28 restore `setup` and run against the plain jar — this spec is NOT
 *   all-skip when the gate is closed, and the report distinguishes the two.
 * - `cy.findByText(...).closest("button")` on a setup-guide card resolves to
 *   the Mantine `Stepper.Step` (an UnstyledButton) that wraps the whole step,
 *   not the card — see `closestButton` in support/embedding-hub.ts. Each hub
 *   step holds exactly one card, so the scope is unambiguous.
 * - `scrollIntoView()` is dropped throughout: Playwright's actionability
 *   scrolls automatically, and `toBeVisible()` does not require in-viewport.
 * - `cy.url().should("include", x)` retries → `expect.poll(() => page.url())`.
 * - `cy.intercept().as() + cy.wait()` → `waitForResponse` predicates registered
 *   before the triggering action (rule 2).
 * - Absence checks (`should("not.exist")`) → retrying `toHaveCount(0)`, each
 *   anchored on a positive signal that proves the surrounding content rendered
 *   (the Cypress chains carry that anchor implicitly via findBy*).
 * - `should("be.empty")` on an `<input>` is VACUOUS in chai-jquery (it asserts
 *   "no child nodes", which is trivially true of a void element). Ported as
 *   `toHaveValue("")`, which is what the test plainly means. Flagged rather
 *   than silently copied.
 * - The two `cy.request("GET", "/api/session/properties")` assertions taken
 *   immediately after a UI click are wrapped in `expect.poll`: Cypress's
 *   command queue supplies a settle between the click and the request that
 *   Playwright does not. The assertion itself is unchanged.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { resyncDatabase } from "../support/schema-viewer";
import { WRITABLE_DB_ID, getTableId } from "../support/schema-viewer";
import { createDashboard } from "../support/factories";
import { pickEntity } from "../support/dashboard";
import { entityPickerModal, miniPicker } from "../support/notebook";
import { publishChanges } from "../support/embedding-dashboard";
import { sandboxTable } from "../support/dashboard-repros";
import { getFieldId } from "../support/table-editing";
import { undoToast } from "../support/metrics";
import { tooltip } from "../support/charts";
import { menu } from "../support/schema-viewer";
import { icon, main, modal, popover } from "../support/ui";
import {
  ALL_EXTERNAL_USERS_GROUP_ID,
  QA_DB_SKIP_MESSAGE,
  STATIC_ORDERS_ID,
  addPostgresDatabase,
  adminLayoutContent,
  closestButton,
  resetMultiSchemaTable,
} from "../support/embedding-hub";

const NON_SAMPLE_DB_NAME = "QA Postgres12";

const skipUnlessQaDb = () =>
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_MESSAGE);

/** GET /api/ee/embedding-hub/checklist — the `@getChecklist` alias. */
const isChecklist = (response: Response) =>
  response.request().method() === "GET" &&
  new URL(response.url()).pathname === "/api/ee/embedding-hub/checklist";

/** PUT /api/permissions/graph — the `@updatePermissionsGraph` alias. */
const isPermissionsGraphPut = (response: Response) =>
  response.request().method() === "PUT" &&
  new URL(response.url()).pathname === "/api/permissions/graph";

/** PUT /api/dashboard/* — the `@moveDashboard` alias. */
const isDashboardPut = (response: Response) =>
  response.request().method() === "PUT" &&
  /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname);

/** The setup-guide card whose title is `title`. */
function hubCard(page: Page, title: string): Locator {
  return adminLayoutContent(page).getByText(title, { exact: true });
}

/** The stepper step (Cypress: `.closest("button")`) containing that card. */
function hubStep(page: Page, title: string): Locator {
  return closestButton(hubCard(page, title));
}

function stepListItem(page: Page, name: string | RegExp): Locator {
  return main(page).getByRole("listitem", {
    name,
    exact: typeof name === "string",
  });
}

test.describe("scenarios - embedding hub", () => {
  test.describe("checklist", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-cloud");
    });

    test("Contains setup guide in sidebar", async ({ page }) => {
      await page.goto("/admin/embedding");

      const link = page
        .getByTestId("admin-layout-sidebar")
        .getByText("Setup guide", { exact: true });
      await expect(link).toBeAttached();
      await link.click();

      await expect(
        adminLayoutContent(page).getByRole("heading", {
          name: "Embedding setup guide",
          exact: true,
        }),
      ).toBeAttached();
    });

    test('"Create a dashboard" card should save the x-ray and show a success toast without leaving the guide', async ({
      page,
    }) => {
      await page.goto("/admin/embedding/setup-guide");

      // Find and click on 'Create a dashboard' card
      await hubCard(page, "Create a dashboard").click();

      // Select a table to generate dashboard from
      await expect(
        modal(page).getByText("Choose a table to generate a dashboard", {
          exact: true,
        }),
      ).toBeVisible();
      await pickEntity(page, {
        path: ["Databases", "Sample Database", "Accounts"],
      });

      // Should show a success toast with a link to the new dashboard
      // MIXED CONTENT: the toast body is one element holding the text node
      // "Your dashboard was saved" AND the "See it" <Link>, so its full text
      // is "Your dashboard was savedSee it". testing-library's exact
      // findByText matches an element's direct text nodes; Playwright's exact
      // getByText compares full element text — so this must be a
      // case-sensitive substring regex (PORTING "mixed-content text nodes").
      await expect(
        undoToast(page).getByText(/Your dashboard was saved/),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        undoToast(page).getByText("See it", { exact: true }),
      ).toBeVisible();

      // Should remain on the setup guide
      await expect
        .poll(() => page.url())
        .toContain("/admin/embedding/setup-guide");
    });

    test('"Connect a database" card should pass from param in navigation URL', async ({
      page,
    }) => {
      await page.goto("/admin/embedding/setup-guide");

      // Find and click on 'Connect a database' card
      await hubCard(page, "Connect a database").click();

      // Add data modal should open
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", { name: "Add data", exact: true }),
      ).toBeVisible();

      // Select a database engine
      await page
        .getByRole("dialog")
        .getByText("PostgreSQL", { exact: true })
        .click();

      // Should navigate with from param
      await expect.poll(() => page.url()).toContain("/admin/databases/create");
      await expect
        .poll(() => page.url())
        .toContain("returnToEmbeddingSetupGuide=");
    });

    test("Uploading CSVs to sample database should mark the 'Add Data' step as done", async ({
      page,
      mb,
    }) => {
      // Enable CSV uploads
      await mb.api.put("/api/setting/uploads-settings", {
        value: {
          db_id: 1, // Sample Database ID
          schema_name: "PUBLIC",
          table_prefix: null,
        },
      });

      await page.goto("/admin/embedding/setup-guide");

      // 'Connect a database' should not be marked as done
      await expect(hubCard(page, "Connect a database")).toBeVisible();
      await expect(
        hubStep(page, "Connect a database").getByText("Done", { exact: true }),
      ).toHaveCount(0);

      await hubCard(page, "Connect a database").click();

      await modal(page).getByText("CSV", { exact: true }).click();

      // Upload a CSV file
      await page.locator("#add-data-modal-upload-csv-input").setInputFiles({
        name: "test-upload.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("header1,header2\nvalue1,value2", "utf8"),
      });

      const uploadButton = modal(page).getByRole("button", {
        name: "Upload",
        exact: true,
      });
      await expect(uploadButton).toBeEnabled();

      const checklist = page.waitForResponse(isChecklist);
      await uploadButton.click();
      await checklist;

      // 'Connect a database' should be marked as done
      await expect(
        hubStep(page, "Connect a database").getByText("Done", { exact: true }),
      ).toBeVisible();
    });

    test('"Get embed snippet" card should take you to the embed flow', async ({
      page,
    }) => {
      await page.goto("/admin/embedding/setup-guide");

      await hubCard(page, "Get embed snippet").click();

      await expect(
        modal(page)
          .first()
          .getByText("Select your embed experience", { exact: true }),
      ).toBeVisible();
    });

    test('"Get embed snippet" step should be done when a guest embed is published', async ({
      page,
      mb,
    }) => {
      // Create a dashboard to embed
      await createDashboard(mb.api, { name: "Test Dashboard" });

      await page.goto("/admin/embedding/setup-guide");

      // step should not be marked as done at first
      await expect(hubCard(page, "Get embed snippet")).toBeVisible();
      await expect(
        hubStep(page, "Get embed snippet").getByText("Done", { exact: true }),
      ).toHaveCount(0);

      // open embed wizard
      await hubCard(page, "Get embed snippet").click();

      const wizard = modal(page).first();
      // switch to guest auth
      await wizard.getByLabel("Guest", { exact: true }).click();
      // choose dashboard experience
      await wizard.getByText("Dashboard", { exact: true }).click();
      // pick a dashboard
      await wizard.getByTestId("embed-browse-entity-button").click();

      await entityPickerModal(page)
        .getByText("Test Dashboard", { exact: true })
        .click();

      await wizard.getByText("Next", { exact: true }).click();

      // publish the embed
      await publishChanges(page, "dashboard");

      // close the wizard
      await modal(page).first().getByText("Get code", { exact: true }).click();
      await modal(page).first().getByLabel("Close", { exact: true }).click();

      // step should be marked as done
      await expect(
        hubStep(page, "Get embed snippet").getByText("Done", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("embedding checklist should show up on the embedding homepage", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("embedding-homepage", "visible");

      await page.goto("/");

      await expect(
        page.getByText("Get started with modular embedding", { exact: true }).first(),
      ).toBeVisible();

      await expect(
        main(page).getByText("Create a dashboard", { exact: true }),
      ).toBeVisible();
      const connect = main(page).getByText("Connect a database", {
        exact: true,
      });
      await expect(connect).toBeVisible();
      await connect.click();

      // Sanity check: add data modal should open
      await expect(
        page
          .getByRole("dialog")
          .getByRole("heading", { name: "Add data", exact: true }),
      ).toBeVisible();
    });

    test("embedding checklist should not show up on the embedding homepage if not enabled", async ({
      page,
    }) => {
      await page.goto("/");

      // Anchor: the ORDINARY homepage rendered (EmbeddingHubHomePage replaces
      // it wholesale and carries no greeting-message testid), so the absence
      // below is about the hub and not about an unpainted page.
      await expect(main(page).getByTestId("greeting-message")).toBeVisible();

      await expect(
        main(page).getByText("Get started with modular embedding", {
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("overflow menu > customize homepage opens modal with correct title", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("embedding-homepage", "visible");

      await page.goto("/");

      // Click overflow menu button on the embedding homepage
      await main(page).getByLabel("More options", { exact: true }).click();

      await menu(page).getByText("Customize homepage", { exact: true }).click();

      await expect(
        page
          .getByRole("dialog")
          .getByText("Pick a dashboard to appear on the homepage", {
            exact: true,
          }),
      ).toBeVisible();
    });

    test("overflow menu > dismiss guide hides the embedding homepage", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("embedding-homepage", "visible");

      await page.goto("/");

      await expect(
        main(page).getByText("Get started with modular embedding", {
          exact: true,
        }),
      ).toBeVisible();

      // Click overflow menu button on the embedding homepage
      await main(page).getByLabel("More options", { exact: true }).click();

      await menu(page).getByText("Dismiss guide", { exact: true }).click();

      // Verify guide is dismissed and no longer visible
      await expect(
        main(page).getByText("Get started with modular embedding", {
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("should link to user strategy when tenants are disabled", async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await page.goto("/admin/embedding/setup-guide");

      const tenants = main(page).getByText("Tenants", { exact: true });
      await expect(tenants).toBeVisible();
      await expect(
        tenants.locator("xpath=ancestor-or-self::a[1]"),
      ).toHaveAttribute("href", "/admin/people/user-strategy");
    });

    test("should link to tenants page when tenants are enabled", async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await mb.api.updateSetting("use-tenants", true);
      await page.goto("/admin/embedding/setup-guide");

      const tenants = main(page).getByText("Tenants", { exact: true });
      await expect(tenants).toBeVisible();
      await expect(
        tenants.locator("xpath=ancestor-or-self::a[1]"),
      ).toHaveAttribute("href", "/admin/people/tenants");
    });

    test('"Configure data permissions and enable tenants" card should navigate to permissions onboarding page', async ({
      page,
    }) => {
      await page.goto("/admin/embedding/setup-guide");

      await hubCard(
        page,
        "Configure data permissions and enable tenants",
      ).click();

      await expect
        .poll(() => page.url())
        .toContain("/admin/embedding/setup-guide/permissions");

      await expect(
        main(page).getByText("Configure data permissions and enable tenants", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("permissions setup page should mark steps as completed", async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await page.goto("/admin/embedding/setup-guide/permissions");

      // all 5 steps are present and none are completed at first
      await expect(
        main(page).getByText("Enable multi-tenant user strategy", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        main(page).getByText(
          "Which data segregation strategy does your database use?",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        main(page).getByText("Select data to make available", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Create tenants", { exact: true }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Summary", { exact: true }),
      ).toBeVisible();

      // No steps should be completed yet (no check icons)
      await expect(icon(main(page), "check")).toHaveCount(0);

      // enable tenants and create a shared collection
      await mb.api.updateSetting("use-tenants", true);
      await mb.api.post("/api/collection", {
        name: "Shared collection",
        namespace: "shared-tenant-collection",
      });

      // create a tenant
      await mb.api.post("/api/ee/tenant", {
        name: "Test Tenant",
        slug: "test-tenant",
      });

      // check steps 1 and 4 are completed
      await page.reload();
      await expect(icon(main(page), "check")).toHaveCount(2);

      // setup row-level security
      const group = (await (
        await mb.api.post("/api/permissions/group", { name: "Test Group" })
      ).json()) as { id: number };
      await sandboxTable(mb.api, {
        table_id: STATIC_ORDERS_ID,
        group_id: group.id,
      });

      // check all 5 steps are completed
      await page.reload();
      await expect(icon(main(page), "check")).toHaveCount(5);
    });

    test('"Enable tenants and create shared collection" button should enable tenants and create a shared collection', async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      // create an x-ray dashboard via the embedding setup guide
      await page.goto("/admin/embedding/setup-guide");

      await hubCard(page, "Create a dashboard").click();

      // select Orders table from the modal
      await expect(
        modal(page).getByText("Choose a table to generate a dashboard", {
          exact: true,
        }),
      ).toBeVisible();
      await pickEntity(page, {
        path: ["Databases", "Sample Database", "Orders"],
      });

      // wait for x-ray dashboard to generate and save it
      await expect(undoToast(page)).toContainText("Your dashboard was saved", {
        timeout: 30_000,
      });

      await page.goto("/admin/embedding/setup-guide/permissions");

      // tenants should not be enabled
      expect(
        (await (await mb.api.get("/api/session/properties")).json())[
          "use-tenants"
        ],
      ).toBe(false);

      // shared tenants collection should not exist
      expect(
        (await (
          await mb.api.get(
            "/api/collection/tree?namespace=shared-tenant-collection",
          )
        ).json()) as unknown[],
      ).toHaveLength(0);

      // click the enable tenants button
      const enableButton = main(page).getByRole("button", {
        name: "Enable tenants and create shared collection",
        exact: true,
      });
      await expect(enableButton).toBeEnabled();
      await enableButton.click();

      // tenants should be enabled
      await expect
        .poll(async () =>
          (await (await mb.api.get("/api/session/properties")).json())[
            "use-tenants"
          ],
        )
        .toBe(true);

      // shared collection should be created
      await expect
        .poll(
          async () =>
            (await (
              await mb.api.get(
                "/api/collection/tree?namespace=shared-tenant-collection",
              )
            ).json()) as { name: string }[],
        )
        .toEqual([expect.objectContaining({ name: "Shared collection" })]);

      // dashboard picker should appear with the x-ray dashboard pre-selected
      await expect(
        main(page).getByText("This will allow tenant users to see it.", {
          exact: true,
        }),
      ).toBeVisible();

      // x-ray dashboard should be pre-selected, move it
      const moveButton = main(page).getByRole("button", {
        name: "Move to shared collection",
        exact: true,
      });
      await expect(moveButton).toBeEnabled({ timeout: 10_000 });
      const moveDashboard = page.waitForResponse(isDashboardPut);
      await moveButton.click();
      expect((await moveDashboard).status()).toBe(200);

      // x-rayed dashboard should have been moved to the shared collection
      const sharedCollections = (await (
        await mb.api.get(
          "/api/collection/tree?namespace=shared-tenant-collection",
        )
      ).json()) as { id: number }[];
      const sharedCollectionId = sharedCollections[0].id;
      const items = (await (
        await mb.api.get(
          `/api/collection/${sharedCollectionId}/items?models=dashboard`,
        )
      ).json()) as { data: { name: string }[] };
      expect(items.data.length).toBeGreaterThan(0);
      expect(items.data.some((d) => d.name.includes("A look at"))).toBe(true);

      // enable-tenants step should be marked as completed
      // (the embedding checklist query takes time on CI)
      await expect(
        stepListItem(page, "Enable multi-tenant user strategy"),
      ).toHaveAttribute("data-completed", "true", { timeout: 10_000 });

      // move-dashboard step should be marked as completed
      await expect(
        stepListItem(page, "Create a dashboard in the shared collection"),
      ).toHaveAttribute("data-completed", "true", { timeout: 10_000 });
    });

    test("enable-tenants step should not be marked as completed when tenants are enabled but no shared collection exists", async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      // enable tenants via setting without creating a shared collection
      await mb.api.updateSetting("use-tenants", true);

      await page.goto("/admin/embedding/setup-guide/permissions");

      // no steps should be completed
      await expect(
        main(page).getByText("Enable multi-tenant user strategy", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(icon(main(page), "check")).toHaveCount(0);

      // button should still be enabled
      await expect(
        main(page).getByRole("button", {
          name: "Enable tenants and create shared collection",
          exact: true,
        }),
      ).toBeEnabled();
    });

    test('"Enable tenants and create shared collection" button should be disabled when already set up', async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      // enable tenants and create a shared collection
      await mb.api.updateSetting("use-tenants", true);
      await mb.api.post("/api/collection", {
        name: "Shared collection",
        namespace: "shared-tenant-collection",
      });

      await page.goto("/admin/embedding/setup-guide/permissions");

      // wait until step is marked as complete
      await expect(icon(main(page), "check")).toHaveCount(1);

      // un-collapse the pre-collapsed step
      await main(page)
        .getByText("Enable multi-tenant user strategy", { exact: true })
        .click();

      // button should be disabled as setup was already complete
      await expect(
        main(page).getByRole("button", {
          name: "Enable tenants and create shared collection",
          exact: true,
        }),
      ).toBeDisabled();
    });

    test("selecting database routing strategy should show documentation link in step 3", async ({
      page,
      mb,
    }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await page.goto("/admin/embedding/setup-guide/permissions");

      // click the enable tenants button
      const enableButton = main(page).getByRole("button", {
        name: "Enable tenants and create shared collection",
        exact: true,
      });
      await expect(enableButton).toBeEnabled();
      await enableButton.click();

      // complete the move-dashboard step
      await main(page)
        .getByRole("button", { name: "Create a sample dashboard", exact: true })
        .click();

      // select database routing strategy
      await main(page)
        .getByRole("radio", { name: /Database routing/ })
        .click();

      // confirm the strategy selection
      await main(page)
        .getByRole("button", { name: "Use database routing", exact: true })
        .click();

      // should show database routing content with docs link
      await expect(
        main(page).getByText(
          "Manage data permissions with database routing",
          { exact: true },
        ),
      ).toBeVisible();

      await expect(
        main(page).getByRole("link", { name: /View the guide/i }),
      ).toHaveAttribute("href", /database-routing/);
    });

    test.describe("create tenants step", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.restore("setup");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");

        // enable tenants and create shared collection
        await mb.api.updateSetting("use-tenants", true);
        await mb.api.post("/api/collection", {
          name: "Shared collection",
          namespace: "shared-tenant-collection",
        });

        // setup row-level security to unlock the create tenants step
        const group = (await (
          await mb.api.post("/api/permissions/group", { name: "Test Group" })
        ).json()) as { id: number };
        await sandboxTable(mb.api, {
          table_id: STATIC_ORDERS_ID,
          group_id: group.id,
        });
      });

      test("can create two tenants and show summary", async ({ page, mb }) => {
        await page.goto("/admin/embedding/setup-guide/permissions");

        // step 1 should be marked as done before navigating
        await expect(
          stepListItem(page, "Enable multi-tenant user strategy"),
        ).toHaveAttribute("data-completed", "true", { timeout: 10_000 });

        // navigate to create tenants step
        const createTenantsStep = stepListItem(page, "Create tenants");
        await expect(createTenantsStep).toBeVisible();
        await createTenantsStep.click();

        // fill out the tenant form
        await main(page).getByPlaceholder("Tenant name", { exact: true }).fill("Acme Corp");
        await main(page)
          .getByLabel("organization_id", { exact: true })
          .fill("acme-123");
        await main(page)
          .getByPlaceholder("tenant-slug", { exact: true })
          .fill("acme-corp-slug");

        // add another tenant
        await main(page)
          .getByRole("button", { name: /New tenant/ })
          .click();

        // fill out the second tenant form
        await expect(
          main(page).getByPlaceholder("Tenant name", { exact: true }),
        ).toHaveCount(2);
        await main(page)
          .getByPlaceholder("Tenant name", { exact: true })
          .last()
          .fill("Beta Inc");

        await expect(
          main(page).getByLabel("organization_id", { exact: true }),
        ).toHaveCount(2);
        await main(page)
          .getByLabel("organization_id", { exact: true })
          .last()
          .fill("beta-456");

        await expect(
          main(page).getByPlaceholder("tenant-slug", { exact: true }),
        ).toHaveCount(2);
        await main(page)
          .getByPlaceholder("tenant-slug", { exact: true })
          .last()
          .fill("beta-inc-slug");

        // submit the tenant creation form
        await main(page)
          .getByRole("button", { name: "Create tenants", exact: true })
          .click();

        // success toast should show
        await expect(
          undoToast(page).getByText("Tenants created successfully", {
            exact: true,
          }),
        ).toBeVisible();

        // step 4 should be marked as completed
        await expect(stepListItem(page, "Create tenants")).toHaveAttribute(
          "data-completed",
          "true",
          { timeout: 10_000 },
        );

        await expect(
          main(page).getByText("You created the following tenants", {
            exact: true,
          }),
        ).toBeVisible();

        // step 5 should hide title when active
        await expect(
          main(page).getByText("Summary", { exact: true }),
        ).toHaveCount(0);

        // summary step should show tenant #1
        await expect(
          main(page).getByText("Acme Corp", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText("acme-corp-slug", { exact: true }),
        ).toBeVisible();

        // summary step should show tenant #2
        await expect(
          main(page).getByText("Beta Inc", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText("beta-inc-slug", { exact: true }),
        ).toBeVisible();

        // navigation links should be shown in summary
        await expect(
          main(page).getByRole("link", { name: /Tenants/ }),
        ).toBeVisible();
        await main(page)
          .getByRole("button", { name: "Done", exact: true })
          .click();

        // Configure data permissions step should be done
        await expect(
          hubStep(
            page,
            "Configure data permissions and enable tenants",
          ).getByText("Done", { exact: true }),
        ).toBeVisible();

        // verify tenant_attributes are saved correctly via API
        const tenants = (await (await mb.api.get("/api/ee/tenant")).json())
          .data as {
          slug: string;
          attributes: Record<string, string>;
        }[];

        const acmeTenant = tenants.find(
          (tenant) => tenant.slug === "acme-corp-slug",
        );
        const betaTenant = tenants.find(
          (tenant) => tenant.slug === "beta-inc-slug",
        );

        expect(acmeTenant).toBeDefined();
        expect(acmeTenant?.attributes).toEqual({
          organization_id: "acme-123",
        });

        expect(betaTenant).toBeDefined();
        expect(betaTenant?.attributes).toEqual({ organization_id: "beta-456" });

        await page.goto("/admin/people/tenants");

        // tenants are shown in the tenants page
        await expect(
          main(page).getByText("Acme Corp", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText("Beta Inc", { exact: true }),
        ).toBeVisible();
      });

      test("shows error toast when creating a tenant with duplicate slug", async ({
        page,
        mb,
      }) => {
        // create an existing tenant
        await mb.api.post("/api/ee/tenant", {
          name: "Existing Tenant",
          slug: "existing-tenant",
        });

        await page.goto("/admin/embedding/setup-guide/permissions");

        const createTenantsStep = stepListItem(page, "Create tenants");
        await expect(createTenantsStep).toBeVisible();
        await createTenantsStep.click();

        // fill out the tenant form with a colliding slug
        await main(page)
          .getByPlaceholder("Tenant name", { exact: true })
          .fill("Another Tenant");
        await main(page)
          .getByPlaceholder("e.g. acme-corp", { exact: true })
          .fill("another-id");
        await main(page)
          .getByPlaceholder("tenant-slug", { exact: true })
          .fill("existing-tenant");

        await main(page)
          .getByRole("button", { name: "Create tenants", exact: true })
          .click();

        // error toast should be shown
        await expect(
          undoToast(page).getByText(
            "This tenant name or slug is already taken.",
            { exact: true },
          ),
        ).toBeVisible({ timeout: 10_000 });

        // we should still be on the create tenants step
        await expect(
          main(page).getByPlaceholder("Tenant name", { exact: true }),
        ).toBeVisible();
      });

      test("reloads with strategy pre-selected and 'Select data' step unlocked when RLS is configured", async ({
        page,
      }) => {
        await page.goto("/admin/embedding/setup-guide/permissions");

        // 'Select data' step should not be locked when RLS is configured
        const selectData = stepListItem(page, "Select data to make available");
        await expect(selectData).toBeVisible();
        await expect(icon(selectData, "lock")).toHaveCount(0);

        // strategy picker should show RLS pre-selected
        await main(page)
          .getByText(
            "Which data segregation strategy does your database use?",
            { exact: true },
          )
          .click();

        await expect(
          main(page).getByRole("radio", {
            name: /Row and column level security/,
          }),
        ).toHaveAttribute("aria-checked", "true");
      });

      test("shows autocomplete suggestions for organization_id based on selected field values", async ({
        page,
        mb,
      }) => {
        skipUnlessQaDb();

        await mb.restore("postgres-12");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");

        await page.goto("/admin/embedding/setup-guide/permissions");

        // enable tenants and create shared collection
        await main(page)
          .getByRole("button", {
            name: "Enable tenants and create shared collection",
            exact: true,
          })
          .click();

        // wait for tenants to be enabled
        await expect(
          icon(stepListItem(page, "Enable multi-tenant user strategy"), "check"),
        ).toHaveCount(1, { timeout: 10_000 });

        // complete the move-dashboard step
        await main(page)
          .getByRole("button", {
            name: "Create a sample dashboard",
            exact: true,
          })
          .click();

        // use row and column level security
        await main(page)
          .getByRole("radio", { name: /Row and column level security/ })
          .click();

        await main(page)
          .getByRole("button", {
            name: "Use row and column level security",
            exact: true,
          })
          .click();

        // pick orders table
        await main(page).getByText("Pick a table", { exact: true }).click();
        await miniPicker(page)
          .getByText(NON_SAMPLE_DB_NAME, { exact: true })
          .click();
        await miniPicker(page).getByText("Orders", { exact: true }).click();

        await main(page)
          .getByPlaceholder("Pick a column", { exact: true })
          .click();
        await popover(page).getByText("User ID", { exact: true }).click();
        await main(page)
          .getByRole("button", { name: "Next", exact: true })
          .click();

        // autocomplete dropdown should show matching user id values
        const identifier = main(page).getByPlaceholder("e.g. 1", {
          exact: true,
        });
        await identifier.click();
        await identifier.pressSequentially("1");

        const options = popover(page).getByRole("option");
        await expect(options.first()).toBeVisible();
        expect(await options.count()).toBeGreaterThanOrEqual(8);

        // The ID differs across run, so let's only do one assertion here.
        await expect(
          popover(page).getByRole("option", { name: "1", exact: true }),
        ).toBeAttached();
      });
    });

    // Needs its own test case, as the RLS selected table and columns
    // are only populated when the user goes through the "Select data" step
    // in the UI. Without it, the data permissions description won't show.
    test("shows RLS data permissions description in summary", async ({
      page,
      mb,
    }) => {
      skipUnlessQaDb();

      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await page.goto("/admin/embedding/setup-guide/permissions");

      // enable tenants and create shared collection
      await main(page)
        .getByRole("button", {
          name: "Enable tenants and create shared collection",
          exact: true,
        })
        .click();

      // wait for tenants to be enabled
      await expect(
        icon(stepListItem(page, "Enable multi-tenant user strategy"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });

      // complete the move-dashboard step
      await main(page)
        .getByRole("button", { name: "Create a sample dashboard", exact: true })
        .click();

      // use row and column level security
      await main(page)
        .getByRole("radio", { name: /Row and column level security/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use row and column level security",
          exact: true,
        })
        .click();

      // pick Orders table and User ID column
      await main(page).getByText("Pick a table", { exact: true }).click();
      await miniPicker(page)
        .getByText(NON_SAMPLE_DB_NAME, { exact: true })
        .click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();

      await main(page).getByPlaceholder("Pick a column", { exact: true }).click();
      await popover(page).getByText("User ID", { exact: true }).click();

      const graphPut = page.waitForResponse(isPermissionsGraphPut);
      await main(page).getByRole("button", { name: "Next", exact: true }).click();
      await graphPut;

      // navigate to create tenants step
      await stepListItem(page, "Create tenants").click();

      // should show dynamic description with the selected column name
      await expect(
        main(page)
          .getByText(/Enter a value that matches the User ID column\./)
          .first(),
      ).toBeVisible();

      // fill out the tenant form
      await main(page)
        .getByPlaceholder("Tenant name", { exact: true })
        .fill("Acme Corp");
      await main(page).getByPlaceholder("e.g. 1", { exact: true }).fill("42");
      await main(page)
        .getByPlaceholder("tenant-slug", { exact: true })
        .fill("acme-corp");

      await main(page)
        .getByRole("button", { name: "Create tenants", exact: true })
        .click();

      // success toast should show
      await expect(
        undoToast(page).getByText("Tenants created successfully", {
          exact: true,
        }),
      ).toBeVisible();

      // data permissions description should show in summary
      await expect(
        main(page)
          .getByText(
            /All users in Acme Corp can view rows in the Orders table where User ID field equals 42\./,
          )
          .first(),
      ).toBeVisible();
    });

    test("should create sandboxes for multiple tables via row-level security setup", async ({
      page,
      mb,
    }) => {
      skipUnlessQaDb();

      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await page.goto("/admin/embedding/setup-guide/permissions");

      // steps 3, 4, and 5 should be locked initially
      const selectData = stepListItem(page, "Select data to make available");
      await expect(selectData).toBeVisible();
      await expect(icon(selectData, "lock")).toHaveCount(1);
      await expect(
        icon(stepListItem(page, "Create tenants"), "lock"),
      ).toHaveCount(1);
      await expect(icon(stepListItem(page, "Summary"), "lock")).toHaveCount(1);

      await main(page)
        .getByRole("button", {
          name: "Enable tenants and create shared collection",
          exact: true,
        })
        .click();

      // wait for tenants to be enabled
      await expect(
        icon(stepListItem(page, "Enable multi-tenant user strategy"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });

      // complete the move-dashboard step
      await main(page)
        .getByRole("button", { name: "Create a sample dashboard", exact: true })
        .click();

      await main(page)
        .getByRole("radio", { name: /Row and column level security/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use row and column level security",
          exact: true,
        })
        .click();

      // pick first table and column
      await main(page).getByText("Pick a table", { exact: true }).click();

      // Our analytics should be hidden in the table picker
      await expect(
        miniPicker(page).getByText(NON_SAMPLE_DB_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        miniPicker(page).getByText("Our analytics", { exact: true }),
      ).toHaveCount(0);
      // Sample Database should be hidden in the table picker
      await expect(
        miniPicker(page).getByText("Sample Database", { exact: true }),
      ).toHaveCount(0);

      await miniPicker(page)
        .getByText(NON_SAMPLE_DB_NAME, { exact: true })
        .click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();

      await main(page).getByPlaceholder("Pick a column", { exact: true }).click();
      await popover(page).getByText("User ID", { exact: true }).click();

      // pick second table and column
      await main(page).getByText("Add table", { exact: true }).click();
      await main(page)
        .getByText("Pick a table", { exact: true })
        .first()
        .click();

      await miniPicker(page)
        .getByText(NON_SAMPLE_DB_NAME, { exact: true })
        .click();

      // orders should be hidden as it's already selected
      await expect(
        miniPicker(page).getByText("People", { exact: true }),
      ).toBeVisible();
      await expect(
        miniPicker(page).getByText("Orders", { exact: true }),
      ).toHaveCount(0);

      await miniPicker(page).getByText("People", { exact: true }).click();

      await expect(
        main(page).getByPlaceholder("Pick a column", { exact: true }),
      ).toHaveCount(2);
      await main(page)
        .getByPlaceholder("Pick a column", { exact: true })
        .last()
        .click();

      await popover(page).getByText("ID", { exact: true }).click();

      // create sandbox
      const graphPut = page.waitForResponse(isPermissionsGraphPut);
      await main(page).getByRole("button", { name: "Next", exact: true }).click();

      // wait for sandbox creation to complete
      await graphPut;

      // ANCHOR (measured): the retrying `toHaveCount(0)` below is satisfied at
      // the FIRST absent observation, which lands before the toast paints —
      // verified by fulfilling this PUT with a 500 and watching the assertion
      // sail past a toast that `toHaveCount(1)` then found. Upstream's
      // `should("not.exist")` has the identical first-absent semantics, so
      // this is a faithful port of a vacuous assertion; gate it on the
      // success signal the same submit produces so it means something.
      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });
      // no error toast should appear
      await expect(undoToast(page)).toHaveCount(0);

      // We verify permissions via API rather than UI because:
      // 1. The admin permissions UI is complex and would add significant test time
      // 2. This test focuses on the onboarding flow, not the permissions UI
      const ordersTableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "orders",
      });
      const peopleTableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "people",
      });

      const policies = (await (await mb.api.get("/api/mt/gtap")).json()) as {
        table_id: number;
        attribute_remappings: Record<string, unknown>;
      }[];
      expect(policies.length).toBeGreaterThanOrEqual(2);

      const orderPolicy = policies.find(
        (policy) => policy.table_id === ordersTableId,
      );
      const peoplePolicy = policies.find(
        (policy) => policy.table_id === peopleTableId,
      );

      expect(orderPolicy).toBeDefined();
      expect(peoplePolicy).toBeDefined();

      expect(orderPolicy?.attribute_remappings).toHaveProperty(
        "organization_id",
      );
      expect(peoplePolicy?.attribute_remappings).toHaveProperty(
        "organization_id",
      );

      const graph = (await (
        await mb.api.get(
          `/api/permissions/graph/group/${ALL_EXTERNAL_USERS_GROUP_ID}`,
        )
      ).json()) as {
        groups: Record<string, Record<string, Record<string, unknown>>>;
      };

      const permissions =
        graph.groups[ALL_EXTERNAL_USERS_GROUP_ID][WRITABLE_DB_ID];
      expect(permissions).toBeDefined();

      expect((permissions["view-data"] as Record<string, unknown>).public).toEqual(
        {
          [ordersTableId]: "sandboxed",
          [peopleTableId]: "sandboxed",
        },
      );

      expect(
        (permissions["create-queries"] as Record<string, unknown>).public,
      ).toEqual({
        [ordersTableId]: "query-builder",
        [peopleTableId]: "query-builder",
      });

      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });
    });

    test("should update existing sandboxes when changing column selection", async ({
      page,
      mb,
    }) => {
      skipUnlessQaDb();

      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      // We use API setup here instead of clicking through the UI because:
      // 1. This test verifies the UPDATE flow (not CREATE), which requires a
      //    sandbox to already exist
      // 2. The sandbox can only be created after tenants are enabled (which
      //    creates the all-external-users group)
      // 3. Using API calls is cleaner for test data preparation than clicking
      //    through UI twice
      await mb.api.updateSetting("use-tenants", true);

      // create shared collection with a dashboard
      const collection = (await (
        await mb.api.post("/api/collection", {
          name: "Shared collection",
          parent_id: null,
          namespace: "shared-tenant-collection",
        })
      ).json()) as { id: number };
      await createDashboard(mb.api, {
        name: "Test Dashboard",
        collection_id: collection.id,
      });

      // create an existing sandbox for Orders table via API
      const ordersTableId = await getTableId(mb.api, {
        databaseId: WRITABLE_DB_ID,
        name: "orders",
      });
      const userIdFieldId = await getFieldId(mb.api, {
        tableId: ordersTableId,
        name: "user_id",
      });
      const productIdFieldId = await getFieldId(mb.api, {
        tableId: ordersTableId,
        name: "product_id",
      });

      const groups = (await (
        await mb.api.get("/api/permissions/group")
      ).json()) as { id: number; magic_group_type: string }[];
      const allExternalUsersGroup = groups.find(
        (group) => group.magic_group_type === "all-external-users",
      );

      await mb.api.post("/api/mt/gtap", {
        table_id: ordersTableId,
        group_id: allExternalUsersGroup?.id,
        card_id: null,
        attribute_remappings: {
          organization_id: ["dimension", ["field", userIdFieldId, null]],
        },
      });

      await page.goto("/admin/embedding/setup-guide/permissions");

      // wait for checklist data to load before interacting with steps
      await expect(
        stepListItem(page, /Enable multi-tenant user strategy/),
      ).toHaveAttribute("data-completed", "true", { timeout: 10_000 });

      // open the data segregation strategy step
      await main(page)
        .getByText("Which data segregation strategy does your database use?", {
          exact: true,
        })
        .click();

      // select row and column level security strategy
      await main(page)
        .getByRole("radio", { name: /Row and column level security/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use row and column level security",
          exact: true,
        })
        .click();

      // Select the same Orders table
      await main(page).getByText("Pick a table", { exact: true }).click();
      await miniPicker(page)
        .getByText(NON_SAMPLE_DB_NAME, { exact: true })
        .click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();

      // select Product ID column instead of User ID
      await main(page).getByPlaceholder("Pick a column", { exact: true }).click();
      await popover(page).getByText("Product ID", { exact: true }).click();

      const graphPut = page.waitForResponse(isPermissionsGraphPut);
      await main(page).getByRole("button", { name: "Next", exact: true }).click();

      // wait for sandbox update to complete
      await graphPut;

      // ANCHOR (measured): the retrying `toHaveCount(0)` below is satisfied at
      // the FIRST absent observation, which lands before the toast paints —
      // verified by fulfilling this PUT with a 500 and watching the assertion
      // sail past a toast that `toHaveCount(1)` then found. Upstream's
      // `should("not.exist")` has the identical first-absent semantics, so
      // this is a faithful port of a vacuous assertion; gate it on the
      // success signal the same submit produces so it means something.
      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });
      // error toast should not appear
      await expect(undoToast(page)).toHaveCount(0);

      // sandbox should be updated and not created
      const policies = (await (await mb.api.get("/api/mt/gtap")).json()) as {
        table_id: number;
        attribute_remappings: Record<string, [string, [string, number, null]]>;
      }[];

      const orderPolicies = policies.filter(
        (policy) => policy.table_id === ordersTableId,
      );

      // should only have one sandbox for Orders table
      expect(orderPolicies).toHaveLength(1);

      const [orderPolicy] = orderPolicies;
      const tenantFieldRef = orderPolicy.attribute_remappings.organization_id;

      expect(tenantFieldRef[1][1]).toBe(productIdFieldId);

      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });
    });

    test("should block schemas without selected tables in RLS setup", async ({
      page,
      mb,
    }) => {
      // @external in upstream — needs the writable QA postgres container.
      skipUnlessQaDb();
      test.slow();

      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      // reset "multi_schema" fixture: creates Domestic and Wild schemas, each
      // with tables
      await resetMultiSchemaTable();
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });

      await page.goto("/admin/embedding/setup-guide/permissions");

      // enable tenants and create shared collection
      await main(page)
        .getByRole("button", {
          name: "Enable tenants and create shared collection",
          exact: true,
        })
        .click();

      // wait for tenants to be enabled
      await expect(
        icon(stepListItem(page, "Enable multi-tenant user strategy"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });

      // complete the move-dashboard step
      await main(page)
        .getByRole("button", { name: "Create a sample dashboard", exact: true })
        .click();

      // select RLS strategy
      await main(page)
        .getByRole("radio", { name: /Row and column level security/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use row and column level security",
          exact: true,
        })
        .click();

      // pick a table from the Domestic schema of the Postgres database
      await main(page).getByText("Pick a table", { exact: true }).click();
      await miniPicker(page)
        .getByText("Writable Postgres12", { exact: true })
        .click();
      await miniPicker(page).getByText("Domestic", { exact: true }).click();
      await miniPicker(page).getByText("Animals", { exact: true }).click();

      // pick Score column as the tenant filter field
      await main(page).getByPlaceholder("Pick a column", { exact: true }).click();
      await popover(page).getByText("Score", { exact: true }).click();

      // create sandbox
      const graphPut = page.waitForResponse(isPermissionsGraphPut);
      await main(page).getByRole("button", { name: "Next", exact: true }).click();

      // wait for sandbox creation to complete
      await graphPut;

      // ANCHOR (measured): the retrying `toHaveCount(0)` below is satisfied at
      // the FIRST absent observation, which lands before the toast paints —
      // verified by fulfilling this PUT with a 500 and watching the assertion
      // sail past a toast that `toHaveCount(1)` then found. Upstream's
      // `should("not.exist")` has the identical first-absent semantics, so
      // this is a faithful port of a vacuous assertion; gate it on the
      // success signal the same submit produces so it means something.
      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });
      // no error toast should appear
      await expect(undoToast(page)).toHaveCount(0);

      // verify schemas without selected tables are blocked
      const graph = (await (
        await mb.api.get(
          `/api/permissions/graph/group/${ALL_EXTERNAL_USERS_GROUP_ID}`,
        )
      ).json()) as {
        groups: Record<string, Record<string, Record<string, unknown>>>;
      };

      const permissions =
        graph.groups[ALL_EXTERNAL_USERS_GROUP_ID][WRITABLE_DB_ID];
      expect(permissions).toBeDefined();

      const viewData = permissions["view-data"] as Record<string, unknown>;
      expect(viewData).toBeDefined();

      // Domestic schema should have granular per-table permissions
      expect(typeof viewData["Domestic"]).toBe("object");
      const domesticTableIds = Object.keys(
        viewData["Domestic"] as Record<string, unknown>,
      );
      expect(domesticTableIds.length).toBeGreaterThanOrEqual(1);

      // At least one table should be sandboxed (the Animals table we selected)
      const domesticValues = Object.values(
        viewData["Domestic"] as Record<string, unknown>,
      );
      expect(domesticValues).toContain("sandboxed");

      // Wild schema should be blocked (it has no selected tables)
      expect(viewData["Wild"]).toBe("blocked");

      // create-queries should allow query-builder for Domestic,
      // and be "no" for Wild (cascaded from blocked view-data)
      const createQueries = permissions["create-queries"] as Record<
        string,
        unknown
      >;
      expect(createQueries["Domestic"]).toBe("query-builder");
      expect(createQueries["Wild"]).toBe("no");

      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });
    });

    test("locks the production embed step when JWT is not enabled", async ({
      page,
      mb,
    }) => {
      await page.goto("/admin/embedding/setup-guide");

      // jwt should be disabled by default
      expect(
        (await (await mb.api.get("/api/session/properties")).json())[
          "jwt-enabled"
        ],
      ).toBe(false);

      const card = hubCard(page, "Embed in production with SSO");
      await expect(card).toBeVisible();
      await expect(
        icon(closestButton(card), "lock").filter({ visible: true }).first(),
      ).toBeVisible();

      await expect(
        hubStep(page, "Embed in production with SSO").getByText(
          "Complete the other steps to unlock",
          { exact: true },
        ),
      ).toBeVisible();
    });
  });

  test.describe("connection impersonation step", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await mb.api.updateSetting("use-tenants", true);

      const collection = (await (
        await mb.api.post("/api/collection", {
          name: "Shared collection",
          namespace: "shared-tenant-collection",
        })
      ).json()) as { id: number };
      await createDashboard(mb.api, {
        name: "Test Dashboard",
        collection_id: collection.id,
      });
    });

    test("should configure connection impersonation for selected databases", async ({
      page,
      mb,
    }) => {
      skipUnlessQaDb();
      test.slow();

      const postgresId = await addPostgresDatabase(mb.api, "QA Postgres12");

      await page.goto("/admin/embedding/setup-guide/permissions");

      await main(page)
        .getByRole("radio", { name: /Connection impersonation/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use connection impersonation",
          exact: true,
        })
        .click();

      // select database
      await main(page)
        .getByPlaceholder("Pick a database", { exact: true })
        .click();
      await popover(page).getByText("QA Postgres12", { exact: true }).click();

      // database should be selected in the multi-select pill
      await expect(
        main(page).getByLabel("Remove", { exact: true }),
      ).toHaveCount(1);
      await expect(
        main(page).getByText("QA Postgres12", { exact: true }),
      ).toBeVisible();

      // setup connection impersonation for the database
      await main(page)
        .getByRole("button", { name: "Next", exact: true })
        .click();

      // step should be marked as complete
      await expect(
        icon(stepListItem(page, "Select data to make available"), "check"),
      ).toHaveCount(1, { timeout: 10_000 });

      // connection impersonation policy should be created
      const policies = (await (
        await mb.api.get("/api/ee/advanced-permissions/impersonation")
      ).json()) as { db_id: number; attribute: string }[];
      expect(policies.length).toBeGreaterThanOrEqual(1);

      const postgresPolicy = policies.find(
        (policy) => policy.db_id === postgresId,
      );
      expect(postgresPolicy).toBeDefined();
      expect(postgresPolicy?.attribute).toBe("database_role");

      // permission graph should have impersonated view-data
      const graph = (await (
        await mb.api.get(
          `/api/permissions/graph/group/${ALL_EXTERNAL_USERS_GROUP_ID}`,
        )
      ).json()) as {
        groups: Record<string, Record<string, Record<string, unknown>>>;
      };

      const permissions = graph.groups[ALL_EXTERNAL_USERS_GROUP_ID][postgresId];
      expect(permissions).toBeDefined();
      expect(permissions["view-data"]).toBe("impersonated");
      expect(permissions["create-queries"]).toBe("query-builder");
    });

    test("should show 'no compatible databases' message when only Sample Database exists", async ({
      page,
    }) => {
      await page.goto("/admin/embedding/setup-guide/permissions");

      // select connection impersonation strategy
      await main(page)
        .getByRole("radio", { name: /Connection impersonation/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use connection impersonation",
          exact: true,
        })
        .click();

      await expect(
        main(page).getByText(
          "None of your databases support connection impersonation. Pick a different data segregation strategy in the previous step, or connect a new database in the Database settings before proceeding. Metabase connects to more than 15 popular databases.",
          { exact: true },
        ),
      ).toBeVisible();

      // should show add database button
      await expect(
        main(page).getByRole("link", { name: "Add database", exact: true }),
      ).toHaveAttribute("href", "/admin/databases/create");
    });

    test("should show disabled database with tooltip when database does not support connection impersonation", async ({
      page,
      mb,
    }) => {
      skipUnlessQaDb();
      test.slow();

      await addPostgresDatabase(mb.api, "QA Postgres12");

      await page.goto("/admin/embedding/setup-guide/permissions");

      await main(page)
        .getByRole("radio", { name: /Connection impersonation/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use connection impersonation",
          exact: true,
        })
        .click();

      // open the database picker dropdown
      await main(page)
        .getByPlaceholder("Pick a database", { exact: true })
        .click();

      const sampleOption = popover(page).getByText("Sample Database", {
        exact: true,
      });
      await expect(sampleOption).toBeVisible();

      // sample database should have the info icon (does not support connection
      // impersonation)
      await expect(icon(sampleOption.locator(".."), "info")).toHaveCount(1);

      const postgresOption = popover(page).getByText("QA Postgres12", {
        exact: true,
      });
      await expect(postgresOption).toBeVisible();

      // postgres should not have the info icon (supports connection
      // impersonation)
      await expect(icon(postgresOption.locator(".."), "info")).toHaveCount(0);

      // clicking disabled database should not close dropdown
      await sampleOption.click({ force: true });
      await expect(popover(page)).toBeVisible();

      // hover over the info icon to see tooltip
      await icon(sampleOption.locator(".."), "info").dispatchEvent(
        "mouseenter",
      );

      await expect(
        tooltip(page).getByText(
          "This database doesn't support connection impersonation",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("creates a tenant with database_role attribute when using connection impersonation", async ({
      page,
      mb,
    }) => {
      await page.goto("/admin/embedding/setup-guide/permissions");

      // select connection impersonation strategy
      await main(page)
        .getByRole("radio", { name: /Connection impersonation/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use connection impersonation",
          exact: true,
        })
        .click();

      // navigate to create tenants step
      await stepListItem(page, "Create tenants").click();

      // fill out the tenant form
      await main(page)
        .getByPlaceholder("Tenant name", { exact: true })
        .fill("Acme Corp");
      await main(page)
        .getByPlaceholder("tenant_role", { exact: true })
        .fill("acme_role");
      await main(page)
        .getByPlaceholder("tenant-slug", { exact: true })
        .fill("acme-corp");

      await main(page)
        .getByRole("button", { name: "Create tenants", exact: true })
        .click();

      // success toast should show
      await expect(
        undoToast(page).getByText("Tenants created successfully", {
          exact: true,
        }),
      ).toBeVisible();

      // tenant should have database_role attribute
      const tenants = (await (await mb.api.get("/api/ee/tenant")).json())
        .data as { slug: string; attributes: Record<string, string> }[];
      const tenantBySlug = tenants.find((tenant) => tenant.slug === "acme-corp");
      expect(tenantBySlug?.attributes).toEqual({ database_role: "acme_role" });

      // data permissions description should show in summary
      await expect(
        main(page)
          .getByText(
            /All users in Acme Corp will connect using the acme_role database role\./,
          )
          .first(),
      ).toBeVisible();
    });

    test("reopens the create tenants step after changing the segregation strategy", async ({
      page,
      mb,
    }) => {
      skipUnlessQaDb();
      test.slow();

      await addPostgresDatabase(mb.api, "QA Postgres12");

      // pre-complete RLS and create a tenant
      await sandboxTable(mb.api, {
        table_id: STATIC_ORDERS_ID,
        group_id: ALL_EXTERNAL_USERS_GROUP_ID,
      });
      await mb.api.post("/api/ee/tenant", {
        name: "Legacy Tenant",
        slug: "legacy-tenant",
        attributes: { organization_id: "legacy-org" },
      });

      await page.goto("/admin/embedding/setup-guide/permissions");

      // wait for checklist to load and page to settle on the summary step
      await expect(stepListItem(page, "Summary")).toHaveAttribute(
        "aria-current",
        "step",
        { timeout: 10_000 },
      );

      // reopen the strategy step and switch to connection impersonation
      await stepListItem(
        page,
        "Which data segregation strategy does your database use?",
      ).click();

      await main(page)
        .getByRole("radio", { name: /Connection impersonation/ })
        .click();

      await main(page)
        .getByRole("button", {
          name: "Use connection impersonation",
          exact: true,
        })
        .click();

      // complete the new select-data step
      await main(page)
        .getByPlaceholder("Pick a database", { exact: true })
        .click();
      await popover(page).getByText("QA Postgres12", { exact: true }).click();

      const graphPut = page.waitForResponse(isPermissionsGraphPut);
      await main(page)
        .getByRole("button", { name: "Next", exact: true })
        .click();
      await graphPut;

      // create tenants should reopen instead of skipping to summary
      await expect(stepListItem(page, "Create tenants")).toHaveAttribute(
        "aria-current",
        "step",
        { timeout: 10_000 },
      );

      await expect(stepListItem(page, "Summary")).not.toHaveAttribute(
        "aria-current",
        "step",
      );

      // creating a new tenant should go to summary
      await main(page)
        .getByPlaceholder("Tenant name", { exact: true })
        .fill("Acme Corp");
      await main(page)
        .getByPlaceholder("tenant_role", { exact: true })
        .fill("acme_role");
      await main(page)
        .getByPlaceholder("tenant-slug", { exact: true })
        .fill("acme-corp");

      await main(page)
        .getByRole("button", { name: "Create tenants", exact: true })
        .click();

      await expect(
        undoToast(page).getByText("Tenants created successfully", {
          exact: true,
        }),
      ).toBeVisible();

      await expect(stepListItem(page, "Summary")).toHaveAttribute(
        "aria-current",
        "step",
        { timeout: 10_000 },
      );

      await expect(
        main(page)
          .getByText(
            /All users in Acme Corp will connect using the acme_role database role\./,
          )
          .first(),
      ).toBeVisible();
    });
  });

  test.describe("database routing create tenants step", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");

      await mb.api.updateSetting("use-tenants", true);

      const collection = (await (
        await mb.api.post("/api/collection", {
          name: "Shared collection",
          namespace: "shared-tenant-collection",
        })
      ).json()) as { id: number };
      await createDashboard(mb.api, {
        name: "Test Dashboard",
        collection_id: collection.id,
      });
    });

    test("creates a tenant with database_slug attribute when using database routing", async ({
      page,
      mb,
    }) => {
      await page.goto("/admin/embedding/setup-guide/permissions");

      // select database routing strategy
      await main(page)
        .getByRole("radio", { name: /Database routing/ })
        .click();

      await main(page)
        .getByRole("button", { name: "Use database routing", exact: true })
        .click();

      // navigate to create tenants step
      await stepListItem(page, "Create tenants").click();

      // fill out the tenant form
      await main(page)
        .getByPlaceholder("Tenant name", { exact: true })
        .fill("Acme Corp");
      await main(page)
        .getByPlaceholder("tenant-db-slug", { exact: true })
        .fill("acme-db");
      await main(page)
        .getByPlaceholder("tenant-slug", { exact: true })
        .fill("acme-corp");

      await main(page)
        .getByRole("button", { name: "Create tenants", exact: true })
        .click();

      // success toast should show
      await expect(
        undoToast(page).getByText("Tenants created successfully", {
          exact: true,
        }),
      ).toBeVisible();

      // tenant should have database_slug attribute
      const tenants = (await (await mb.api.get("/api/ee/tenant")).json())
        .data as { slug: string; attributes: Record<string, string> }[];
      const tenantBySlug = tenants.find((tenant) => tenant.slug === "acme-corp");
      expect(tenantBySlug?.attributes).toEqual({ database_slug: "acme-db" });

      // data permissions description should show in summary
      await expect(
        main(page)
          .getByText(
            /All users in Acme Corp will be routed to the acme-db database\./,
          )
          .first(),
      ).toBeVisible();
    });
  });

  test.describe("sso setup sub-checklist", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("setup");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-cloud");
    });

    test("disables the Enable JWT button when IdP URI is empty", async ({
      page,
    }) => {
      await page.goto("/admin/embedding/setup-guide/sso");

      const uri = page.getByLabel(/JWT Identity Provider URI/i);
      await expect(uri).toBeVisible();
      // Upstream asserts `should("be.empty")`, which chai-jquery resolves to
      // "no child nodes" — vacuously true of an <input>. The intent is an
      // empty value, so assert that.
      await expect(uri).toHaveValue("");

      await expect(
        main(page).getByRole("button", {
          name: "Enable JWT authentication and continue",
          exact: true,
        }),
      ).toBeDisabled();
    });

    test("can configure JWT auth and complete SSO setup", async ({
      page,
      mb,
    }) => {
      await page.goto("/admin/embedding/setup-guide/sso");

      // no steps should be completed initially
      const uri = main(page).getByLabel(/JWT Identity Provider URI/i);
      await expect(uri).toBeVisible();
      await expect(icon(main(page), "check")).toHaveCount(0);

      // step 1: enable JWT
      await uri.fill("https://jwt.example.com/auth");

      await main(page)
        .getByRole("button", {
          name: "Enable JWT authentication and continue",
          exact: true,
        })
        .click();

      // step 1 should be complete
      await expect(
        stepListItem(page, "Set up JWT authentication"),
      ).toHaveAttribute("data-completed", "true");

      // JWT should be enabled
      const properties = (await (
        await mb.api.get("/api/session/properties")
      ).json()) as Record<string, unknown>;
      expect(properties["jwt-enabled"]).toBe(true);
      expect(properties["jwt-identity-provider-uri"]).toBe(
        "https://jwt.example.com/auth",
      );
      expect(properties["jwt-group-sync"]).toBe(true);

      // valid signing key should be shown
      await expect(
        main(page)
          .getByText(
            /This example code for Node\.js sets up an endpoint using Express/,
          )
          .first(),
      ).toBeVisible();

      // express.js code snippet should be shown inline
      // (cy.contains is a case-sensitive substring on the first match)
      await expect(
        main(page).getByText(/METABASE_JWT_SHARED_SECRET/).first(),
      ).toBeAttached();
      await expect(
        main(page).getByText(/METABASE_INSTANCE_URL/).first(),
      ).toBeAttached();

      await main(page)
        .getByRole("button", { name: "Next", exact: true })
        .click();

      // step 2 should be complete
      await expect(
        stepListItem(page, "Add a new endpoint to your app"),
      ).toHaveAttribute("data-completed", "true");

      // step 3: confirm login works
      await expect(
        main(page).getByText("Try logging in with SSO. Did it work?", {
          exact: true,
        }),
      ).toBeVisible();

      await main(page)
        .getByRole("link", { name: "Log in works, I'm done", exact: true })
        .click();

      // should go back to setup guide
      await expect
        .poll(() => page.url())
        .toContain("/admin/embedding/setup-guide");
      await expect.poll(() => page.url()).not.toContain("/sso");

      // 'Configure SSO' card should be marked as done
      await expect(
        hubStep(page, "Configure SSO").getByText("Done", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // 'Embed in production with SSO' should now be unlocked
      const card = hubCard(page, "Embed in production with SSO");
      await expect(card).toBeVisible();
      await expect(icon(closestButton(card), "lock")).toHaveCount(0);
    });
  });

  test("shows /help-premium troubleshooting link for pro-cloud plan in sso setup", async ({
    page,
    mb,
  }) => {
    await mb.restore("setup");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-cloud");

    // enable JWT
    await mb.api.put("/api/setting", {
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "https://jwt.example.com/auth",
      "jwt-shared-secret": "0".repeat(64),
    });

    await page.goto("/admin/embedding/setup-guide/sso");

    // step 1 should be marked as done
    await expect(
      stepListItem(page, "Set up JWT authentication"),
    ).toHaveAttribute("data-completed", "true", { timeout: 10_000 });

    // navigate to step 3
    await stepListItem(
      page,
      "Test that JWT authentication is working correctly",
    ).click();

    // click troubleshooting button
    await main(page)
      .getByRole("button", { name: "No, I couldn't log in", exact: true })
      .click();

    // troubleshooting view should be shown
    await expect(
      main(page).getByText("Troubleshooting", { exact: true }),
    ).toBeVisible();

    // help link should point to /help-premium
    await expect(
      main(page).getByRole("link", {
        name: "Contact customer support",
        exact: true,
      }),
    ).toHaveAttribute("href", /metabase\.com\/help-premium/);
  });
});
