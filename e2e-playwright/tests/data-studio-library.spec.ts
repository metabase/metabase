/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-studio-library.cy.spec.ts
 *
 * Data Studio > library: create the library (UI + API), see it in the data
 * picker, publish tables into it, manage library collections (create / edit /
 * move / archive), move a published table, and the section empty states —
 * including the git-sync read-only variant that hides every write affordance.
 *
 * Port notes:
 * - The library is an EE token feature ("library"); the whole describe skips
 *   without `pro-self-hosted` (PORTING rule 7).
 * - `cy.intercept(...).as()` + `cy.wait()` → `page.waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2).
 * - `should("have.attr", "data-disabled")` is a presence check on a data-*
 *   attribute → one-arg `toHaveAttribute`.
 * - findByText / findByRole name strings are exact matches in testing-library
 *   (PORTING rule 1); `cy.contains`-based helpers stay case-sensitive
 *   substrings (see support/data-studio-library.ts).
 * - DIVIDEND: the "move metrics into the library" test has NO assertion at all
 *   upstream — it ends on a `Duplicate` click. Ported with a real assertion
 *   (the copy POST succeeds and the duplicate lands in the library's Metrics
 *   collection), which is also what makes it deterministic here.
 */
import { resolveToken } from "../support/api";
import {
  TRUSTED_ORDERS_METRIC,
  collectionItem,
  createCollection,
  createLibraryCollection,
  createLibraryWithItems,
  createLibraryWithTable,
  dataStudioBreadcrumbs,
  dataStudioNav,
  emptyStateRow,
  expandLibraryCollection,
  getLibraryRootCollections,
  libraryNewButton,
  libraryPage,
  libraryResult,
  librarySearchInput,
  metricMoreMenu,
  openCollectionOptions,
  openTableOptions,
  tableHeader,
  tableItem,
  tableOverviewPage,
  visitLibrary,
} from "../support/data-studio-library";
import { getProfileLink } from "../support/command-palette";
import { createQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { pickEntity } from "../support/dashboard";
import { entityPickerModal, startNewQuestion } from "../support/notebook";
import { miniPickerBrowseAll } from "../support/joins";
import { miniPickerHeader, entityPickerModalItem } from "../support/question-new";
import {
  type RemoteSyncRepo,
  configureGit,
  setupGitSync,
  teardownGitSync,
} from "../support/remote-sync";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { modal, popover, visitQuestion } from "../support/ui";
import { undoToast } from "../support/metrics";

const { ORDERS_ID } = SAMPLE_DATABASE;

const hasToken = Boolean(resolveToken("pro-self-hosted"));

test.describe("scenarios > data studio > library", () => {
  test.skip(!hasToken, "requires the pro-self-hosted EE token (library)");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should create library via UI and verify collections", async ({
    page,
    mb,
  }) => {
    // Navigate to Data Studio via the profile menu, exercising the nav path
    // (and, upstream, the data_studio_opened analytics event).
    await page.goto("/");
    await getProfileLink(page).click();
    await popover(page)
      .getByText(/Data studio/)
      .click();

    await expectUnstructuredSnowplowEvent(mb, {
      event: "data_studio_opened",
      triggered_from: "nav_menu",
    });
    await dataStudioNav(page).getByLabel("Library", { exact: true }).click();

    // Create library via the inline empty state.
    await expect(
      libraryPage(page).getByText("A source of truth for analytics", {
        exact: true,
      }),
    ).toBeVisible();

    const createLibrary = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/ee/library",
    );
    const collectionTree = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith("/api/collection/tree"),
    );
    await libraryPage(page)
      .getByText("Create my Library", { exact: true })
      .click();
    await createLibrary;
    await collectionTree;

    await expectUnstructuredSnowplowEvent(mb, {
      event: "data_studio_library_created",
    });

    await expect(collectionItem(page, "Data")).toBeVisible();
    await expect(collectionItem(page, "Metrics")).toBeVisible();
    await expect(collectionItem(page, "SQL snippets")).toBeVisible();
  });

  test("should be available in the data picker", async ({ page, mb }) => {
    await createLibraryWithItems(mb.api);

    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();

    await entityPickerModalItem(page, 0, "Library").click();
    await entityPickerModalItem(page, 1, "Data").click();
    await entityPickerModalItem(page, 2, "Orders").click();

    // Ensure that we can build the path back from a value.
    await page.getByRole("button", { name: /Orders/ }).first().click();
    await miniPickerHeader(page).click();
    await miniPickerBrowseAll(page).click();

    await expect(entityPickerModalItem(page, 0, "Library")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(entityPickerModalItem(page, 1, "Data")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(entityPickerModalItem(page, 2, "Orders")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("should let you move metrics into the library, even when empty", async ({
    page,
    mb,
  }) => {
    await mb.api.createLibrary();
    const { metricCollection } = await getLibraryRootCollections(mb.api);
    const metric = await createQuestion(mb.api, TRUSTED_ORDERS_METRIC);
    await visitQuestion(page, metric.id);

    await metricMoreMenu(page).click();
    await popover(page).getByText("Duplicate", { exact: true }).click();
    await modal(page)
      .getByTestId("dashboard-and-collection-picker-button")
      .click();

    await entityPickerModalItem(page, 0, "Library").click();
    await entityPickerModalItem(page, 1, "Metrics").click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select this collection", exact: true })
      .click();

    // DIVIDEND: upstream ends here with no assertion at all. Anchor on the copy
    // request and assert the duplicate really landed in the library's Metrics
    // collection.
    // CardCopyModal duplicates through POST /api/card (useCreateCardMutation),
    // not /api/card/:id/copy.
    const copyResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );
    await modal(page)
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    const copy = await copyResponse;
    expect(copy.status()).toBe(200);
    const copiedCard = (await copy.json()) as { collection_id: number };
    expect(copiedCard.collection_id).toBe(metricCollection.id);
  });

  test("should show the library collection even if only 1 child collection has items", async ({
    page,
    mb,
  }) => {
    await createLibraryWithTable(mb.api);

    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();

    await entityPickerModalItem(page, 0, "Library").click();
    await entityPickerModalItem(page, 1, "Data").click();
    await expect(entityPickerModalItem(page, 2, "Orders")).toHaveCount(1);
  });

  test.describe("+New button", () => {
    test("should allow you to publish a table", async ({ page, mb }) => {
      await mb.api.createLibrary();
      await visitLibrary(page);

      // Publish a table from the "New" menu.
      await libraryNewButton(page).click();
      await popover(page).getByText("Published table", { exact: true }).click();

      // Select a table and click "Publish".
      await pickEntity(page, {
        path: ["Databases", /Sample Database/, "Orders"],
        select: true,
      });

      await expect(
        modal(page).getByText("Publish to", { exact: true }),
      ).toBeVisible();
      await expect(
        modal(page).getByText("Data", { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByRole("button", { name: "Publish this table", exact: true })
        .click();

      // Verify the table is published.
      await expect(tableOverviewPage(page)).toHaveCount(1);
      await expect(
        await findByDisplayValue(tableHeader(page), "Orders"),
      ).toHaveCount(1);
      await dataStudioBreadcrumbs(page)
        .getByRole("link", { name: "Data", exact: true })
        .click();
      await expect(tableItem(page, "Orders")).toHaveCount(1);

      // Tables already published are disabled in the entity picker.
      await libraryNewButton(page).click();
      await popover(page).getByText("Published table", { exact: true }).click();
      await entityPickerModalItem(page, 1, /Sample Database/).click();
      await expect(
        entityPickerModalItem(page, 2, "Orders"),
      ).toHaveAttribute("data-disabled");
      await expect(
        entityPickerModalItem(page, 2, "People"),
      ).not.toHaveAttribute("data-disabled");
    });
  });

  test.describe("Library collection management", () => {
    test("should create a new library collection from the New button", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      await createCollection(mb.api, "Outside Library");
      await visitLibrary(page);

      await libraryNewButton(page).click();
      await popover(page).getByText("Collection", { exact: true }).click();

      await modal(page)
        .getByLabel("Name", { exact: true })
        .fill("New Library Collection");
      await expect(
        modal(page).getByTestId("collection-picker-button"),
      ).toContainText("Data");
      await modal(page).getByTestId("collection-picker-button").click();

      await expect(entityPickerModalItem(page, 0, "Library")).toBeVisible();
      await expect(entityPickerModalItem(page, 1, "Data")).toBeVisible();

      // Non-library collections are not visible.
      await expect(
        entityPickerModal(page).getByText("Our analytics", { exact: true }),
      ).toHaveCount(0);
      await expect(
        entityPickerModal(page).getByText("Outside Library", { exact: true }),
      ).toHaveCount(0);
      await entityPickerModal(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      const createCollectionResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/collection",
      );
      await modal(page)
        .getByRole("button", { name: "Create", exact: true })
        .click();
      expect((await createCollectionResponse).status()).toBe(200);

      await expect(
        collectionItem(page, "New Library Collection"),
      ).toBeVisible();
    });

    test("should edit a library collection name and description", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      const { dataCollection } = await getLibraryRootCollections(mb.api);
      await createLibraryCollection(mb.api, {
        name: "Collection Before Edit",
        description: "Original description",
        parent_id: dataCollection.id,
      });

      await visitLibrary(page);

      await openCollectionOptions(page, "Collection Before Edit");
      await popover(page)
        .getByText("Edit collection details", { exact: true })
        .click();

      await modal(page)
        .getByLabel("Name", { exact: true })
        .fill("Collection After Edit");
      await modal(page)
        .getByLabel("Description", { exact: true })
        .fill("Updated library description");

      const updateCollection = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/collection\/\d+$/.test(new URL(response.url()).pathname),
      );
      await modal(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      expect((await updateCollection).status()).toBe(200);

      await expect(collectionItem(page, "Collection After Edit")).toBeVisible();
      await expect(
        libraryPage(page).getByText("Collection Before Edit", { exact: true }),
      ).toHaveCount(0);
    });

    test("should move a library collection to another subcollection", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      const { dataCollection } = await getLibraryRootCollections(mb.api);
      await createLibraryCollection(mb.api, {
        name: "Destination Collection",
        parent_id: dataCollection.id,
      });
      await createLibraryCollection(mb.api, {
        name: "Collection To Move",
        parent_id: dataCollection.id,
      });

      await visitLibrary(page);

      await openCollectionOptions(page, "Collection To Move");
      await popover(page)
        .getByText("Edit collection details", { exact: true })
        .click();

      await modal(page).getByTestId("collection-picker-button").click();
      await expect(entityPickerModalItem(page, 1, "Metrics")).toHaveAttribute(
        "data-disabled",
      );
      await entityPickerModalItem(page, 2, "Destination Collection").click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      const updateCollection = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/collection\/\d+$/.test(new URL(response.url()).pathname),
      );
      await modal(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      expect((await updateCollection).status()).toBe(200);

      await expandLibraryCollection(page, "Destination Collection");
      const moved = libraryResult(page, "Collection To Move");
      await expect(moved).toBeVisible();
      await expect(moved).toHaveAttribute("aria-level", "3");
    });

    test("should archive a library collection and show it in trash", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      const { dataCollection } = await getLibraryRootCollections(mb.api);
      await createLibraryCollection(mb.api, {
        name: "Collection To Archive",
        parent_id: dataCollection.id,
      });

      await visitLibrary(page);

      await openCollectionOptions(page, "Collection To Archive");
      await popover(page).getByText("Archive", { exact: true }).click();

      const updateCollection = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/collection\/\d+$/.test(new URL(response.url()).pathname),
      );
      await modal(page)
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      expect((await updateCollection).status()).toBe(200);

      await expect(
        undoToast(page)
          .getByText('"Collection To Archive" has been archived', {
            exact: true,
          })
          .first(),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Collection To Archive", { exact: true }),
      ).toHaveCount(0);

      await page.goto("/trash");
      await expect(
        page.getByRole("table").getByText("Collection To Archive", {
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should move a published table to a library subcollection", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      const { dataCollection } = await getLibraryRootCollections(mb.api);
      await mb.api.publishTables({ table_ids: [ORDERS_ID] });
      await createLibraryCollection(mb.api, {
        name: "Table Destination Collection",
        parent_id: dataCollection.id,
      });

      await visitLibrary(page);

      await openTableOptions(page, "Orders");
      await popover(page).getByText("Move", { exact: true }).click();

      await expect(entityPickerModalItem(page, 1, "Metrics")).toHaveAttribute(
        "data-disabled",
      );
      await entityPickerModalItem(
        page,
        2,
        "Table Destination Collection",
      ).click();

      const updateTable = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/table\/\d+$/.test(new URL(response.url()).pathname),
      );
      await entityPickerModal(page)
        .getByRole("button", { name: "Move", exact: true })
        .click();
      expect((await updateTable).status()).toBe(200);

      await expandLibraryCollection(page, "Table Destination Collection");
      const moved = libraryResult(page, "Orders");
      await expect(moved).toBeVisible();
      await expect(moved).toHaveAttribute("aria-level", "3");
    });
  });

  test.describe("empty state", () => {
    test("should show empty states with interactions when sections are empty", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      await visitLibrary(page);

      // All sections are expanded.
      await expect(collectionItem(page, "Data")).toBeVisible();
      await expect(collectionItem(page, "Metrics")).toBeVisible();
      await expect(collectionItem(page, "SQL snippets")).toBeVisible();

      // Data section empty state.
      await expect(
        libraryPage(page).getByText(
          "Cleaned, pre-transformed data sources ready for exploring",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByRole("button", {
          name: "Publish a table",
          exact: true,
        }),
      ).toBeVisible();

      // Metrics section empty state.
      await expect(
        libraryPage(page).getByText(
          "Standardized calculations with known dimensions",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByRole("link", {
          name: "New metric",
          exact: true,
        }),
      ).toBeVisible();

      // SQL snippets section empty state.
      await expect(
        libraryPage(page).getByText(
          "Reusable bits of code that save your time",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByRole("link", {
          name: "New snippet",
          exact: true,
        }),
      ).toBeVisible();

      // "Publish a table" opens the entity picker.
      await libraryPage(page)
        .getByRole("button", { name: "Publish a table", exact: true })
        .click();
      await expect(entityPickerModal(page)).toBeVisible();
      await entityPickerModalItem(page, 1, "Sample Database").click();
      await expect(entityPickerModalItem(page, 2, "Orders")).toHaveCount(1);
      await entityPickerModal(page)
        .getByRole("button", { name: "Close", exact: true })
        .click();

      // Searching excludes the empty states.
      await librarySearchInput(page).click();
      await librarySearchInput(page).pressSequentially("Publish");
      await expect(
        libraryPage(page).getByText(
          "Cleaned, pre-transformed data sources ready for exploring",
          { exact: true },
        ),
      ).toHaveCount(0);
    });

    test("should hide empty states when items are added and keep empty sections expanded on navigation", async ({
      page,
      mb,
    }) => {
      await mb.api.createLibrary();
      await visitLibrary(page);

      await expect(
        emptyStateRow(
          page,
          "Cleaned, pre-transformed data sources ready for exploring",
        ),
      ).toBeVisible();

      // Publish a table via the +New menu.
      await libraryNewButton(page).click();
      await popover(page).getByText("Published table", { exact: true }).click();
      await entityPickerModalItem(page, 1, "Sample Database").click();
      await entityPickerModalItem(page, 2, "Orders").click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Publish", exact: true })
        .click();
      await expect(
        modal(page).getByText("Publish to", { exact: true }),
      ).toBeVisible();
      await expect(
        modal(page).getByText("Data", { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByRole("button", { name: "Publish this table", exact: true })
        .click();

      // Navigate back to the library via the breadcrumbs.
      await dataStudioBreadcrumbs(page)
        .getByRole("link", { name: "Library", exact: true })
        .click();

      await expect(tableItem(page, "Orders")).toBeVisible();

      // Metrics and SQL snippets still show their empty states.
      await expect(
        emptyStateRow(page, "Standardized calculations with known dimensions"),
      ).toBeVisible();
      await expect(
        emptyStateRow(page, "Reusable bits of code that save your time"),
      ).toBeVisible();
    });

    test.describe("read-only mode", () => {
      let repo: RemoteSyncRepo | undefined;

      test.beforeEach(async ({ mb }) => {
        repo = setupGitSync();
        await configureGit(mb.api, repo, "read-only");
        await mb.api.createLibrary();
      });

      test.afterEach(() => {
        teardownGitSync(repo);
        repo = undefined;
      });

      test("should hide +New button and empty state actions in read-only mode", async ({
        page,
      }) => {
        await visitLibrary(page);

        await expect(libraryNewButton(page)).toHaveCount(0);

        await expect(
          libraryPage(page).getByText(
            "Cleaned, pre-transformed data sources ready for exploring",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          libraryPage(page).getByRole("button", {
            name: "Publish a table",
            exact: true,
          }),
        ).toHaveCount(0);

        await expect(
          libraryPage(page).getByText(
            "Standardized calculations with known dimensions",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          libraryPage(page).getByRole("link", {
            name: "New metric",
            exact: true,
          }),
        ).toHaveCount(0);

        await expect(
          libraryPage(page).getByText(
            "Reusable bits of code that save your time",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          libraryPage(page).getByRole("link", {
            name: "New snippet",
            exact: true,
          }),
        ).toHaveCount(0);
      });
    });
  });
});
