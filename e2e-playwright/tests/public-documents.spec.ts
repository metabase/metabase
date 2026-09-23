/**
 * Playwright port of
 * e2e/test/scenarios/documents/public-documents.cy.spec.ts
 * ("scenarios > documents > public").
 *
 * Porting notes:
 * - Public sharing of a document: enable the public link, visit it (as admin
 *   or anonymously via signOut), embedded cards render, the view is read-only.
 * - createPublicDocumentLink hits `/api/document/:id/public-link` (dash) — a
 *   different endpoint from card/dashboard public_link, so it lives in the new
 *   support/public-documents.ts rather than reusing public-sharing.ts.
 * - The Cypress `visitPublicDocument({ signOut })` helper is unwound inline:
 *   mint the link, optionally `mb.signOut()`, then goto the public route.
 * - `H.Comments.getDocumentNodeButtons().should("exist")` checks DOM presence
 *   only (the buttons are opacity-hidden portals); ported as `.toBeAttached()`
 *   on `.first()` to dodge strict mode.
 * - `cy.realType("a")` → `page.keyboard.type("a")`.
 * - The premium-footer test is gated on the pro-self-hosted token (mirrors
 *   documents.spec.ts).
 */
import { resolveToken } from "../support/api";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { getDocumentNodeButtons } from "../support/documents";
import {
  createDocument,
  documentContent,
  getDocumentCard,
  openDocumentCardMenu,
  visitDocument,
  type DocumentContent,
} from "../support/documents-core";
import {
  createPublicDocumentLink,
  verifyCommentsAreHidden,
  verifyDocumentIsReadOnly,
  verifyErrorMessage,
  visitPublicDocument,
} from "../support/public-documents";
import { test, expect } from "../support/fixtures";
import { icon, popover } from "../support/ui";

// Port of the spec-local createTestDocumentWithCard.
function testDocumentWithCard(): DocumentContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Test content" }],
        attrs: { _id: "1" },
      },
      {
        type: "resizeNode",
        attrs: { height: 400, minHeight: 280 },
        content: [
          {
            type: "cardEmbed",
            attrs: { id: ORDERS_QUESTION_ID, name: null, _id: "2" },
          },
        ],
      },
      { type: "paragraph", attrs: { _id: "3" } },
    ],
  };
}

// Port of the spec-local createTestDocument.
function testDocument(content: string): DocumentContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: content }],
        attrs: { _id: "1" },
      },
    ],
  };
}

test.describe("documents > public", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("enable-public-sharing", true);
  });

  test("should not show comments in public documents", async ({ page, mb }) => {
    const { id } = await createDocument(mb.api, {
      name: "Test Public Document",
      document: testDocument("This is a test paragraph"),
      collection_id: null,
    });

    // Visit the document as admin to verify comments exist
    await visitDocument(page, id);
    await expect(documentContent(page)).toContainText("This is a test paragraph");
    // Comment buttons exist (in DOM) for authenticated users
    await expect(getDocumentNodeButtons(page).first()).toBeAttached();

    // Create public link and visit public document
    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);

    await expect(documentContent(page)).toContainText("This is a test paragraph");
    await verifyCommentsAreHidden(page);
  });

  test("should only show 'Download results' in card menu for public documents", async ({
    page,
    mb,
  }) => {
    const { id } = await createDocument(mb.api, {
      name: "Test Document with Card",
      document: testDocumentWithCard(),
      collection_id: null,
    });

    // Visit document as admin to verify full menu exists
    await visitDocument(page, id);
    await expect(getDocumentCard(page, "Orders")).toBeVisible();

    await openDocumentCardMenu(page, "Orders");
    const adminMenu = popover(page);
    await expect(adminMenu.getByText("Edit Visualization", { exact: true })).toBeVisible();
    await expect(adminMenu.getByText("Edit Query", { exact: true })).toBeVisible();
    await expect(adminMenu.getByText("Replace", { exact: true })).toBeVisible();

    // Close the popover by clicking outside
    await documentContent(page).click();

    // Create public link and visit public document
    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);

    await expect(getDocumentCard(page, "Orders")).toBeVisible();

    await openDocumentCardMenu(page, "Orders");
    const publicMenu = popover(page);
    await expect(publicMenu.getByText("Download results", { exact: true })).toBeVisible();
    await expect(publicMenu.getByText("Edit Visualization", { exact: true })).toHaveCount(0);
    await expect(publicMenu.getByText("Edit Query", { exact: true })).toHaveCount(0);
    await expect(publicMenu.getByText("Replace", { exact: true })).toHaveCount(0);
    // Only one menu item
    await expect(publicMenu.getByRole("menuitem")).toHaveCount(1);
  });

  test("should restrict document header menu in public view", async ({
    page,
    mb,
  }) => {
    const { id } = await createDocument(mb.api, {
      name: "Test Document Header",
      document: testDocument("Testing header menu restrictions"),
      collection_id: null,
    });

    await visitDocument(page, id);
    await expect(documentContent(page)).toContainText(
      "Testing header menu restrictions",
    );

    // "More options" menu exists with admin options
    await page.getByRole("button", { name: "More options", exact: true }).click();
    const menu = popover(page);
    await expect(menu.getByText("Bookmark", { exact: true })).toBeVisible();
    await expect(menu.getByText("Move to trash", { exact: true })).toBeVisible();
    await expect(menu.getByText("Print Document", { exact: true })).toBeVisible();

    // Close the popover
    await documentContent(page).click();

    // Create public link and visit public document
    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);

    await expect(documentContent(page)).toContainText(
      "Testing header menu restrictions",
    );
    // In public view the "More options" button should not exist
    await expect(
      page.getByRole("button", { name: "More options", exact: true }),
    ).toHaveCount(0);
  });

  test("should be read-only in public view", async ({ page, mb }) => {
    const { id } = await createDocument(mb.api, {
      name: "Read-only Test Document",
      document: testDocument("This content should not be editable"),
      collection_id: null,
    });

    // Visit document as admin to verify it's editable
    await visitDocument(page, id);
    await expect(documentContent(page).getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "true",
    );

    // Create public link and visit public document
    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);

    await expect(documentContent(page)).toContainText(
      "This content should not be editable",
    );
    await verifyDocumentIsReadOnly(page);
  });

  test("should display metabot blocks in a read-only state", async ({
    page,
    mb,
  }) => {
    const text = "Some metabot prompt";
    const { id } = await createDocument(mb.api, {
      name: "Document with metabot block",
      document: {
        type: "doc",
        content: [
          {
            type: "metabot",
            content: [{ type: "text", text }],
          },
        ],
      },
      collection_id: null,
    });

    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);

    // Click the metabot block and enter text
    await documentContent(page).getByText(text, { exact: true }).click();
    await page.keyboard.type("a");

    // The text wasn't updated
    await expect(documentContent(page).getByText(text, { exact: true })).toBeVisible();

    // Run/close buttons don't exist but a metabot icon does
    await expect(documentContent(page).locator("button")).toHaveCount(0);
    await expect(icon(documentContent(page), "metabot")).toBeVisible();
  });

  test("should allow downloading results from embedded cards", async ({
    page,
    mb,
  }) => {
    const { id } = await createDocument(mb.api, {
      name: "Download Test Document",
      document: testDocumentWithCard(),
      collection_id: null,
    });

    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);

    await expect(getDocumentCard(page, "Orders")).toBeVisible();

    await openDocumentCardMenu(page, "Orders");
    await expect(popover(page).getByText("Download results", { exact: true })).toBeVisible();

    // Click "Download results" to show format options
    await popover(page).getByText("Download results", { exact: true }).click();

    const formats = popover(page);
    await expect(formats.getByText(".csv", { exact: true })).toBeVisible();
    await expect(formats.getByText(".xlsx", { exact: true })).toBeVisible();
    await expect(formats.getByText(".json", { exact: true })).toBeVisible();
    await expect(formats.getByTestId("download-results-button")).toBeVisible();
  });

  test("should be accessible without authentication", async ({ page, mb }) => {
    const { id } = await createDocument(mb.api, {
      name: "Public Anonymous Document",
      document: testDocumentWithCard(),
      collection_id: null,
    });

    // Sign out and visit public document as anonymous user
    const uuid = await createPublicDocumentLink(mb.api, id);
    await mb.signOut();
    await visitPublicDocument(page, uuid);

    await expect(documentContent(page)).toContainText("Test content");
    await expect(getDocumentCard(page, "Orders")).toBeVisible();
    await verifyDocumentIsReadOnly(page);

    // No authentication UI is shown
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
  });

  test("should become inaccessible when public sharing is disabled", async ({
    page,
    mb,
  }) => {
    const { id } = await createDocument(mb.api, {
      name: "Document for Disabling Test",
      document: testDocumentWithCard(),
      collection_id: null,
    });

    // Create public link while sharing is enabled, verify accessible
    const uuid = await createPublicDocumentLink(mb.api, id);
    await mb.signOut();
    await visitPublicDocument(page, uuid);
    await expect(documentContent(page)).toContainText("Test content");

    // Disable public sharing
    await mb.signInAsAdmin();
    await mb.api.updateSetting("enable-public-sharing", false);
    await mb.signOut();

    // Try to access public document after disabling sharing
    await visitPublicDocument(page, uuid);
    await verifyErrorMessage(page, "An error occurred.");

    // Cleanup: re-enable public sharing for subsequent tests
    await mb.signInAsAdmin();
    await mb.api.updateSetting("enable-public-sharing", true);
  });

  test("should show error when accessing public link of deleted document", async ({
    page,
    mb,
  }) => {
    const { id } = await createDocument(mb.api, {
      name: "Document to be Deleted",
      document: testDocumentWithCard(),
      collection_id: null,
    });

    // Create public link, verify accessible before deletion
    const uuid = await createPublicDocumentLink(mb.api, id);
    await visitPublicDocument(page, uuid);
    await expect(documentContent(page)).toContainText("Test content");

    // Delete the document (move to trash)
    await visitDocument(page, id);
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await popover(page).getByText("Move to trash", { exact: true }).click();

    // Try to access public link after deletion
    await visitPublicDocument(page, uuid);
    await verifyErrorMessage(page, "Not found");
  });

  test("should display 'Powered by Metabase' link in footer", async ({
    page,
    mb,
  }) => {
    const { id } = await createDocument(mb.api, {
      name: "Test Document with Footer",
      document: testDocument("Testing footer branding link"),
      collection_id: null,
    });

    const uuid = await createPublicDocumentLink(mb.api, id);
    await mb.signOut();
    await visitPublicDocument(page, uuid);

    await expect(documentContent(page)).toContainText("Testing footer branding link");

    const poweredBy = page.getByRole("link", {
      name: "Powered by Metabase",
      exact: true,
    });
    await expect(poweredBy).toBeVisible();
    await expect(poweredBy).toHaveAttribute(
      "href",
      /https:\/\/www\.metabase\.com\?/,
    );
  });

  test("should not display footer for premium", async ({ page, mb }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );
    await mb.api.activateToken("pro-self-hosted");

    const { id } = await createDocument(mb.api, {
      name: "Test Document with Footer",
      document: testDocument("Testing footer branding link"),
      collection_id: null,
    });

    const uuid = await createPublicDocumentLink(mb.api, id);
    await mb.signOut();
    await visitPublicDocument(page, uuid);

    await expect(documentContent(page)).toContainText("Testing footer branding link");
    await expect(page.getByTestId("embed-frame-footer")).toHaveCount(0);
  });
});
