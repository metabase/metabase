/**
 * Playwright port of
 * e2e/test/scenarios/documents/document-links.cy.spec.ts
 *
 * Notes:
 * - Links live inside the document's single ProseMirror contenteditable. We
 *   click into `document-content` before typing (the established documents.ts
 *   precedent; page.keyboard types at document.activeElement).
 * - `times("here".length, () => cy.realPress(["Shift","{leftarrow}"]))` →
 *   press Shift+ArrowLeft with a ~25ms cadence (ProseMirror coalesces
 *   selection updates when presses have no latency — the wave-9 gotcha).
 * - The link URL input is a plain text input inside the floating formatting
 *   menu. `cy.realType("test.com{enter}")` → assert the input took focus, then
 *   keyboard.type + Enter (faithful to realType, which types at activeElement;
 *   the edit case relies on the input select-all-on-focus so a fresh type
 *   replaces the old URL, exactly as upstream).
 * - `cy.realHover()` on a link → `.hover()`. The pencil/check/trash icons live
 *   in the floating link menu (global `icon(page, …)`, scoped to the menu for
 *   check/trash).
 * - `findByRole("link", { name: "here" })` string → exact (rule 1); regex names
 *   stay regex.
 * - The No-access smart link is NOT a link role (findByText upstream, not
 *   findByRole): match the element carrying the text AND the eye_crossed_out
 *   icon (mixed-content — the icon is a childless svg, so exact getByText still
 *   matches the wrapper).
 * - The 403 intercept mocks GET /api/card/:id only (predicate route so it
 *   doesn't swallow /query etc.).
 * - No snowplow/gating tags in this spec.
 */
import {
  PRODUCTS_AVERAGE_BY_CATEGORY,
  addToDocument,
  commandSuggestionDialog,
  commandSuggestionItem,
  createCard,
  createDocument,
  documentContent,
  documentFormattingMenu,
  visitDocument,
} from "../support/documents-core";
import {
  openLinkMentionMenuBrowseAllPicker,
  openLinkSuggestionBrowseAllPicker,
} from "../support/document-links";
import { pickEntity } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { icon, modal } from "../support/ui";

test.describe("Links in documents", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("plain links", () => {
    test("should support adding, editing, and removing links via floating menu", async ({
      page,
    }) => {
      await page.goto("/document/new");
      await documentContent(page).click();

      // Add text and make a link
      await addToDocument(page, "Click here", false);
      for (let i = 0; i < "here".length; i++) {
        await page.keyboard.press("Shift+ArrowLeft");
        await page.waitForTimeout(25);
      }
      await documentFormattingMenu(page)
        .getByRole("button", { name: /link/ })
        .click();
      const urlInput = documentFormattingMenu(page).locator("input");
      await expect(urlInput).toBeFocused();
      await urlInput.pressSequentially("test.com", { delay: 25 });
      await page.keyboard.press("Enter");

      // Assert link exists with correct href
      await expect(
        documentContent(page).getByRole("link", { name: "here", exact: true }),
      ).toHaveAttribute("href", "https://test.com");

      // Edit link url
      await documentContent(page)
        .getByRole("link", { name: "here", exact: true })
        .hover();
      await icon(page, "pencil").click();
      const editInput = documentFormattingMenu(page).locator("input");
      await expect(editInput).toBeFocused();
      await editInput.pressSequentially("url.com/a/1?k=v", { delay: 25 });
      await icon(documentFormattingMenu(page), "check").click();

      // Assert link still exists, has updated href
      await expect(
        documentContent(page).getByRole("link", { name: "here", exact: true }),
      ).toHaveAttribute("href", "https://url.com/a/1?k=v");

      // Remove link
      await documentContent(page)
        .getByRole("link", { name: "here", exact: true })
        .hover();
      await icon(page, "pencil").click();
      await icon(documentFormattingMenu(page), "trash").click();

      // Assert link is unlinked
      const paragraph = documentContent(page).getByRole("paragraph");
      await expect(paragraph).toContainText("Click here");
      await expect(
        paragraph.getByRole("link", { name: "here", exact: true }),
      ).toHaveCount(0);
    });

    test("should convert markdown links to real links", async ({ page }) => {
      await page.goto("/document/new");
      await documentContent(page).click();
      await addToDocument(page, "Click [here](url.com).", false);

      const paragraph = documentContent(page).getByRole("paragraph");
      await expect(paragraph).toContainText("Click here.");
      await expect(
        paragraph.getByRole("link", { name: "here", exact: true }),
      ).toHaveCount(1);
    });
  });

  test.describe("smart links", () => {
    let questionId: number;
    let documentId: number;

    test.beforeEach(async ({ mb }) => {
      const card = await createCard(mb.api, PRODUCTS_AVERAGE_BY_CATEGORY);
      questionId = card.id;
      const doc = await createDocument(mb.api, {
        name: "Document with SmartLinks",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "See " },
                {
                  type: "smartLink",
                  attrs: {
                    entityId: questionId,
                    model: "card",
                    label: "cached name",
                  },
                },
                { type: "text", text: "." },
              ],
            },
          ],
        },
      });
      documentId = doc.id;
    });

    test("should display the most up-to-date title for the entity it references", async ({
      page,
    }) => {
      await visitDocument(page, documentId);

      await expect(documentContent(page)).toContainText(
        `See ${PRODUCTS_AVERAGE_BY_CATEGORY.name}`,
      );

      await expect(
        documentContent(page).getByRole("link", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        }),
      ).toBeVisible();

      await expect(
        documentContent(page).getByRole("link", { name: /cached name/ }),
      ).toHaveCount(0);
    });

    test("should display 'No access' if the user doesn't have permission to see the link", async ({
      page,
    }) => {
      await page.route(
        (url) => new URL(url).pathname === `/api/card/${questionId}`,
        (route) =>
          route.request().method() === "GET"
            ? route.fulfill({ status: 403, json: {} })
            : route.fallback(),
      );
      await visitDocument(page, documentId);

      await expect(documentContent(page)).toContainText("See No access");

      const noAccess = documentContent(page)
        .getByText("No access", { exact: true })
        .filter({ has: page.locator(".Icon-eye_crossed_out") });
      await expect(noAccess).toBeVisible();
      await expect(icon(noAccess, "eye_crossed_out")).toBeVisible();
    });

    test("should allow adding a smart link using the suggestion menu", async ({
      page,
    }) => {
      await page.goto("/document/new");
      await documentContent(page).click();

      // Trigger suggestion menu with /
      await addToDocument(page, "/", false);

      // Select Link from the suggestion menu
      await commandSuggestionItem(page, "Link").click();

      await addToDocument(
        page,
        PRODUCTS_AVERAGE_BY_CATEGORY.name.substring(0, 5),
        false,
      );

      // Gate on the async-filtered list settling before clicking the first item
      await expect(
        commandSuggestionDialog(page).getByRole("option", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        }),
      ).toBeVisible();

      // Select the first item from the list
      await commandSuggestionDialog(page).getByRole("option").first().click();

      // Verify smart link was added
      await expect(
        documentContent(page).getByRole("link", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        }),
      ).toBeVisible();
    });

    test("should allow adding a smart link using 'Browse all' option in suggestion menu", async ({
      page,
    }) => {
      await page.goto("/document/new");

      await openLinkSuggestionBrowseAllPicker(page);

      await expect(
        modal(page).getByText("Choose an item to link"),
      ).toBeVisible();

      await modal(page).getByText("Our analytics", { exact: true }).click();
      await modal(page)
        .getByText("Orders in a dashboard", { exact: true })
        .click();
      const selectButton = modal(page).getByRole("button", {
        name: "Select",
        exact: true,
      });
      await expect(selectButton).toBeVisible();
      await expect(selectButton).toBeEnabled();
      await selectButton.click();

      // Verify dashboard smart link was added
      await expect(
        documentContent(page).getByRole("link", {
          name: new RegExp("Orders in a dashboard"),
        }),
      ).toBeVisible();

      // Add collection link
      await addToDocument(page, "", true);

      await openLinkSuggestionBrowseAllPicker(page);
      await modal(page)
        .getByText("All personal collections", { exact: true })
        .click();

      // Verify that synthetic collections are not available for using as links
      const selectButton2 = modal(page).getByRole("button", {
        name: "Select",
        exact: true,
      });
      await expect(selectButton2).toBeVisible();
      await expect(selectButton2).toBeDisabled();

      const bobby = modal(page).getByText("Bobby Tables's Personal Collection", {
        exact: true,
      });
      await expect(bobby).toHaveCount(2);
      await bobby.last().click();
      await expect(selectButton2).toBeVisible();
      await expect(selectButton2).toBeEnabled();
      await selectButton2.click();

      // Verify collection smart link was added
      await expect(
        documentContent(page).getByRole("link", {
          name: new RegExp("Bobby Tables's Personal Collection"),
        }),
      ).toBeVisible();
    });

    test("should allow adding a smart link using 'Browse all' option in mention menu", async ({
      page,
    }) => {
      await page.goto("/document/new");

      await openLinkMentionMenuBrowseAllPicker(page);

      await expect(
        modal(page).getByText("Choose an item to link"),
      ).toBeVisible();

      await pickEntity(page, {
        path: ["Databases", "Sample Database", "Products"],
      });
      const selectButton = modal(page).getByRole("button", {
        name: "Select",
        exact: true,
      });
      await expect(selectButton).toBeVisible();
      await expect(selectButton).toBeEnabled();
      await selectButton.click();

      // Verify table smart link was added
      await expect(
        documentContent(page).getByRole("link", {
          name: new RegExp("Products"),
        }),
      ).toBeVisible();
    });
  });
});
