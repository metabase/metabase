/**
 * Port of
 * e2e/test/scenarios/organization/entity-picker-shared-tenant-collection.cy.spec.ts
 *
 * The entity picker showing the shared-tenant-collection virtual root
 * ("Shared collections"): tenant setup, visibility/selection of tenant
 * collections across the move / save / add-to-dashboard / question-picker flows.
 *
 * EE token gate — use-tenants + the shared-tenant-collection namespace are EE.
 * The jar activates the token via cypress.env.json (pro-self-hosted).
 *
 * Notes on the port:
 * - `H.activateToken` / `H.updateSetting` → `mb.api.*`.
 * - `H.popover().findByText("Move").click()` after `H.openQuestionActions()`
 *   collapses into `openQuestionActions(page, "Move")`.
 * - The entity-picker search box debounces ~300ms; do not press Enter. The one
 *   NEGATIVE search assertion is deliberately checked BEFORE the search returns
 *   (faithful to upstream's immediate should("not.exist")) — see the inline note
 *   and findings-inbox: the picker search API omits the collection namespace, so
 *   tenant collections actually leak into the results once indexed.
 * - `cy.button(name)` → getByRole("button", { name, exact }) (string → exact).
 */
import { SAMPLE_DATABASE, ORDERS_QUESTION_ID } from "../support/sample-data";
import { expect, test } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { createDashboard, createQuestion } from "../support/factories";
import { icon, modal, navigationSidebar, newButton, popover, visitDashboard, visitQuestion } from "../support/ui";
import { entityPickerModal, startNewQuestion, visualize } from "../support/notebook";
import { entityPickerModalItem, visitCollection } from "../support/question-new";
import { miniPickerBrowseAll } from "../support/joins";
import { openQuestionActions } from "../support/models";
import { openCollectionMenu } from "../support/collections-core";
import { startNewCollectionFromSidebar } from "../support/command-palette";
import { editDashboard } from "../support/dashboard";
import { openQuestionsSidebar } from "../support/revisions";
import { sidebar } from "../support/dashboard-drill";
import { createCollection, getDashboardCards } from "../support/dashboard-core";
import {
  TENANT_ROOT_NAME,
  selectTenantSubCollectionInPicker,
  setupTenantCollections,
} from "../support/entity-picker-shared-tenant-collection";

const { ORDERS_ID } = SAMPLE_DATABASE;

// EE token gate — the shared-tenant-collection namespace is an EE feature.
test.skip(!resolveToken("pro-self-hosted"), "requires the pro-self-hosted token");

test.describe(
  "scenarios > organization > entity picker > shared-tenant-collection namespace",
  () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.updateSetting("use-tenants", true);
    });

    test.describe("virtual tenant root display", () => {
      test("should display Shared collections in the entity picker when tenants are enabled", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openQuestionActions(page, "Move");

        await expect(
          entityPickerModal(page).getByText(TENANT_ROOT_NAME, { exact: true }),
        ).toBeVisible();
      });

      test("should NOT display Shared collections when tenants are disabled", async ({
        page,
        mb,
      }) => {
        await mb.api.updateSetting("use-tenants", false);

        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openQuestionActions(page, "Move");

        // Guard: wait for the collection tree to render before asserting the
        // tenant root is ABSENT, so the negative can't pass on an empty picker.
        await expect(
          entityPickerModal(page)
            .getByText("Our analytics", { exact: true })
            .first(),
        ).toBeVisible();
        await expect(
          entityPickerModal(page).getByText(TENANT_ROOT_NAME, { exact: true }),
        ).toHaveCount(0);
      });

      test("should navigate into Shared collections and see sub-collections", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openQuestionActions(page, "Move");

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();

        await expect(
          entityPickerModal(page).getByText("Test Tenant Collection", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test.describe("collection creation (allowed)", () => {
      test("should allow creating a new collection inside the tenant namespace root", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await page.goto("/collection/root");

        await startNewCollectionFromSidebar(page);

        const newCollectionModal = page.getByTestId("new-collection-modal");
        await newCollectionModal
          .getByPlaceholder(/My new fantastic collection/)
          .fill("New Collection In Tenant Root");
        await newCollectionModal
          .getByLabel(/Collection it's saved in/)
          .click();

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();
        const selectButton = entityPickerModal(page).getByRole("button", {
          name: "Select",
          exact: true,
        });
        await expect(selectButton).toBeEnabled();
        await selectButton.click();

        await newCollectionModal
          .getByRole("button", { name: "Create", exact: true })
          .click();
      });

      test("should not allow moving a collection to the tenant namespace root", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        const { id: collectionId } = await createCollection(mb.api, {
          name: "Collection To Move",
        });
        await visitCollection(page, collectionId);

        await openCollectionMenu(page);
        await popover(page).getByText("Move", { exact: true }).click();

        // Guard: tree rendered before asserting the tenant root is absent.
        await expect(
          entityPickerModal(page)
            .getByText("Our analytics", { exact: true })
            .first(),
        ).toBeVisible();
        await expect(
          entityPickerModal(page).getByText(TENANT_ROOT_NAME, { exact: true }),
        ).toHaveCount(0);

        // Close the modal
        await entityPickerModal(page)
          .getByRole("button", { name: "Cancel", exact: true })
          .click();

        // The collection should still be in Our analytics (root)
        await navigationSidebar(page)
          .getByText("Our analytics", { exact: true })
          .click();
        await expect(
          navigationSidebar(page).getByText("Collection To Move", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test.describe("dashboard restrictions", () => {
      test("should NOT allow saving a dashboard to the tenant namespace root", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await page.goto("/");

        await newButton(page).click();
        await popover(page).getByText("Dashboard", { exact: true }).click();

        await modal(page).getByLabel(/Which collection/).click();

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Select",
            exact: true,
          }),
        ).toBeDisabled();
      });

      test("should allow saving a dashboard to a sub-collection within tenant namespace", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await page.goto("/");

        await newButton(page).click();
        await popover(page).getByText("Dashboard", { exact: true }).click();

        await modal(page).getByLabel(/Which collection/).click();

        await selectTenantSubCollectionInPicker(page);

        const selectButton = entityPickerModal(page).getByRole("button", {
          name: "Select",
          exact: true,
        });
        await expect(selectButton).toBeEnabled();
        await selectButton.click();

        await modal(page)
          .getByLabel(/Name/)
          .fill("Dashboard in Tenant Collection");
        await modal(page)
          .getByRole("button", { name: "Create", exact: true })
          .click();

        await expect(page).toHaveURL(/\/dashboard\//);
      });

      test("should NOT allow moving a dashboard to the tenant namespace root", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        const dashboard = await createDashboard(mb.api, {
          name: "Dashboard to Move",
          collection_id: null,
        });
        await visitDashboard(page, mb.api, dashboard.id);

        await icon(page.getByTestId("dashboard-header"), "ellipsis").click();
        await popover(page).getByText("Move", { exact: true }).click();

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Move",
            exact: true,
          }),
        ).toBeDisabled();

        await entityPickerModal(page)
          .getByText("Test Tenant Collection", { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Move",
            exact: true,
          }),
        ).toBeEnabled();
      });
    });

    test.describe("question restrictions", () => {
      test("should NOT allow saving a question to the tenant namespace root", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await entityPickerModalItem(page, 0, "Databases").click();
        await entityPickerModalItem(page, 1, "Sample Database").click();
        await entityPickerModal(page)
          .getByText("Orders", { exact: true })
          .click();

        await visualize(page);
        await page.getByTestId("qb-save-button").click();

        await modal(page)
          .getByLabel(/Where do you want to save this/)
          .click();

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Select this collection",
            exact: true,
          }),
        ).toBeDisabled();
      });

      test("should allow saving a question to a sub-collection within tenant namespace", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await startNewQuestion(page);
        await miniPickerBrowseAll(page).click();
        await entityPickerModalItem(page, 0, "Databases").click();
        await entityPickerModalItem(page, 1, "Sample Database").click();
        await entityPickerModal(page)
          .getByText("Orders", { exact: true })
          .click();

        await visualize(page);
        await page.getByTestId("qb-save-button").click();

        await modal(page)
          .getByLabel(/Where do you want to save this/)
          .click();

        await selectTenantSubCollectionInPicker(page);

        const selectButton = entityPickerModal(page).getByRole("button", {
          name: "Select this collection",
          exact: true,
        });
        await expect(selectButton).toBeEnabled();
        await selectButton.click();

        await modal(page)
          .getByLabel(/Name/)
          .fill("Question in Tenant Collection");
        await modal(page)
          .getByRole("button", { name: "Save", exact: true })
          .click();

        await expect(page.getByTestId("qb-header")).toContainText(
          "Question in Tenant Collection",
        );
      });

      test("should NOT allow moving a question to the tenant namespace root", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openQuestionActions(page, "Move");

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Move",
            exact: true,
          }),
        ).toBeDisabled();

        await entityPickerModal(page)
          .getByText("Test Tenant Collection", { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", {
            name: "Move",
            exact: true,
          }),
        ).toBeEnabled();
      });
    });

    test.describe("search functionality", () => {
      test("should find tenant collections via search", async ({ page, mb }) => {
        await setupTenantCollections(mb.api, { waitForSearchIndex: true });
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openQuestionActions(page, "Move");

        // setupTenantCollections({ waitForSearchIndex: true }) has already made
        // the collection searchable on the exact picker endpoint, so the single
        // debounced search the picker fires returns it.
        await entityPickerModal(page)
          .getByPlaceholder(/Search/)
          .pressSequentially("Test Tenant Collection");

        await expect(
          entityPickerModal(page).getByText("Test Tenant Collection", {
            exact: true,
          }),
        ).toBeVisible();
      });

      test("should NOT show tenant collections in search when moving a non-tenant collection", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        const { id: collectionId } = await createCollection(mb.api, {
          name: "Regular Collection",
        });
        await visitCollection(page, collectionId);

        await openCollectionMenu(page);
        await popover(page).getByText("Move", { exact: true }).click();

        // Search for the tenant collection. Faithful to the Cypress original:
        // the negative assertion is checked IMMEDIATELY after typing, before the
        // debounced (~300ms) search response returns — do NOT await the search
        // here. This is a deliberately weak assertion (see the findings note): a
        // freshly-created collection is not searchable for ~1-2s, and the entity-
        // picker search API omits the collection `namespace`, so once indexed the
        // tenant collection actually DOES surface (the FE tenant filter reads a
        // namespace the search response never carries). Awaiting the response
        // would reveal that leak and fail — matching upstream means checking
        // ahead of it, exactly as `should("not.exist")` does.
        const searchInput = entityPickerModal(page).getByPlaceholder(/Search/);
        await searchInput.pressSequentially("Test Tenant Collection");

        // Tenant collection should NOT appear in search results
        await expect(
          entityPickerModal(page).getByText("Test Tenant Collection", {
            exact: true,
          }),
        ).toHaveCount(0);

        // Clear search and verify regular collections are still searchable
        await searchInput.clear();
        await searchInput.pressSequentially("First collection");
        await expect(
          entityPickerModal(page).getByText("First collection", {
            exact: true,
          }),
        ).toBeVisible();
      });
    });

    test.describe("add to dashboard flow", () => {
      test("should NOT allow creating new dashboard in tenant root via add-to-dashboard flow", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await visitQuestion(page, ORDERS_QUESTION_ID);
        await openQuestionActions(page, "Add to dashboard");

        await entityPickerModal(page)
          .getByText(TENANT_ROOT_NAME, { exact: true })
          .click();
        await expect(
          entityPickerModal(page).getByRole("button", { name: /New dashboard/ }),
        ).toBeDisabled();
      });
    });

    test.describe("dashboard edit question picker sidebar", () => {
      test("should not show shared collections when tenants are disabled", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await mb.api.updateSetting("use-tenants", false);

        const dashboard = await createDashboard(mb.api, {
          name: "Test Dashboard",
        });
        await visitDashboard(page, mb.api, dashboard.id);
        await editDashboard(page);
        await openQuestionsSidebar(page);

        await expect(
          sidebar(page).getByText(TENANT_ROOT_NAME, { exact: true }),
        ).toHaveCount(0);

        const breadcrumbs = sidebar(page).getByTestId("breadcrumbs");
        await expect(breadcrumbs).toContainText("Our analytics");
        await expect(breadcrumbs).not.toContainText("Collections");
      });

      test("should allow admins to browse shared collections via breadcrumbs and add questions", async ({
        page,
        mb,
      }) => {
        const { tenantCollectionId } = await setupTenantCollections(mb.api);

        await createQuestion(mb.api, {
          name: "Tenant Orders Question",
          collection_id: tenantCollectionId,
          query: { "source-table": ORDERS_ID },
        });

        const dashboard = await createDashboard(mb.api, {
          name: "Test Dashboard",
        });
        await visitDashboard(page, mb.api, dashboard.id);
        await editDashboard(page);
        await openQuestionsSidebar(page);

        // breadcrumb should show 'Collections' as the top level as shared
        // collections exist
        const breadcrumbs = sidebar(page).getByTestId("breadcrumbs");
        await expect(breadcrumbs).toContainText("Collections");
        await expect(breadcrumbs).toContainText("Our analytics");

        // navigate to the top level to see both namespaces
        await breadcrumbs
          .getByText("Collections", { exact: true })
          .first() // Ellipsified wraps the crumb in a Mantine Tooltip whose label duplicates the text under load; Mantine renders target-then-dropdown, so first() is the real crumb
          .click();

        await expect(
          sidebar(page).getByText("Our analytics", { exact: true }),
        ).toBeVisible();
        await expect(
          sidebar(page).getByText(TENANT_ROOT_NAME, { exact: true }),
        ).toBeVisible();

        await sidebar(page).getByText(TENANT_ROOT_NAME, { exact: true }).click();
        await expect(breadcrumbs).toContainText("Collections");
        await expect(breadcrumbs).toContainText(TENANT_ROOT_NAME);

        await sidebar(page)
          .getByText("Test Tenant Collection", { exact: true })
          .click();
        await expect(breadcrumbs).toContainText("Collections");
        await expect(breadcrumbs).toContainText(TENANT_ROOT_NAME);
        await expect(breadcrumbs).toContainText("Test Tenant Collection");

        await sidebar(page)
          .getByText("Tenant Orders Question", { exact: true })
          .click();
        await expect(getDashboardCards(page)).toHaveCount(1);
      });

      test("should show 'Collections' in breadcrumb when navigating into Our Analytics sub-collections", async ({
        page,
        mb,
      }) => {
        await setupTenantCollections(mb.api);
        await createCollection(mb.api, { name: "Our Analytics Sub" });

        const dashboard = await createDashboard(mb.api, {
          name: "Test Dashboard",
        });
        await visitDashboard(page, mb.api, dashboard.id);
        await editDashboard(page);
        await openQuestionsSidebar(page);

        const breadcrumbs = sidebar(page).getByTestId("breadcrumbs");

        // navigate to top level
        await breadcrumbs
          .getByText("Collections", { exact: true })
          .first() // Ellipsified wraps the crumb in a Mantine Tooltip whose label duplicates the text under load; Mantine renders target-then-dropdown, so first() is the real crumb
          .click();

        // navigate into Our Analytics
        await sidebar(page).getByText("Our analytics", { exact: true }).click();

        await expect(breadcrumbs).toContainText("Collections");
        await expect(breadcrumbs).toContainText("Our analytics");

        // navigate into a sub-collection under our analytics
        await sidebar(page)
          .getByText("Our Analytics Sub", { exact: true })
          .click();

        await expect(breadcrumbs).toContainText("Collections");
        await expect(breadcrumbs).toContainText("Our analytics");
        await expect(breadcrumbs).toContainText("Our Analytics Sub");
      });
    });
  },
);
