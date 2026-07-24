/**
 * Playwright port of e2e/test/scenarios/data-studio/snippets.cy.spec.ts
 *
 * Data Studio > library > SQL snippets: create (with validation + the folder
 * picker), edit / cancel / leave-confirm, the "unsaved content survives a name
 * or description edit" case, markdown descriptions, archive + unarchive,
 * snippet folders (create / edit / archive) and breadcrumb folder expansion.
 *
 * NOT the same spec as tests/snippets.spec.ts, which ports
 * e2e/test/scenarios/native/snippets.cy.spec.js (the native-editor sidebar).
 *
 * Port notes:
 * - The whole file needs the EE `pro-self-hosted` token (data studio library +
 *   snippet folders), so the describe is token-gated (PORTING rule 7).
 * - SNOWPLOW: the upstream `beforeEach` calls `H.resetSnowplow()` and **no test
 *   asserts a single event** (there is no `expectUnstructuredSnowplowEvent` and
 *   no `expectNoBadSnowplowEvents` afterEach). Snowplow is therefore purely
 *   incidental here, so rule 6's no-op treatment applies: the reset is simply
 *   dropped. Nothing is degraded — there was nothing to degrade.
 * - `cy.intercept().as()` + `cy.wait()` → `page.waitForResponse` registered
 *   BEFORE the triggering action (PORTING rule 2).
 * - `findByText` / `findByRole({name})` string args are EXACT matches in
 *   testing-library (PORTING rule 1).
 * - The name/description fields are `EditableText` (a **textarea**), so
 *   `findByDisplayValue` goes through the shared input/textarea/select scan and
 *   blurring uses `textarea:focus`.blur(), never Tab (PORTING gotchas).
 * - `PaneHeaderActions` renders NOTHING while the form is pristine, so the
 *   Save/Cancel buttons only exist once the editor is dirty — that is why the
 *   editing tests type before looking for them.
 */
import { resolveToken } from "../support/api";
import {
  collectionItem,
  dataStudioBreadcrumbs,
  dataStudioNav,
  libraryPage,
  libraryNewButton,
  libraryResult,
  visitLibrary,
} from "../support/data-studio-library";
import {
  archivedSnippetsPage,
  blurEditableText,
  createSnippetFolder,
  editSnippetPage,
  focusSnippetEditor,
  newSnippetNameInput,
  newSnippetPage,
  snippetDescriptionInput,
  snippetEditor,
  snippetEditorValue,
  snippetHeader,
  snippetNameInput,
  snippetSaveButton,
  snippetCancelButton,
  typeInSnippetEditor,
  updateSnippet,
  visitSnippet,
  waitForCreateCollection,
  waitForCreateSnippet,
  waitForUpdateCollection,
  waitForUpdateSnippet,
} from "../support/data-studio-snippets";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { createSnippet } from "../support/native-extras";
import { entityPickerModal } from "../support/notebook";
import { icon, modal, popover } from "../support/ui";

const hasToken = Boolean(resolveToken("pro-self-hosted"));

test.describe("scenarios > data studio > snippets", () => {
  test.skip(
    !hasToken,
    "requires the pro-self-hosted EE token (data studio library + snippet folders)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    // TODO(upstream): "We likely shouldn't need to do this to access the data
    // studio library page"
    await mb.api.createLibrary();
  });

  test.describe("creation", () => {
    test("should create a new snippet with proper validation", async ({
      page,
    }) => {
      await visitLibrary(page);

      await libraryNewButton(page).click();
      await popover(page).getByText("Snippet", { exact: true }).click();

      await expect(newSnippetPage(page)).toBeVisible();
      await expect(snippetSaveButton(page)).toBeDisabled();

      await typeInSnippetEditor(page, "SELECT * FROM orders");
      await expect(snippetSaveButton(page)).toBeEnabled();

      const nameInput = await newSnippetNameInput(page);
      await nameInput.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Test snippet");
      await expect(snippetSaveButton(page)).toBeEnabled();

      await snippetDescriptionInput(page).click();
      await page.keyboard.type("This is a test snippet description");
      await snippetSaveButton(page).click();

      await expect(
        modal(page).getByText("Select a folder for your snippet", {
          exact: true,
        }),
      ).toBeVisible();
      const createSnippetResponse = waitForCreateSnippet(page);
      await modal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();
      await createSnippetResponse;

      await expect(editSnippetPage(page)).toBeVisible();
      await expect(
        editSnippetPage(page).getByText(/by Bobby Tables/),
      ).toBeVisible();

      await dataStudioNav(page)
        .getByRole("link", { name: "Library", exact: true })
        .click();
      await expect(
        libraryPage(page).getByText("Test snippet", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("editing", () => {
    test("should be able to edit snippet content", async ({ page, mb }) => {
      await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      await visitLibrary(page);

      await libraryPage(page)
        .getByText("Test snippet", { exact: true })
        .click();

      await expect(editSnippetPage(page)).toBeVisible();

      await typeInSnippetEditor(page, " WHERE id = 1");

      await expect(snippetSaveButton(page)).toBeEnabled();
      const updateResponse = waitForUpdateSnippet(page);
      await snippetSaveButton(page).click();
      await updateResponse;

      await page.reload();
      await expect(snippetEditor(page)).toContainText(
        "SELECT * FROM orders WHERE id = 1",
      );
    });

    test("should be able to cancel editing", async ({ page, mb }) => {
      await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      await visitLibrary(page);

      await libraryPage(page)
        .getByText("Test snippet", { exact: true })
        .click();

      await typeInSnippetEditor(page, " WHERE id = 1");

      await snippetCancelButton(page).click();
      await expect(snippetEditor(page)).not.toContainText(
        "SELECT * FROM orders WHERE id = 1",
      );
      await expect(snippetEditor(page)).toContainText("SELECT * FROM orders");
    });

    test("should show unsaved changes warning when navigating away", async ({
      page,
      mb,
    }) => {
      await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      await visitLibrary(page);

      await libraryPage(page)
        .getByText("Test snippet", { exact: true })
        .click();

      await typeInSnippetEditor(page, " WHERE id = 1");

      await dataStudioNav(page)
        .getByRole("link", { name: "Glossary", exact: true })
        .click();

      await expect(
        modal(page).getByText("Discard your changes?", { exact: true }),
      ).toBeVisible();
      await modal(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      await expect(editSnippetPage(page)).toBeVisible();
    });

    test("should preserve unsaved content changes when description or name is edited", async ({
      page,
      mb,
    }) => {
      // Navigate to a snippet and edit its content
      await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });
      await visitLibrary(page);
      await libraryPage(page)
        .getByText("Test snippet", { exact: true })
        .click();
      await expect(editSnippetPage(page)).toBeVisible();
      await typeInSnippetEditor(page, "1");

      // Edit its name
      await snippetNameInput(page).click();
      await page.keyboard.press("End");
      await page.keyboard.type("1");
      await blurEditableText(page);

      const nameToast = undoToast(page)
        .filter({ hasText: "Snippet name updated" })
        .first();
      await expect(nameToast).toBeVisible();
      await icon(nameToast, "close").click();
      await expect(nameToast).toHaveCount(0);

      // Edit its description
      await snippetDescriptionInput(page).click();
      await page.keyboard.type("desc");
      await blurEditableText(page);

      const descriptionToast = undoToast(page)
        .filter({ hasText: "Snippet description updated" })
        .first();
      await expect(descriptionToast).toBeVisible();
      await icon(descriptionToast, "close").click();
      await expect(descriptionToast).toHaveCount(0);

      // Verify unsaved changes are preserved
      expect(await snippetEditorValue(page)).toBe("SELECT * FROM orders1");

      // Verify Save button saves the content without reverting the name and
      // description changes
      await snippetSaveButton(page).click();
      await expect(
        undoToast(page)
          .filter({ hasText: "Snippet content updated" })
          .first(),
      ).toBeVisible();
      await expect(snippetNameInput(page)).toHaveValue("Test snippet1");
      await expect(
        editSnippetPage(page).getByText("desc", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("description", () => {
    test("should support markdown in description", async ({ page, mb }) => {
      await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
        description: "**Bold text** and *italic text*",
      });

      await visitLibrary(page);

      await libraryPage(page)
        .getByText("Test snippet", { exact: true })
        .click();
      await expect(
        editSnippetPage(page).getByText("Bold text", { exact: true }),
      ).toHaveCSS("font-weight", "700");
      await expect(
        editSnippetPage(page).getByText("italic text", { exact: true }),
      ).toHaveCSS("font-style", "italic");
    });
  });

  test.describe("archiving", () => {
    test("should be able to archive a snippet", async ({ page, mb }) => {
      await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });

      await visitLibrary(page);

      await libraryPage(page)
        .getByText("Test snippet", { exact: true })
        .click();

      await snippetHeader(page)
        .getByRole("button", { name: /Snippet menu options/ })
        .click();
      await popover(page).getByText("Archive", { exact: true }).click();

      await expect(
        modal(page).getByText("Archive snippet?", { exact: true }),
      ).toBeVisible();
      const updateResponse = waitForUpdateSnippet(page);
      await modal(page)
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      await updateResponse;

      // Archiving pushes back to the library; anchor on that page rendering so
      // the absence check below isn't satisfied by a not-yet-mounted page.
      await expect(libraryPage(page)).toBeVisible();
      await expect(
        libraryPage(page).getByText("Test snippet", { exact: true }),
      ).toHaveCount(0);
    });

    test("should be able to unarchive a snippet", async ({ page, mb }) => {
      const snippet = await createSnippet(mb.api, {
        name: "Test snippet",
        content: "SELECT * FROM orders",
      });
      // Archive snippet
      await updateSnippet(mb.api, snippet.id, { archived: true });

      await visitLibrary(page);

      await libraryPage(page)
        .getByRole("button", { name: "Snippet collection options", exact: true })
        .click();

      await popover(page)
        .getByText(/View archived snippets/)
        .click();

      await expect
        .poll(() => page.url())
        .toContain("/snippets/archived");

      await expect(
        archivedSnippetsPage(page).getByText("Test snippet", { exact: true }),
      ).toBeVisible();

      const updateResponse = waitForUpdateSnippet(page);
      await archivedSnippetsPage(page)
        .getByRole("button", { name: "Unarchive snippet", exact: true })
        .click();
      await updateResponse;

      await expect(
        archivedSnippetsPage(page).getByText("Test snippet", { exact: true }),
      ).toHaveCount(0);

      await visitLibrary(page);

      await expect(
        libraryPage(page).getByText("Test snippet", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("snippet folders", () => {
    test("should be able to create a folder and snippet inside it", async ({
      page,
    }) => {
      await visitLibrary(page);

      await libraryNewButton(page).click();
      await popover(page).getByText("Collection", { exact: true }).click();

      await modal(page).getByLabel("Name", { exact: true }).fill("Test Folder");
      await modal(page)
        .getByLabel("Description", { exact: true })
        .fill("Folder for test snippets");
      await modal(page).getByTestId("collection-picker-button").click();

      await entityPickerModal(page)
        .getByText("SQL Snippets", { exact: true })
        .click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      const createCollectionResponse = waitForCreateCollection(page);
      await modal(page)
        .getByRole("button", { name: "Create", exact: true })
        .click();
      await createCollectionResponse;

      await visitLibrary(page);
      await expect(
        libraryPage(page).getByText("Test Folder", { exact: true }),
      ).toBeVisible();

      await libraryNewButton(page).click();
      await popover(page).getByText("Snippet", { exact: true }).click();

      const nameInput = await newSnippetNameInput(page);
      await nameInput.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Folder snippet");
      await typeInSnippetEditor(page, "SELECT 1");
      await snippetSaveButton(page).click();

      await modal(page).getByText("Test Folder", { exact: true }).click();
      const createSnippetResponse = waitForCreateSnippet(page);
      await modal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();
      await createSnippetResponse;

      await dataStudioBreadcrumbs(page)
        .getByRole("link", { name: /Test Folder/ })
        .click();
      await expect(
        libraryPage(page).getByText("Folder snippet", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to edit folder details", async ({ page, mb }) => {
      await createSnippetFolder(mb.api, { name: "Test Folder" });

      await visitLibrary(page);

      const folderRow = libraryResult(page, "Test Folder");
      await folderRow.hover();
      await icon(folderRow, "ellipsis").click();

      await popover(page)
        .getByText("Edit folder details", { exact: true })
        .click();

      const nameField = modal(page).getByLabel("Name", { exact: true });
      await nameField.fill("");
      await nameField.fill("Updated Folder");
      const updateResponse = waitForUpdateCollection(page);
      await modal(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await updateResponse;

      await expect(
        libraryPage(page).getByText("Updated Folder", { exact: true }),
      ).toBeVisible();
    });

    test("should be able to delete a folder", async ({ page, mb }) => {
      await createSnippetFolder(mb.api, { name: "Test Folder" });

      await visitLibrary(page);

      const folderRow = libraryResult(page, "Test Folder");
      await folderRow.hover();
      await icon(folderRow, "ellipsis").click();

      await popover(page).getByText("Archive", { exact: true }).click();
      // Clicks archive button on confirmation modal
      const updateResponse = waitForUpdateCollection(page);
      await modal(page)
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      await updateResponse;

      await expect(
        libraryPage(page).getByText("Test Folder", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("breadcrumb folder expansion", () => {
    test("should only expand the relevant folder path when navigating back via breadcrumbs", async ({
      page,
      mb,
    }) => {
      // Create nested folder structure: Parent Folder > Child Folder
      const parentFolder = await createSnippetFolder(mb.api, {
        name: "Parent Folder",
      });
      const childFolder = await createSnippetFolder(mb.api, {
        name: "Child Folder",
        parent_id: Number(parentFolder.id),
      });
      // Create a snippet in the child folder
      await createSnippet(mb.api, {
        name: "Nested Snippet",
        content: "SELECT * FROM orders",
        collection_id: childFolder.id,
      });

      // Create a sibling folder with its own nested content
      // This folder should be visible but NOT expanded (its children hidden)
      const siblingFolder = await createSnippetFolder(mb.api, {
        name: "Sibling Folder",
      });
      const siblingSnippet = await createSnippet(mb.api, {
        name: "Sibling Snippet",
        content: "SELECT 2",
        collection_id: siblingFolder.id,
      });

      await visitSnippet(page, siblingSnippet.id);
      await expect(editSnippetPage(page)).toBeVisible();
      await dataStudioBreadcrumbs(page)
        .getByRole("link", { name: "Sibling Folder", exact: true })
        .click();

      // Verify the path to Sibling Folder is expanded, but child folder is
      // collapsed
      await expect(
        libraryPage(page).getByText("Parent Folder", { exact: true }),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Child Folder", { exact: true }),
      ).toHaveCount(0);
      await expect(
        libraryPage(page).getByText("Nested Snippet", { exact: true }),
      ).toHaveCount(0);
      await expect(
        libraryPage(page).getByText("Sibling Folder", { exact: true }),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Sibling Snippet", { exact: true }),
      ).toBeVisible();

      // Navigate to the nested snippet
      await collectionItem(page, "Parent Folder").click();
      await collectionItem(page, "Child Folder").click();
      await libraryPage(page)
        .getByText("Nested Snippet", { exact: true })
        .click();
      await expect(editSnippetPage(page)).toBeVisible();

      // Click the Child Folder breadcrumb to go back to the library
      await dataStudioBreadcrumbs(page)
        .getByRole("link", { name: "Child Folder", exact: true })
        .click();

      // Verify the path to Child Folder is expanded, but sibling folder is
      // collapsed
      await expect(
        libraryPage(page).getByText("Parent Folder", { exact: true }),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Child Folder", { exact: true }),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Nested Snippet", { exact: true }),
      ).toBeVisible();
      // Sibling Folder is visible (it's a child of root which is expanded)
      await expect(
        libraryPage(page).getByText("Sibling Folder", { exact: true }),
      ).toBeVisible();
      // But Sibling Folder's contents should NOT be visible (folder is
      // collapsed)
      await expect(
        libraryPage(page).getByText("Sibling Snippet", { exact: true }),
      ).toHaveCount(0);
    });

    test("should expand all folders when navigating directly to library without expandedId params", async ({
      page,
      mb,
    }) => {
      // Create nested folder structure
      await createSnippetFolder(mb.api, { name: "Folder A" });
      await createSnippetFolder(mb.api, { name: "Folder B" });

      // Navigate directly to library (no expandedId params)
      await visitLibrary(page);

      // Verify all folders are expanded by default
      await expect(
        libraryPage(page).getByText("Folder A", { exact: true }),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Folder B", { exact: true }),
      ).toBeVisible();
    });

    test("should expand parent folders when clicking a nested folder in breadcrumbs", async ({
      page,
      mb,
    }) => {
      // Create deeply nested structure: GrandParent > Parent > Child
      const grandParentFolder = await createSnippetFolder(mb.api, {
        name: "GrandParent Folder",
      });
      const parentFolder = await createSnippetFolder(mb.api, {
        name: "Parent Folder",
        parent_id: Number(grandParentFolder.id),
      });
      const childFolder = await createSnippetFolder(mb.api, {
        name: "Child Folder",
        parent_id: Number(parentFolder.id),
      });
      const snippet = await createSnippet(mb.api, {
        name: "Deep Snippet",
        content: "SELECT 1",
        collection_id: childFolder.id,
      });
      await visitSnippet(page, snippet.id);

      await expect(editSnippetPage(page)).toBeVisible();

      // Click the Parent Folder breadcrumb (middle of the path) to go back
      await dataStudioBreadcrumbs(page)
        .getByRole("link", { name: "Parent Folder", exact: true })
        .click();

      // Verify the path up to Parent Folder is expanded
      await expect(
        libraryPage(page).getByText("GrandParent Folder", { exact: true }),
      ).toBeVisible();
      await expect(
        libraryPage(page).getByText("Parent Folder", { exact: true }),
      ).toBeVisible();
      // Child Folder should still be visible since it's inside Parent Folder
      await expect(
        libraryPage(page).getByText("Child Folder", { exact: true }),
      ).toBeVisible();
    });
  });
});
