/**
 * Playwright port of e2e/test/scenarios/native/snippets.cy.spec.js
 *
 * Native SQL snippets: create/edit/insert a {{snippet:...}}, search the sidebar,
 * preview a query that has a snippet, snippet folders + permissions (EE), and
 * the read-only (git-synced) mode.
 *
 * Porting notes:
 * - The snippet form's name/content fields are plain Mantine TextInput /
 *   FormTextarea (not CodeMirror), so fill() replaces the Cypress
 *   _clearAndIterativelyTypeUsingLabel char-by-char hack (that hack existed to
 *   dodge autocomplete focus loss on the OLD input; fill() drives the value in
 *   one shot). Matches native-snippet-tags.spec.ts.
 * - cy.icon("chevrondown").click({ force: true }) in the snippet sidebar is
 *   force-clicked in Cypress because the icon is hidden until hover; here we
 *   hover the row first, then click for real (PORTING rule 4).
 * - The `.parent().parent().parent()` DOM walks around a snippet row are
 *   replaced with hover-the-name + sidebar-scoped icon clicks — same target,
 *   less brittle.
 * - @OSS-tagged describe: gated with isOssBackend (the spike jar is EE), so it
 *   is correctly SKIPPED here — mirrors the Cypress @OSS tag filtering.
 * - EE describe gated on the pro-self-hosted token (jar activates it).
 * - findByText string args are EXACT (PORTING rule 1); cy.contains is
 *   case-sensitive substring → regex.
 */
import type { Page } from "@playwright/test";

import { isOssBackend } from "../support/admin";
import { resolveToken } from "../support/api";
import { icon } from "../support/dashboard-cards";
import { createNativeQuestion } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { runNativeQuery } from "../support/models";
import {
  focusNativeEditor,
  nativeEditor,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { createSnippet } from "../support/native-extras";
import { entityPickerModal } from "../support/notebook";
import {
  collectionOnTheGoModal,
  entityPickerModalItem,
} from "../support/question-new";
import { rightSidebar } from "../support/question-saved";
import {
  ALL_USERS_GROUP,
  codeMirrorValue,
  configureGitAndPullChangesReadOnly,
  createDoublyNestedSnippet,
  createNestedSnippet,
  getPermissionsForUserGroup,
  openSnippetRow,
  setupGitSync,
  teardownGitSync,
} from "../support/snippets";
import { modal, popover } from "../support/ui";

function snippetSidebar(page: Page) {
  return page.getByTestId("sidebar-right");
}

async function saveSnippetModal(page: Page) {
  await modal(page).getByRole("button", { name: "Save", exact: true }).click();
}

test.describe("scenarios > question > snippets", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should let you create and use a snippet", async ({ page }) => {
    // Type a query and highlight some of the text
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select 'stuff'");

    for (let i = 0; i < "'stuff'".length; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
    }

    // Add a snippet of that text
    await icon(
      page.getByTestId("native-query-editor-action-buttons"),
      "snippet",
    ).click();
    await page
      .getByTestId("sidebar-content")
      .getByText("Create snippet", { exact: true })
      .click();

    await modal(page)
      .getByLabel("Give your snippet a name", { exact: true })
      .fill("stuff-snippet");
    await saveSnippetModal(page);

    // SQL editor should get updated automatically
    await expect(nativeEditor(page)).toContainText(
      "select {{snippet: stuff-snippet}}",
    );

    // Run the query and check the value
    await runNativeQuery(page);
    await expect(page.getByTestId("scalar-value")).toHaveText("stuff");
  });

  test("should let you edit snippet", async ({ mb, page }) => {
    // Re-create the snippet via API without relying on the previous test
    await mb.api.post("/api/native-query-snippet", {
      name: "stuff-snippet",
      content: "stuff",
    });

    // Populate the native editor first
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select ");

    // Insert the snippet from the sidebar
    await icon(page, "snippet").first().click();
    const sidebar = snippetSidebar(page);
    await sidebar.getByText("stuff-snippet", { exact: true }).click();

    // Open the snippet edit modal
    await sidebar.getByText("stuff-snippet", { exact: true }).hover();
    await icon(sidebar, "chevrondown").click();
    await sidebar.getByRole("button", { name: /pencil icon edit/i }).click();

    // Update the name and content
    await expect(modal(page).getByText("Editing stuff-snippet")).toBeVisible();
    await modal(page)
      .getByLabel("Enter some SQL here so you can reuse it later", {
        exact: true,
      })
      .fill("1+1");
    await modal(page)
      .getByLabel("Give your snippet a name", { exact: true })
      .fill("Math");
    await saveSnippetModal(page);

    // SQL editor should get updated automatically
    await expect(nativeEditor(page)).toContainText("select {{snippet: Math}}");

    // Run the query and check the new value
    await runNativeQuery(page);
    await expect(page.getByTestId("scalar-value")).toContainText("2");
  });

  test("should update the snippet and apply it to the current query (metabase#15387)", async ({
    mb,
    page,
  }) => {
    // Create snippet 1
    const snippet1Response = await mb.api.post("/api/native-query-snippet", {
      content: "ORDERS",
      name: "Table: Orders",
      collection_id: null,
    });
    const { id: SNIPPET_ID } = (await snippet1Response.json()) as {
      id: number;
    };

    // Create snippet 2
    await mb.api.post("/api/native-query-snippet", {
      content: "REVIEWS",
      name: "Table: Reviews",
      collection_id: null,
    });

    // Create native question using snippet 1
    const card = await createNativeQuestion(mb.api, {
      name: "15387",
      native: {
        "template-tags": {
          "snippet: Table: Orders": {
            id: "14a923c5-83a2-b359-64f7-5e287c943caf",
            name: "snippet: Table: Orders",
            "display-name": "Snippet: table: orders",
            type: "snippet",
            "snippet-name": "Table: Orders",
            "snippet-id": SNIPPET_ID,
          },
        },
        query: "select * from {{snippet: Table: Orders}} limit 1",
      },
    });
    await page.goto(`/question/${card.id}`);

    const results = page.getByTestId("query-visualization-root");
    await expect(results.getByText("37.65", { exact: true })).toBeVisible();

    await page.getByText(/Open Editor/i).click();

    // Mid-point check 1
    await expect(nativeEditor(page)).toBeVisible();
    await expect(nativeEditor(page)).toHaveText(
      "select * from {{snippet: Table: Orders}} limit 1",
    );

    // Replace "Orders" with "Reviews"
    await focusNativeEditor(page); // clicks + presses End (the "{end}")
    for (let i = 0; i < "}} limit 1".length; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    for (let i = 0; i < "Orders".length; i++) {
      await page.keyboard.press("Backspace");
    }
    await page.keyboard.type("Reviews");

    // Mid-point check 2
    await expect(nativeEditor(page)).toBeVisible();
    await expect(nativeEditor(page)).toHaveText(
      "select * from {{snippet: Table: Reviews}} limit 1",
    );

    // Rerun the query
    await runNativeQuery(page);
    await expect(results.getByText(/christ/i).first()).toBeVisible();
  });

  test("should be possible to search snippets", async ({ mb, page }) => {
    for (let i = 0; i < 16; i++) {
      await createSnippet(mb.api, { name: `snippet ${i}`, content: `select ${i}` });
    }

    await startNewNativeQuestion(page);
    await icon(page, "snippet").first().click();

    const sidebar = rightSidebar(page);
    await icon(sidebar, "search").click();
    await sidebar.getByRole("textbox").pressSequentially("snippet 14");

    await expect(sidebar.getByText("snippet 14", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("snippet 2", { exact: true })).toHaveCount(0);

    await icon(sidebar, "close").click();
    await expect(sidebar.getByText("snippet 2", { exact: true })).toBeVisible();
  });

  test("should be possible to preview a query that has a snippet in it (metabase#60534)", async ({
    mb,
    page,
  }) => {
    await mb.api.post("/api/native-query-snippet", {
      content: "'foo'",
      name: "Foo",
      collection_id: null,
    });

    await startNewNativeQuestion(page);
    await icon(page, "snippet").first().click();
    await typeInNativeEditor(page, "select {{snippet: Foo}}");
    await page
      .getByTestId("native-query-top-bar")
      .getByLabel("Preview the query")
      .click();

    await expect
      .poll(() => codeMirrorValue(modal(page)))
      .toBe("select\n  'foo'");
  });
});

test.describe("scenarios > question > snippets (OSS)", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !(await isOssBackend(mb.api)),
      "@OSS test — snippet folders behave as a flat list only on OSS",
    );
    await mb.restore();
  });

  test("should display nested snippets in a flat list", async ({ mb, page }) => {
    await createNestedSnippet(mb);

    // Open editor and sidebar
    await startNewNativeQuestion(page);
    await icon(page, "snippet").first().click();

    // Confirm snippet is not in a folder
    await expect(
      snippetSidebar(page).getByText("snippet 1", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("scenarios > question > snippets (EE)", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  for (const user of ["admin", "normal"] as const) {
    test(`${user} user can create a snippet (metabase#21581)`, async ({
      mb,
      page,
    }) => {
      const snippetCreated = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/native-query-snippet",
      );

      await mb.signIn(user);

      await startNewNativeQuestion(page);
      await icon(page, "snippet").first().click();
      await page
        .getByTestId("sidebar-content")
        .getByText("Create snippet", { exact: true })
        .click();

      await modal(page)
        .getByLabel("Enter some SQL here so you can reuse it later", {
          exact: true,
        })
        .fill("SELECT 1");
      await modal(page)
        .getByLabel("Give your snippet a name", { exact: true })
        .fill("one");
      await saveSnippetModal(page);

      await snippetCreated;

      await expect(nativeEditor(page)).toHaveText("{{snippet: one}}");

      await icon(page, "play").first().click();
      await expect(page.getByTestId("scalar-value")).toContainText("1");
    });
  }

  test("should let you create a snippet folder and move a snippet into it", async ({
    mb,
    page,
  }) => {
    await mb.signInAsAdmin();
    // create snippet via API
    await mb.api.post("/api/native-query-snippet", {
      content: "snippet 1",
      name: "snippet 1",
      collection_id: null,
    });

    await startNewNativeQuestion(page);

    // create folder
    await icon(page, "snippet").first().click();
    const sidebar = snippetSidebar(page);
    await icon(sidebar, "add").click();
    await popover(page).getByText("New folder", { exact: true }).click();
    await expect(modal(page).getByText("New collection")).toBeVisible();
    await modal(page).getByLabel("Name", { exact: true }).fill("my favorite snippets");
    await modal(page).getByText("Create", { exact: true }).click();

    // move snippet into folder
    await openSnippetRow(sidebar, "snippet 1");
    await rightSidebar(page).getByText("Edit", { exact: true }).click();

    await modal(page).getByText("SQL snippets", { exact: true }).click();
    await entityPickerModal(page)
      .getByText("my favorite snippets", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByText("Select", { exact: true })
      .click();

    const updateList = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/collection/root/items" &&
        new URL(response.url()).searchParams.get("namespace") === "snippets",
    );
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await updateList;

    // check that everything is in the right spot
    await expect(page.getByText("snippet 1", { exact: true })).toHaveCount(0);
    await rightSidebar(page)
      .getByText("my favorite snippets", { exact: true })
      .click();
    // The list re-renders while the move's refetch settles; assert on the
    // settled count so a transient duplicate/empty frame doesn't hard-fail.
    await expect(page.getByText("snippet 1", { exact: true })).toHaveCount(1);

    // via collection picker (metabase#44930)

    // Edit snippet folder
    await openSnippetRow(rightSidebar(page), "snippet 1");
    await rightSidebar(page).getByRole("button", { name: /Edit/ }).click();

    await modal(page).getByTestId("collection-picker-button").click();
    await entityPickerModal(page)
      .getByRole("button", { name: /New folder/ })
      .click();
    await collectionOnTheGoModal(page)
      .getByLabel("Give it a name", { exact: true })
      .fill("my special snippets");
    await collectionOnTheGoModal(page)
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();

    const sidebar2 = rightSidebar(page);
    await expect(sidebar2.getByText("snippet 1", { exact: true })).toHaveCount(0);
    await sidebar2.getByText("my special snippets", { exact: true }).click();
    await expect(sidebar2.getByText("snippet 1", { exact: true })).toHaveCount(1);
  });

  for (const user of ["admin", "nocollection"] as const) {
    test(`should display nested snippets in their folder (${user})`, async ({
      mb,
      page,
    }) => {
      await createNestedSnippet(mb);

      await mb.signIn(user as never);

      // Open editor and sidebar
      await startNewNativeQuestion(page);
      await icon(page, "snippet").first().click();

      // Confirm snippet is in folder
      const sidebar = rightSidebar(page);
      await sidebar.getByText("Snippet Folder", { exact: true }).click();
      await sidebar.getByText("snippet 1", { exact: true }).click();
    });
  }

  test.describe("navigation", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsNormalUser();
      await createDoublyNestedSnippet(mb.api);
    });

    test("should be possible to go back to parent folders (metabase#63405)", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await icon(page.getByTestId("native-query-top-bar"), "snippet").click();
      const sidebar = snippetSidebar(page);
      await sidebar.getByText("Folder A", { exact: true }).click();
      await sidebar.getByText("Folder B", { exact: true }).click();

      // We should reach the nested folder
      await expect(sidebar.getByText("snippet 1", { exact: true })).toBeVisible();

      await sidebar.getByText("Folder B", { exact: true }).click();
      await sidebar.getByText("Folder A", { exact: true }).click();

      // We should be back at the root folder
      await expect(sidebar.getByText("Snippets", { exact: true })).toBeVisible();
    });
  });

  test.describe("existing snippet folder", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();

      const folder = await mb.api.post("/api/collection", {
        name: "Snippet Folder",
        description: null,
        parent_id: null,
        namespace: "snippets",
      });
      const { id } = (await folder.json()) as { id: number };
      await mb.api.post("/api/collection", {
        name: "Nested snippet Folder",
        description: null,
        parent_id: id,
        namespace: "snippets",
      });
    });

    test("should not allow you to move a snippet collection into a itself or a child (metabase#44930)", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await icon(page, "snippet").first().click();

      // Edit snippet folder
      const sidebar = snippetSidebar(page);
      await sidebar.getByText("Snippet Folder", { exact: true }).hover();
      await sidebar
        .getByText("Snippet Folder", { exact: true })
        .locator("xpath=following-sibling::*")
        .locator(".Icon-ellipsis")
        .click({ force: true });

      await popover(page).getByText("Edit folder details", { exact: true }).click();
      await modal(page).getByTestId("collection-picker-button").click();

      await expect(
        entityPickerModalItem(page, 1, /Snippet Folder/),
      ).toHaveAttribute("data-disabled", "true");
    });

    test("should not display snippet folder as part of collections (metabase#14907)", async ({
      page,
    }) => {
      const collections = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/collection/root" &&
          response.request().method() === "GET",
      );
      await page.goto("/collection/root");
      await collections;

      await expect(
        page.getByText("Snippet Folder", { exact: true }),
      ).toHaveCount(0);
    });

    test("shouldn't update root permissions when changing permissions on a created folder (metabase#17268)", async ({
      mb,
      page,
    }) => {
      await startNewNativeQuestion(page);
      await icon(page, "snippet").first().click();

      // Edit permissions for a snippet folder
      const sidebar = rightSidebar(page);
      await sidebar.getByText("Snippet Folder", { exact: true }).hover();
      await sidebar
        .getByText("Snippet Folder", { exact: true })
        .locator("xpath=ancestor::*[.//button[@aria-label='Snippet folder options']][1]")
        .getByRole("button", { name: "Snippet folder options" })
        .click({ force: true });

      await popover(page).getByText("Change permissions", { exact: true }).click();

      // Update permissions for "All Users" and let them only "View" this folder
      const allUsersCell = getPermissionsForUserGroup(page, "All Users");
      await expect(allUsersCell).toContainText("Curate");
      const updatePermissions = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/collection/graph" &&
          new URL(response.url()).searchParams.get("skip-graph") === "true" &&
          response.request().method() === "PUT",
      );
      await allUsersCell.click();

      await popover(page).getByText("View", { exact: true }).click();
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();

      await updatePermissions;

      // Sanity-check the top-level (root) snippet permissions are unchanged
      await rightSidebar(page)
        .getByTestId("snippet-header-buttons")
        .locator(".Icon-ellipsis")
        .click();

      await popover(page).getByText("Change permissions", { exact: true }).click();

      // UI check
      await expect(getPermissionsForUserGroup(page, "All Users")).toContainText(
        "Curate",
      );

      // API check
      const graphResponse = await mb.api.get(
        "/api/collection/graph?namespace=snippets",
      );
      const graph = (await graphResponse.json()) as {
        groups: Record<number, { root: string }>;
      };
      expect(graph.groups[ALL_USERS_GROUP].root).toBe("write");
    });
  });
});

test.describe("scenarios > question > read-only snippets", () => {
  let syncUrl: string;

  test.beforeEach(async ({ mb }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "requires the pro-self-hosted token",
    );
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await createSnippet(mb.api, {
      name: "stuff-snippet",
      content: "select 'snippet 1'",
    });
    await mb.api.post("/api/collection", {
      name: "My favorite snippets",
      description: "the more you know",
      parent_id: null,
      namespace: "snippets",
    });
    syncUrl = setupGitSync();
    await configureGitAndPullChangesReadOnly(mb.api, syncUrl);
  });

  test.afterEach(() => {
    if (syncUrl) {
      teardownGitSync(syncUrl);
    }
  });

  test("should not let you create or edit a snippet", async ({ page }) => {
    await startNewNativeQuestion(page);
    await icon(
      page.getByTestId("native-query-editor-action-buttons"),
      "snippet",
    ).click();
    await expect(
      page.getByTestId("sidebar-content").getByText("Create snippet", {
        exact: true,
      }),
    ).toHaveCount(0);

    const sidebar = snippetSidebar(page);
    await sidebar.getByText("stuff-snippet", { exact: true }).click();
    await expect(
      sidebar.getByRole("button", { name: /pencil icon edit/i }),
    ).toHaveCount(0);
  });

  test("should not let you create or edit a snippet folder", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await icon(page, "snippet").first().click();

    // Menu that allows creating a snippet folder is not rendered
    await expect(icon(snippetSidebar(page), "add")).toHaveCount(0);

    const sidebar = snippetSidebar(page);
    await expect(
      sidebar.getByText("My favorite snippets", { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Snippet folder options" }),
    ).toHaveCount(0);
  });
});
