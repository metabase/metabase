/**
 * Playwright port of e2e/test/scenarios/documents/documents.cy.spec.ts
 *
 * Notes:
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the
 *   spike harness).
 * - "should support formatting via floating menu" was accidentally declared
 *   as an it() NESTED INSIDE the markdown it() upstream, so it never ran in
 *   Cypress. It's ported as a real sibling test (see FINDINGS note).
 * - The Empty Document beforeEach adds the QA Postgres database only when
 *   PW_QA_DB_ENABLED is set (upstream runs it unconditionally, but only the
 *   metabot-suggestions test actually needs it, and it needs the container).
 *   That test is additionally gated on the pro-self-hosted token.
 * - The Library save-modal test is gated on the pro-self-hosted token.
 * - cy.stub(win, "print") → an in-page window.print replacement + counter.
 * - Clipboard permissions via context.grantPermissions instead of the CDP
 *   Browser.grantPermissions call.
 * - Upstream waits that consumed responses fired long before the wait (the
 *   "@database"/"@getCollection"/"@cardQuery"-after-embed patterns) are
 *   registered at their true trigger, or replaced by the UI condition they
 *   guarded (noted inline).
 * - Cypress `not.be.visible` on blocks scrolled out of the document pane is
 *   overflow clipping, which Playwright's toBeVisible ignores — the anchor
 *   scroll test asserts viewport intersection instead (expectInViewport).
 */
import type { Locator, Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { getUnpinnedSection } from "../support/collections";
import { ORDERS_BY_YEAR_QUESTION_ID } from "../support/command-palette";
import { icon, inputWithValue } from "../support/dashboard-cards";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  NO_SQL_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PIVOT_TABLE_CARD,
  PRODUCTS_AVERAGE_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  READ_ONLY_PERSONAL_COLLECTION_ID,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  addPostgresDatabase,
  addToDocument,
  clearDocumentContent,
  commandSuggestionDialog,
  commandSuggestionItem,
  contentBoxWidth,
  createCard,
  createDocument,
  documentCardVizType,
  documentContent,
  documentDoDrag,
  documentFormattingMenu,
  documentMentionDialog,
  documentMetabotDialog,
  documentMetabotSuggestionItem,
  documentSaveButton,
  expectInViewport,
  getDocumentCard,
  getDocumentCardResizeContainer,
  getDocumentSidebar,
  getDragHandleForDocumentResizeNode,
  getFlexContainerForCard,
  getResizeHandlesForFlexContainer,
  leaveConfirmationModal,
  modalContentByTestId,
  openDocumentCardMenu,
  removeSummaryGroupingField,
  visitDocument,
  waitForCardQueries,
  waitForCardQuery,
  type CardDetails,
  type DocumentContent,
  type DocumentNode,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { addSummaryField, addSummaryGroupingField } from "../support/joins";
import { cartesianChartCircles, undoToast } from "../support/metrics";
import { modal, waitForDataset } from "../support/models";
import { typeInNativeEditor } from "../support/native-editor";
import { entityPickerModal, miniPicker } from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import { ORDERS_QUESTION_ID, type UserName } from "../support/sample-data";
import { main } from "../support/sharing";
import {
  appBar,
  collectionTable,
  navigationSidebar,
  newButton,
  openNavigationSidebar,
  popover,
  sidebarSection,
} from "../support/ui";

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const expectUnstructuredSnowplowEvent = async (
  _event: unknown,
  _count?: number,
) => {};

/** Case-sensitive substring regex (cy.contains semantics). */
const cs = (value: string) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const documentTitleInput = (page: Page) =>
  page.getByRole("textbox", { name: "Document Title", exact: true });

/** Port of H.newButton("Document").click(). */
async function newDocumentFromNewMenu(page: Page) {
  await newButton(page).click();
  await popover(page).getByText("Document", { exact: true }).click();
}

function waitForDocumentUpdate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/document\/\d+$/.test(new URL(response.url()).pathname),
  );
}

function waitForDocumentGet(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/document\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/**
 * The POST the UI fires when bookmarking. Upstream never waits for it
 * explicitly — H.expectUnstructuredSnowplowEvent's poll happened to cover it.
 */
function waitForBookmarkCreate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/bookmark\/document\/\d+$/.test(new URL(response.url()).pathname),
  );
}

function waitForDocumentCopy(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/document\/\d+\/copy$/.test(new URL(response.url()).pathname),
  );
}

const pathname = (page: Page) => new URL(page.url()).pathname;

test.describe("documents", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await resetSnowplow();
  });

  test.describe("duplicating documents", () => {
    test("should warn about unsaved changes when duplicating an existing document", async ({
      page,
      mb,
    }) => {
      const doc = await createDocument(mb.api, {
        name: "Unsaved Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
      });

      await visitDocument(page, doc.id);

      const title = documentTitleInput(page);
      await expect(title).toHaveValue("Unsaved Duplicate Doc");
      await title.fill("Unsaved title");

      await documentContent(page).click();
      await addToDocument(page, " changed", false);

      await expect(documentSaveButton(page)).toBeVisible();

      await page.getByLabel("More options", { exact: true }).click();
      await popover(page).getByText("Duplicate", { exact: true }).click();

      await expect(modalContentByTestId(page, "save-confirmation")).toBeVisible();

      await page.getByRole("button", { name: "Cancel", exact: true }).click();

      await expect(page.getByTestId("save-confirmation")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: /Duplicate "/ }),
      ).toHaveCount(0);

      // still unsaved
      await expect(documentSaveButton(page)).toBeVisible();
    });

    test("should save changes when duplicating, then copy and redirect to the new document", async ({
      page,
      mb,
    }) => {
      const doc = await createDocument(mb.api, {
        name: "Save Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
      });

      await visitDocument(page, doc.id);

      const title = documentTitleInput(page);
      await expect(title).toHaveValue("Save Duplicate Doc");
      await title.fill("Saved title");

      await documentContent(page).click();
      await addToDocument(page, " changed", false);

      await expect(documentSaveButton(page)).toBeVisible();

      await page.getByLabel("More options", { exact: true }).click();
      await popover(page).getByText("Duplicate", { exact: true }).click();

      await expect(modalContentByTestId(page, "save-confirmation")).toBeVisible();
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();

      // saved
      await expect(documentSaveButton(page)).toHaveCount(0);
      await expect(title).toHaveValue("Saved title");

      // duplicate modal
      const duplicateButton = page.getByRole("button", {
        name: "Duplicate",
        exact: true,
      });
      await expect(duplicateButton).toBeVisible();
      const copyName = await page
        .getByRole("textbox", { name: "Name", exact: true })
        .inputValue();

      const copyRequest = waitForDocumentCopy(page);
      await duplicateButton.click();

      const copyResponse = await copyRequest;
      const copiedId = ((await copyResponse.json()) as { id: number }).id;
      expect(copiedId).toBeTruthy();

      await expect
        .poll(() => pathname(page))
        .toMatch(new RegExp(`^/document/${copiedId}`));

      await expect(documentTitleInput(page)).toHaveValue(copyName);

      // content should match the saved changes
      await expect(documentContent(page)).toContainText(
        "Original content changed",
      );
    });

    test("should duplicate a document without any changes (happy path)", async ({
      page,
      mb,
    }) => {
      const doc = await createDocument(mb.api, {
        name: "Happy Path Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
      });

      await visitDocument(page, doc.id);

      await expect(documentTitleInput(page)).toHaveValue(
        "Happy Path Duplicate Doc",
      );
      await expect(documentSaveButton(page)).toHaveCount(0);

      await page.getByLabel("More options", { exact: true }).click();
      await popover(page).getByText("Duplicate", { exact: true }).click();

      await expect(
        page.getByRole("heading", {
          name: 'Duplicate "Happy Path Duplicate Doc"',
          exact: true,
        }),
      ).toBeVisible();

      const copyName = await page
        .getByRole("textbox", { name: "Name", exact: true })
        .inputValue();

      const copyRequest = waitForDocumentCopy(page);
      await page.getByRole("button", { name: "Duplicate", exact: true }).click();

      const copyResponse = await copyRequest;
      const copiedId = ((await copyResponse.json()) as { id: number }).id;
      expect(copiedId).toBeTruthy();

      await expect
        .poll(() => pathname(page))
        .toMatch(new RegExp(`^/document/${copiedId}`));

      await expect(documentTitleInput(page)).toHaveValue(copyName);

      await expect(documentContent(page)).toContainText("Original content");
    });
  });

  test("should allow you to create a new document from the new button and save", async ({
    page,
    mb,
  }) => {
    // Port of the cy.stub GET /api/document/1 intercept: count the requests.
    let documentGetRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/document/1"
      ) {
        documentGetRequests += 1;
      }
    });

    await page.goto("/");

    await newDocumentFromNewMenu(page);
    await expect(page).toHaveTitle("New document · Metabase");

    const title = documentTitleInput(page);
    await expect(title).toBeFocused();
    await title.pressSequentially("Test Document");

    await documentContent(page).click();
    await page.keyboard.type("This is a paragraph\nAnd this is another", {
      delay: 10,
    });

    await page.getByRole("button", { name: "Save", exact: true }).click();

    await entityPickerModalItem(page, 0, "Our analytics").click();
    await entityPickerModalItem(page, 1, "First collection").click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();

    // We should not show a loading state in between creating a document and
    // viewing the created document.
    await expect.poll(() => pathname(page)).toBe("/document/1");
    await expect(page).toHaveTitle("Test Document · Metabase");

    await expectUnstructuredSnowplowEvent({ event: "document_created" });
    expect(documentGetRequests).toBe(0);

    await page.getByLabel("More options", { exact: true }).click();
    // Upstream's next step is expectUnstructuredSnowplowEvent, which polls
    // snowplow-micro until bookmark_added arrives — an accidental wait for the
    // POST below. Our snowplow stub is a no-op, so without this the DELETE
    // races ahead of the POST, deletes nothing, and the doc stays bookmarked.
    const bookmarkCreated = waitForBookmarkCreate(page);
    await popover(page).getByText("Bookmark", { exact: true }).click();
    await bookmarkCreated;

    await expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "document",
      triggered_from: "document_header",
    });

    // Delete the bookmark because we need to bookmark the doc again in the test
    await mb.api.fetch("DELETE", "/api/bookmark/document/1");

    await appBar(page)
      .getByRole("link", { name: /First collection/ })
      .click();

    await expect(
      collectionTable(page).getByRole("link", {
        name: "Test Document",
        exact: true,
      }),
    ).toBeAttached();

    // Document Management
    await openCollectionItemMenu(page, "Test Document");

    await popover(page).getByText("Move", { exact: true }).click();

    const ourAnalyticsItem = entityPickerModalItem(page, 0, "Our analytics");
    await expect(ourAnalyticsItem).toHaveAttribute("data-active", "true");
    await ourAnalyticsItem.click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Move", exact: true })
      .click();

    await openNavigationSidebar(page);

    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();
    await openCollectionItemMenu(page, "Test Document");

    await popover(page).getByText("Bookmark", { exact: true }).click();
    await expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "document",
      triggered_from: "collection_list",
    });

    await sidebarSection(page, "Bookmarks")
      .getByText("Test Document", { exact: true })
      .click();

    await expect.poll(() => pathname(page)).toBe("/document/1-test-document");
    await expect(documentContent(page)).toContainText("This is a paragraph");

    await appBar(page)
      .getByRole("link", { name: /Our analytics/ })
      .click();

    await openCollectionItemMenu(page, "Test Document");

    await popover(page).getByText("Duplicate", { exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: 'Duplicate "Test Document"',
        exact: true,
      }),
    ).toBeAttached();

    await page.getByTestId("collection-picker-button").click();
    await entityPickerModalItem(page, 0, /Personal Collection/).click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await modal(page)
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await openNavigationSidebar(page);
    await navigationSidebar(page)
      .getByText("Your personal collection", { exact: true })
      .click();

    await page
      .getByTestId("collection-table")
      .getByText("Test Document - Duplicate", { exact: true })
      .click();

    await expect(documentTitleInput(page)).toHaveValue(
      "Test Document - Duplicate",
    );

    await expect(documentContent(page)).toContainText("This is a paragraph");

    await openNavigationSidebar(page);
    await navigationSidebar(page)
      .getByText("Our analytics", { exact: true })
      .click();

    await openCollectionItemMenu(page, "Test Document");

    await popover(page).getByText("Move to trash", { exact: true }).click();

    // Force the click since this is hidden behind a toast notification
    await navigationSidebar(page)
      .getByText("Trash", { exact: true })
      .click({ force: true });
    const trashedDocument = getUnpinnedSection(page).getByText("Test Document", {
      exact: true,
    });
    await expect(trashedDocument).toBeAttached();
    await trashedDocument.click();

    // test that deleted documents cannot be edited (metabase#63112)
    await expect(documentTitleInput(page)).toBeVisible();
    await expect(documentTitleInput(page)).toHaveAttribute("readonly");
    await expect(
      documentContent(page).getByRole("textbox"),
    ).toHaveAttribute("contenteditable", "false");
  });

  test("should default the save modal to a selectable collection when Library is enabled (#73538)", async ({
    page,
    mb,
  }) => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.createLibrary();

    await page.goto("/");

    await newDocumentFromNewMenu(page);
    await documentTitleInput(page).pressSequentially(
      "Document in default collection",
    );
    await documentContent(page).click();
    await page.keyboard.type(
      "This document should save without changing folders",
      { delay: 10 },
    );

    await page.getByRole("button", { name: "Save", exact: true }).click();

    const selectButton = entityPickerModal(page).getByTestId(
      "entity-picker-select-button",
    );
    await expect(selectButton).toBeEnabled();

    const createDocumentResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/document",
    );
    await page.getByTestId("entity-picker-select-button").click();

    const createResponse = await createDocumentResponse;
    const requestBody = createResponse.request().postDataJSON() as Record<
      string,
      unknown
    >;
    expect(requestBody).not.toHaveProperty("collection_id");

    await expect.poll(() => pathname(page)).toMatch(/^\/document\/\d+/);
    await expect(documentTitleInput(page)).toHaveValue(
      "Document in default collection",
    );
  });

  test("should focus the start of the document body when pressing Enter on the title input", async ({
    page,
  }) => {
    await page.goto("/document/new");

    // Type a title
    const title = documentTitleInput(page);
    await expect(title).toBeFocused();
    await title.pressSequentially("Doc Title");
    await title.press("Enter");

    // Add some content to the document body
    await addToDocument(page, "One\nTwo");

    // Click back on the title to focus it and hit Enter
    await title.click();
    await title.press("Enter");

    // Focus should be placed at the beginning of the document body
    await page.keyboard.type("NEW: ", { delay: 10 });
    await expect(documentContent(page)).toHaveText("NEW: OneTwo");
  });

  test("should handle navigating from /new to /new gracefully", async ({
    page,
  }) => {
    await page.goto("/");
    await newDocumentFromNewMenu(page);
    await expect(page).toHaveTitle("New document · Metabase");
    await documentContent(page).click();

    await expect(documentSaveButton(page)).toHaveCount(0);

    await addToDocument(page, "This is some content");

    await expect(documentSaveButton(page)).toBeVisible();

    await newDocumentFromNewMenu(page);
    await expectUnstructuredSnowplowEvent(
      { event: "unsaved_changes_warning_displayed" },
      1,
    );
    await leaveConfirmationModal(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    await expect(documentContent(page)).toHaveText("This is some content");

    await newDocumentFromNewMenu(page);
    await expectUnstructuredSnowplowEvent(
      { event: "unsaved_changes_warning_displayed" },
      2,
    );
    await leaveConfirmationModal(page)
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(documentContent(page)).toHaveText("");
    await expect(documentSaveButton(page)).toHaveCount(0);
  });

  test.describe("document editing", () => {
    test.describe("Document with content", () => {
      let doc: { id: number; document: DocumentContent };

      test.beforeEach(async ({ mb }) => {
        doc = await createDocument(mb.api, {
          name: "Bar Document",
          document: {
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Lorem Ipsum and some more words",
                  },
                ],
                attrs: {
                  _id: "1",
                },
              },
              {
                type: "resizeNode",
                attrs: {
                  height: 442,
                  minHeight: 280,
                },
                content: [
                  {
                    type: "cardEmbed",
                    attrs: {
                      id: ORDERS_QUESTION_ID,
                      name: null,
                      _id: "2",
                    },
                  },
                ],
              },
              {
                type: "paragraph",
                attrs: {
                  _id: "3",
                },
              },
            ],
            type: "doc",
          },
          collection_id: null,
        });
      });

      test("renders a 'not found' message if the copied card has been permanently deleted", async ({
        page,
        mb,
      }) => {
        // The embedded card is cloned on document save, so the id to delete
        // comes from the created document's content, not ORDERS_QUESTION_ID.
        const resizeNode = doc.document.content.find(
          (node) => node.type === "resizeNode",
        );
        const cardEmbed = resizeNode?.content?.[0];
        const clonedCardId = Number(cardEmbed?.attrs?.id);
        expect(clonedCardId).toBeTruthy();
        await mb.api.fetch("DELETE", `/api/card/${clonedCardId}`);
        await visitDocument(page, doc.id);

        await expect(page.getByTestId("document-card-embed")).toHaveText(
          "Couldn't find this chart.",
        );
      });

      test("read only access", async ({ page, mb }) => {
        await mb.signIn("readonly");

        await visitDocument(page, doc.id);

        await expect(
          documentContent(page).getByRole("textbox"),
        ).toHaveAttribute("contenteditable", "false");

        await openDocumentCardMenu(page, "Orders");
        const menuItems = popover(page).getByRole("menuitem");
        const count = await menuItems.count();
        expect(count).toBeGreaterThan(0);

        // Upstream is `findAllByRole("menuitem").should("be.disabled")`, which
        // is chai-jQuery's `.is(":disabled")` — true when ANY element in the set
        // matches. It passes despite "Download results" being enabled, so it
        // asserts far less than it appears to. Read-only users are *meant* to be
        // able to download: in CardEmbedMenuDropdown.tsx every editing action is
        // `disabled={!canWrite}` while Download is `disabled={isDownloadingData}`.
        // Assert that intent per-item instead.
        for (let i = 0; i < count; i++) {
          const item = menuItems.nth(i);
          if ((await item.getAttribute("aria-label")) === "Download results") {
            await expect(item).toBeEnabled();
          } else {
            await expect(item).toBeDisabled();
          }
        }
      });

      test("no access", async ({ page, mb }) => {
        // "nocollection" has a cached session but isn't in the USERS
        // credential map, hence the widening cast.
        await mb.signIn("nocollection" as UserName);

        await visitDocument(page, doc.id);
        await expect(page.getByRole("status")).toContainText(
          "Sorry, you don’t have permission to see that.",
        );
      });

      test("not found", async ({ page }) => {
        await visitDocument(page, 9999);
        await expect(
          main(page).getByText("We're a little lost...", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText("The page you asked for couldn't be found.", {
            exact: true,
          }),
        ).toBeVisible();
      });

      test("should allow you to print", async ({ page }) => {
        await visitDocument(page, doc.id);
        await page
          .getByRole("button", { name: "More options", exact: true })
          .click();

        // This needs to be *after* the page load to work
        await page.evaluate(() => {
          const w = window as Window & { __printCalls?: number };
          w.__printCalls = 0;
          w.print = () => {
            w.__printCalls = (w.__printCalls ?? 0) + 1;
          };
        });

        await popover(page).getByText("Print Document", { exact: true }).click();

        await expect
          .poll(() =>
            page.evaluate(
              () => (window as Window & { __printCalls?: number }).__printCalls,
            ),
          )
          .toBe(1);

        await expectUnstructuredSnowplowEvent({
          event: "document_print",
          target_id: doc.id,
        });
      });

      test("should handle undo/redo properly, resetting the history whenever a different document is viewed", async ({
        page,
      }) => {
        await visitDocument(page, doc.id);
        await expect(getDocumentCard(page, "Orders")).toBeAttached();
        const content = documentContent(page);

        const originalText = "Lorem Ipsum and some more words";
        const originalExact = new RegExp(`^${originalText}$`);
        await content.getByText(originalExact).click();
        await page.keyboard.press("ControlOrMeta+z");
        await expect(content.getByText(originalExact)).toBeAttached();

        const modification = " etc.";
        const modifiedExact = new RegExp(`^${originalText}${modification}$`);
        await addToDocument(page, modification, false);
        await expect(content.getByText(modifiedExact)).toBeAttached();
        await page.keyboard.press("ControlOrMeta+z");
        await expect(content.getByText(originalExact)).toBeAttached();
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect(content.getByText(modifiedExact)).toBeAttached();
        // revert to prevent "unsaved changes" dialog
        await page.keyboard.press("ControlOrMeta+z");
        await expect(content.getByText(originalExact)).toBeAttached();

        await newDocumentFromNewMenu(page);
        await expect(documentContent(page)).toHaveText("");
        await page.keyboard.press("ControlOrMeta+z");
        await expect(documentContent(page)).toHaveText("");
      });

      test("should not clear undo history on save", async ({ page }) => {
        const originalText = "Lorem Ipsum and some more words";
        const originalExact = new RegExp(`^${originalText}$`);
        await visitDocument(page, doc.id);
        // wait for data loading
        await expect(page.getByTestId("document-card-embed")).toContainText(
          "37.65",
        );
        const content = documentContent(page);
        await content.getByText(originalExact).click();

        const modification = " etc.";
        const modifiedExact = new RegExp(`^${originalText}${modification}$`);
        await addToDocument(page, modification, false);
        await expect(content.getByText(modifiedExact)).toBeAttached();

        await page.keyboard.press("ControlOrMeta+s");
        await expect(
          page
            .getByTestId("toast-undo")
            .getByText("Document saved", { exact: true }),
        ).toBeVisible();

        await page.keyboard.press("ControlOrMeta+z");
        await page.keyboard.press("ControlOrMeta+z");
        await expect(content.getByText(originalExact)).toBeAttached();
      });
    });
  });

  test.describe("Empty Document", () => {
    let doc: { id: number; document: DocumentContent };

    test.beforeEach(async ({ mb }) => {
      doc = await createDocument(mb.api, {
        name: "Foo Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: null,
      });

      // Upstream adds the QA Postgres database unconditionally; only the
      // metabot-suggestions test needs it, and it needs the QA container.
      if (process.env.PW_QA_DB_ENABLED) {
        await addPostgresDatabase(mb.api);
      }
    });

    test("should support typing with a markdown syntax", async ({ page }) => {
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      await addToDocument(page, "# This is a heading level 1");
      await addToDocument(page, "## This is a heading level 2");
      await addToDocument(page, "### This is a heading level 3");
      await addToDocument(page, "#### This is a heading level 4");

      await addToDocument(page, "**Some Bold Text**");
      await addToDocument(page, "*Some Italic Text*");

      await addToDocument(page, "Lets start an unordered list");
      await addToDocument(page, "- First Item");
      await addToDocument(page, "Second Item");
      // New Line to break out of the list;
      await addToDocument(page, "");

      await addToDocument(page, "Lets start an ordered list");
      await addToDocument(page, "1. First Ordered Item");
      await addToDocument(page, "Second Ordered Item");
      // New Line to break out of the list;
      await addToDocument(page, "");

      await addToDocument(page, "http://metabase.com");

      await addToDocument(
        page,
        "We can also add `inline code blocks` to paragraphs",
      );
      await addToDocument(page, "```");
      await addToDocument(page, "Or add whole code blocks");
      // Break out of the code block
      await addToDocument(page, "\n");

      const content = documentContent(page);
      for (const level of [1, 2, 3, 4]) {
        await expect(
          content.getByRole("heading", {
            name: `This is a heading level ${level}`,
            exact: true,
          }),
        ).toBeAttached();
      }
      await expect(content.getByRole("strong")).toContainText("Some Bold Text");
      await expect(content.getByRole("emphasis")).toContainText(
        "Some Italic Text",
      );

      await expect(content.getByRole("list")).toHaveCount(2);
      const listItems = content.getByRole("listitem");
      for (const item of [
        "First Item",
        "Second Item",
        "First Ordered Item",
        "Second Ordered Item",
      ]) {
        await expect(
          listItems.filter({ hasText: cs(item) }).first(),
        ).toBeAttached();
      }

      await expect(
        content.getByRole("link", { name: "http://metabase.com", exact: true }),
      ).toBeAttached();

      await expect(
        content.getByRole("code").filter({ hasText: cs("inline code blocks") }),
      ).toBeAttached();
      await expect(
        content
          .getByRole("code")
          .filter({ hasText: cs("Or add whole code blocks") }),
      ).toBeAttached();
    });

    // Upstream this it() is accidentally nested inside the markdown test's
    // callback, so Cypress registers it mid-run and NEVER executes it.
    // Ported as a real test (see findings-inbox/documents.md).
    test("should support formatting via floating menu", async ({ page }) => {
      const content = "Some text to play with";

      const formatTests: {
        button: RegExp;
        role: Parameters<Locator["getByRole"]>[0];
        revert?: boolean;
      }[] = [
        { button: /text_bold/, role: "strong" },
        { button: /text_italic/, role: "emphasis" },
        { button: /text_strike/, role: "paragraph" }, // figure out what to do here
        { button: /format_code/, role: "code" },
        { button: /H1/, role: "heading" },
        { button: /H2/, role: "heading" },
        { button: /^list/, role: "list" },
        { button: /ordered_list/, role: "list" },
        { button: /quote/, role: "blockquote" },
        { button: /code_block/, role: "code", revert: false },
      ];

      const assertUnformatted = async () =>
        // Converting to a heading currently adds a newline, which generates
        // a new paragraph
        expect(
          documentContent(page).getByRole("paragraph").nth(0),
        ).toContainText(content);

      await visitDocument(page, doc.id);
      await documentContent(page).click();

      await addToDocument(page, content, false);
      await page.keyboard.press("Shift+Home");

      await expect(documentFormattingMenu(page)).toBeAttached();

      for (const { button, role, revert = true } of formatTests) {
        await documentFormattingMenu(page)
          .getByRole("button", { name: button })
          .click();
        await expect(
          documentContent(page).getByRole(role).first(),
        ).toContainText(content);
        if (revert) {
          await documentFormattingMenu(page)
            .getByRole("button", { name: button })
            .click();
          await assertUnformatted();
        }
      }
    });

    test.describe("Card Embeds", () => {
      test.beforeEach(async ({ page, mb }) => {
        await createCard(mb.api, PRODUCTS_AVERAGE_BY_CATEGORY);
        await createCard(mb.api, ACCOUNTS_COUNT_BY_CREATED_AT);
        await createCard(mb.api, PIVOT_TABLE_CARD);
        await createCard(mb.api, STEP_COLUMN_CARD);
        await createCard(mb.api, SCALAR_CARD.LANDING_PAGE_VIEWS);
        // Need to get this one to simulate recent activity
        const { id: pieId } = await createCard(
          mb.api,
          PRODUCTS_COUNT_BY_CATEGORY_PIE,
        );
        await mb.api.post(`/api/card/${pieId}/query`);
        const { id: dashboardId } = await mb.api.createDashboard({
          name: "Fancy Dashboard",
        });
        await createCard(mb.api, {
          ...ORDERS_COUNT_BY_PRODUCT_CATEGORY,
          dashboard_id: dashboardId,
        });
        await visitDocument(page, doc.id);
      });

      test("should support keyboard and mouse selection in suggestions without double highlight", async ({
        page,
        mb,
      }) => {
        test.skip(
          !resolveToken("pro-self-hosted"),
          "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
        );
        test.skip(
          !process.env.PW_QA_DB_ENABLED,
          "Requires the QA Postgres container (set PW_QA_DB_ENABLED)",
        );

        const assertOnlyOneOptionActive = async (
          name: string | RegExp,
          dialog: "command" | "mention" | "metabot" = "command",
        ) => {
          const container =
            dialog === "command"
              ? commandSuggestionDialog(page)
              : dialog === "mention"
                ? documentMentionDialog(page)
                : documentMetabotDialog(page);

          await expect(
            container.getByRole("option", {
              name,
              exact: typeof name === "string",
            }),
          ).toHaveAttribute("aria-selected", "true");

          await expect(
            container.locator('[role="option"][aria-selected="true"]'),
          ).toHaveCount(1);
        };

        await mb.api.activateToken("pro-self-hosted");
        await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
        await visitDocument(page, doc.id);

        await documentContent(page).click();
        await addToDocument(page, "/", false);

        await assertOnlyOneOptionActive(/Ask Metabot/);

        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");

        // Link should be active
        await assertOnlyOneOptionActive("Link");

        // Hover over Quote
        await commandSuggestionItem(page, /Quote/).hover();

        await assertOnlyOneOptionActive(/Quote/);

        await addToDocument(page, "pro", false);

        await assertOnlyOneOptionActive(/Products by Category/);

        await page.keyboard.press("ArrowDown");
        await assertOnlyOneOptionActive(/Products average/);

        await commandSuggestionItem(page, /Products by Category/).hover();

        await assertOnlyOneOptionActive(/Products by Category/);

        await page.keyboard.press("Escape");

        await clearDocumentContent(page);

        await addToDocument(page, "@ord", false);

        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");

        await assertOnlyOneOptionActive(/Orders, Count$/, "mention");

        await documentMentionDialog(page)
          .getByRole("option", { name: /Browse all/ })
          .hover();

        await assertOnlyOneOptionActive(/Browse all/, "mention");

        await page.keyboard.press("Escape");
        await clearDocumentContent(page);
        await addToDocument(page, "/", false);

        await commandSuggestionItem(page, /Ask Metabot/).click();
        await addToDocument(page, "@", false);

        await assertOnlyOneOptionActive(/QA Postgres/, "metabot");
        await page.keyboard.press("ArrowDown");
        await assertOnlyOneOptionActive(/Sample/, "metabot");

        await documentMetabotSuggestionItem(page, /QA Postgres/).hover();
        await assertOnlyOneOptionActive(/QA Postgres/, "metabot");
      });

      test("should support adding cards and updating viz settings", async ({
        page,
      }) => {
        await documentContent(page).click();
        await addToDocument(page, "/", false);

        // search via type
        await addToDocument(page, "Accounts", false);
        await expect(commandSuggestionDialog(page)).toContainText(
          ACCOUNTS_COUNT_BY_CREATED_AT.name,
        );

        await page.keyboard.press("ArrowDown");
        await addToDocument(page, "\n", false);

        await expectUnstructuredSnowplowEvent({
          event: "document_add_card",
          target_id: doc.id,
        });

        await expect(
          getDocumentCard(page, ACCOUNTS_COUNT_BY_CREATED_AT.name),
        ).toBeAttached();

        await page.keyboard.press("ArrowDown");

        // via recents
        await addToDocument(page, "/", false);
        await commandSuggestionItem(page, "Chart").click();
        await commandSuggestionDialog(page)
          .getByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name, { exact: true })
          .click();
        await expect(
          getDocumentCard(page, PRODUCTS_COUNT_BY_CATEGORY_PIE.name),
        ).toBeAttached();

        await page.keyboard.press("ArrowDown");

        // via entity picker
        await addToDocument(page, "/", false);

        await commandSuggestionItem(page, "Chart").click();
        await commandSuggestionItem(page, /Browse all/).click();

        await entityPickerModalItem(
          page,
          1,
          PRODUCTS_AVERAGE_BY_CATEGORY.name,
        ).click();
        await entityPickerModal(page)
          .getByRole("button", { name: "Select", exact: true })
          .click();

        await expect(
          getDocumentCard(page, PRODUCTS_AVERAGE_BY_CATEGORY.name),
        ).toBeAttached();
        await page.keyboard.press("ArrowDown");

        // change a cards display type
        await openDocumentCardMenu(page, ACCOUNTS_COUNT_BY_CREATED_AT.name);
        await popover(page)
          .getByText("Edit Visualization", { exact: true })
          .click();

        const sidebar = getDocumentSidebar(page);
        await sidebar.getByRole("button", { name: /Bar/i }).click();
        await page
          .getByRole("menu", { name: /Bar/i })
          .getByText("Line", { exact: true })
          .click();
        await sidebar.getByText("Axes", { exact: true }).click();
        const axisLabelInput = await inputWithValue(sidebar, "Created At: Month");
        await axisLabelInput.fill("Foo Axes");

        await expect(
          documentCardVizType(page, ACCOUNTS_COUNT_BY_CREATED_AT.name, "Line"),
        ).toBeAttached();
        await expect(
          getDocumentCard(page, ACCOUNTS_COUNT_BY_CREATED_AT.name).getByText(
            "Foo Axes",
            { exact: true },
          ),
        ).toBeAttached();
        await sidebar.getByRole("button", { name: /close/ }).click();

        // Edit the Query. Assert on the number of breakouts
        await openDocumentCardMenu(page, PRODUCTS_COUNT_BY_CATEGORY_PIE.name);
        await expect(
          getDocumentCard(page, PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
            .getByRole("list")
            .getByRole("listitem"),
        ).toHaveCount(4);
        await popover(page).getByText("Edit Query", { exact: true }).click();

        await removeSummaryGroupingField(page, { field: "Category" });
        await addSummaryGroupingField(page, { field: "Price" });
        await modal(page)
          .getByRole("button", { name: "Save and use", exact: true })
          .click();

        await expect(
          getDocumentCard(page, PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
            .getByRole("list")
            .getByRole("listitem"),
        ).toHaveCount(7);

        // Replace Card
        await openDocumentCardMenu(page, PRODUCTS_COUNT_BY_CATEGORY_PIE.name);
        await popover(page).getByText("Replace", { exact: true }).click();

        const replaceModal = modal(page);
        await expect(
          replaceModal.getByText("Choose a question or model", { exact: true }),
        ).toBeAttached();

        const searchInput = replaceModal.getByPlaceholder("Search…").first();
        await searchInput.click();
        await searchInput.pressSequentially("Orders");

        await replaceModal
          .getByTestId("result-item")
          .getByText("Orders", { exact: true })
          .click();

        await replaceModal
          .getByRole("button", { name: "Select", exact: true })
          .click();

        await expectUnstructuredSnowplowEvent({
          event: "document_replace_card",
          target_id: doc.id,
        });

        await expect(
          documentContent(page)
            .getByTestId("card-embed-title")
            .filter({ hasText: cs(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name) }),
        ).toHaveCount(0);

        await expect(getDocumentCard(page, "Orders")).toBeAttached();
      });

      test("should support renaming cards", async ({ page }) => {
        // Add card
        await documentContent(page).click();
        await addToDocument(page, "/", false);
        await commandSuggestionItem(page, "Chart").click();
        await commandSuggestionDialog(page)
          .getByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name, { exact: true })
          .click();

        // Rename card
        await page.getByTestId("card-embed-title").hover();
        await icon(page, "pencil").click();
        await page.keyboard.type("New name", { delay: 10 });
        await page.keyboard.press("Enter");

        // Edit query
        await openDocumentCardMenu(page, "New name");
        await popover(page).getByText("Edit Query", { exact: true }).click();
        await removeSummaryGroupingField(page, { field: "Category" });
        await addSummaryGroupingField(page, { field: "Price" });
        await modal(page)
          .getByRole("button", { name: "Save and use", exact: true })
          .click();

        // Assert new name is preserved
        await expect(getDocumentCard(page, "New name")).toBeAttached();
      });

      test("should support resizing cards", async ({ page }) => {
        await documentContent(page).click();
        await addToDocument(page, "/", false);

        // search via type
        await addToDocument(page, "Accounts", false);
        await expect(commandSuggestionDialog(page)).toContainText(
          ACCOUNTS_COUNT_BY_CREATED_AT.name,
        );

        await page.keyboard.press("ArrowDown");
        await addToDocument(page, "\n", false);

        const card = getDocumentCard(page, ACCOUNTS_COUNT_BY_CREATED_AT.name);
        await expect(card).toBeVisible();
        const originalBox = await card.boundingBox();
        expect(originalBox).toBeTruthy();
        const ogHeight = originalBox?.height ?? 0;

        const resizeContainer = getDocumentCardResizeContainer(
          page,
          ACCOUNTS_COUNT_BY_CREATED_AT.name,
        );
        await documentDoDrag(
          page,
          getDragHandleForDocumentResizeNode(resizeContainer),
          { y: 200 },
        );

        await expect
          .poll(async () => (await card.boundingBox())?.height ?? Infinity)
          .toBeLessThan(ogHeight);
      });

      const PADDING_CARD = 1;
      type ChartSpec = {
        label: string;
        card: CardDetails;
        paddingX: number;
        selector: string;
      };

      const chartTypes: ChartSpec[] = [
        {
          label: "line",
          card: ACCOUNTS_COUNT_BY_CREATED_AT,
          paddingX: 16 + PADDING_CARD,
          selector: "[data-testid='chart-container'] > :first-child",
        },
        {
          label: "pie",
          card: PRODUCTS_COUNT_BY_CATEGORY_PIE,
          paddingX: 14 + PADDING_CARD,
          selector: "[data-testid='chart-with-legend']",
        },
      ];

      const assertChartMatchesContainerWidth = async (
        page: Page,
        cardName: string,
        paddingX: number,
        selector: string,
      ) => {
        const card = getDocumentCard(page, cardName);
        const chart = card.locator(selector).first();
        await expect(chart).toBeAttached();
        // Upstream compared jQuery .width() values with strict equality;
        // content-box widths here can land on subpixels, so allow 0.5px.
        await expect
          .poll(async () => {
            const cardWidth = await contentBoxWidth(card);
            const chartWidth = await contentBoxWidth(chart);
            return Math.abs(chartWidth + paddingX * 2 - cardWidth);
          })
          .toBeLessThanOrEqual(0.5);
      };

      test("keeps chart widths in sync during flex resize", async ({
        page,
        mb,
      }) => {
        const cardIds: Record<string, { firstId: number; secondId: number }> =
          {};

        // Create all questions first
        for (const { label, card } of chartTypes) {
          const secondCardName = `${card.name} (copy)`;
          const { id: firstId } = await createCard(mb.api, card);
          const { id: secondId } = await createCard(mb.api, {
            ...card,
            name: secondCardName,
          });
          cardIds[label] = { firstId, secondId };
        }

        const content: DocumentNode[] = chartTypes.map(({ label }) => ({
          type: "resizeNode",
          attrs: {
            height: 350,
            minHeight: 280,
            _id: `flex-${label}`,
          },
          content: [
            {
              type: "flexContainer",
              attrs: {
                _id: `flex-${label}-container`,
                columnWidths: [50, 50],
              },
              content: [
                {
                  type: "cardEmbed",
                  attrs: {
                    id: cardIds[label].firstId,
                    name: null,
                    _id: `flex-${label}-card-1`,
                  },
                },
                {
                  type: "cardEmbed",
                  attrs: {
                    id: cardIds[label].secondId,
                    name: null,
                    _id: `flex-${label}-card-2`,
                  },
                },
              ],
            },
          ],
        }));

        const flexDoc = await createDocument(mb.api, {
          name: "Flex chart width document",
          document: {
            type: "doc",
            content,
          },
          collection_id: null,
        });

        // Wait for all cards to load (2 chart types × 2 cards each)
        const allCardQueries = waitForCardQueries(page, chartTypes.length * 2);
        await visitDocument(page, flexDoc.id);
        await allCardQueries;

        for (const { card, paddingX, selector } of chartTypes) {
          const firstCardName = card.name;
          const secondCardName = `${card.name} (copy)`;

          await expect(
            getDocumentCard(page, firstCardName).locator(selector).first(),
          ).toBeAttached();
          await expect(
            getDocumentCard(page, secondCardName).locator(selector).first(),
          ).toBeAttached();

          const flexContainer = getFlexContainerForCard(page, firstCardName);
          const handle = getResizeHandlesForFlexContainer(flexContainer).nth(0);

          await handle.hover();
          await page.mouse.down();

          const steps = [10, 40, 60, -100, -10, -40, -60];
          for (const deltaX of steps) {
            // like cy.realMouseMove(deltaX, 0, { position: "center" }):
            // move relative to the handle's *current* center
            const box = await handle.boundingBox();
            expect(box).toBeTruthy();
            if (box) {
              await page.mouse.move(
                box.x + box.width / 2 + deltaX,
                box.y + box.height / 2,
              );
            }

            await assertChartMatchesContainerWidth(
              page,
              firstCardName,
              paddingX,
              selector,
            );
            await assertChartMatchesContainerWidth(
              page,
              secondCardName,
              paddingX,
              selector,
            );
          }

          await page.mouse.up();
        }
      });

      test("should copy an added card on save", async ({ page }) => {
        // initial load
        await documentContent(page).click();

        await addToDocument(page, "/ord", false);

        const suggestionDialog = commandSuggestionDialog(page);
        await expect(suggestionDialog).toContainText(
          "Orders, Count, Grouped by Created At (year)",
        );
        await expect(suggestionDialog).toContainText("Orders, Count");
        await expect(suggestionDialog).toContainText("Orders Model");

        await commandSuggestionItem(
          page,
          /Orders, Count, Grouped by Created At \(year\)/,
        ).click();

        // Adding a new line
        await addToDocument(page, "");
        await addToDocument(page, "Adding a static link: /", false);
        await commandSuggestionItem(page, "Link").click();

        await addToDocument(page, "Ord", false);
        await commandSuggestionItem(page, /Orders, Count$/).click();
        await addToDocument(page, " And continue typing", false);

        const content = documentContent(page);
        await expect(content.getByTestId("document-card-embed")).toHaveCount(1);
        await expect(content.getByTestId("document-card-embed")).toContainText(
          "Orders, Count, Grouped by Created At (year)",
        );
        await expect(
          content.getByRole("link", { name: /Orders, Count$/ }),
        ).toBeAttached();

        const documentUpdate = waitForDocumentUpdate(page);
        const documentGet = waitForDocumentGet(page);
        // The saved document embeds a *clone* of the card, so the reload
        // re-runs the card query — that's the "@cardQuery" the upstream
        // wait was really about.
        const cardQuery = waitForCardQuery(page);
        await page.getByRole("button", { name: "Save", exact: true }).click();

        await documentUpdate;
        await documentGet;

        await expectUnstructuredSnowplowEvent({
          event: "document_saved",
          target_id: doc.id,
        });
        await expectUnstructuredSnowplowEvent({
          event: "document_add_smart_link",
          target_id: doc.id,
        });

        await expect(
          page
            .getByTestId("toast-undo")
            .getByText("Document saved", { exact: true }),
        ).toBeVisible();

        await cardQuery;

        await page.waitForTimeout(100);

        await page
          .getByTestId("document-card-embed")
          .getByText("Orders, Count, Grouped by Created At (year)", {
            exact: true,
          })
          .click();

        await page.waitForURL((url) => url.pathname.startsWith("/question"));
        expect(pathname(page)).not.toContain(
          ORDERS_BY_YEAR_QUESTION_ID.toString(),
        );

        // Navigating to a question from a document should result in a back button
        await page.getByLabel("Back to Foo Document", { exact: true }).click();

        await expect.poll(() => pathname(page)).toBe(`/document/${doc.id}`);

        await expect(
          getDocumentCard(page, "Orders, Count, Grouped by Created At (year)"),
        ).toBeVisible();

        await cartesianChartCircles(page).nth(1).click();

        await popover(page).getByText("See these Orders", { exact: true }).click();

        await page.getByLabel("Back to Foo Document", { exact: true }).click();

        await expect.poll(() => pathname(page)).toBe(`/document/${doc.id}`);
      });
    });
  });

  test.describe("creating new questions", () => {
    let doc: { id: number; document: DocumentContent };

    test.beforeEach(async ({ mb }) => {
      doc = await createDocument(mb.api, {
        name: "New Question Test Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: null,
      });
    });

    test("should allow creating a new notebook question and embedding it in the document", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and select Chart
      await addToDocument(page, "/", false);
      await commandSuggestionItem(page, "Chart").click();
      await commandSuggestionItem(page, /New chart/).click();
      await commandSuggestionItem(page, /New Question/).click();

      // Create a simple query in the notebook editor
      const picker = miniPicker(page);
      await picker.getByText("Our analytics", { exact: true }).click();
      await picker.getByText("Orders", { exact: true }).click();

      // Save and use the new question
      const createDialog = page.getByRole("dialog", {
        name: "Create new question",
        exact: true,
      });
      await expect(
        createDialog.getByText("Orders", { exact: true }),
      ).toBeAttached();
      const dataset = waitForDataset(page);
      await createDialog
        .getByRole("button", { name: "Save and use", exact: true })
        .click();

      await dataset;

      // Verify the question is embedded in the document
      await expect(getDocumentCard(page, "Orders")).toBeAttached();

      await expectUnstructuredSnowplowEvent({
        event: "document_add_card",
        target_id: doc.id,
      });

      // Verify document can be saved with a new question
      const saveButton = page.getByRole("button", { name: "Save", exact: true });
      await expect(saveButton).toBeVisible();
      await saveButton.click();
      await expect(saveButton).toHaveCount(0);

      await expect(
        undoToast(page).getByText("Document saved", { exact: true }),
      ).toBeAttached();
    });

    test("should allow creating a new native SQL question and embedding it in the document", async ({
      page,
    }) => {
      // Upstream registered the "@database" intercept at test start, so its
      // wait matched the earliest GET /api/database — register before goto.
      const databaseLoad = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/database",
      );
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and select Chart
      await addToDocument(page, "/", false);
      await commandSuggestionItem(page, "Chart").click();
      await commandSuggestionItem(page, /New chart/).click();
      await commandSuggestionItem(page, /New SQL query/).click();

      // Save and use the new SQL query
      await databaseLoad;
      await page.waitForTimeout(200); // wait for db selector to load

      await expect(page.getByTestId("selected-database")).toBeAttached();

      await typeInNativeEditor(page, "SELECT * FROM ORDERS LIMIT 10");

      const dataset = waitForDataset(page);
      await page
        .getByRole("dialog", { name: "Edit SQL Query", exact: true })
        .getByRole("button", { name: "Save and use", exact: true })
        .click();

      await dataset;

      // Verify the SQL query is embedded in the document
      await expect(getDocumentCard(page, "New question")).toBeAttached();
      const saveButton = page.getByRole("button", { name: "Save", exact: true });
      await expect(saveButton).toBeVisible();
      await saveButton.click();

      await expectUnstructuredSnowplowEvent({
        event: "document_add_card",
        target_id: doc.id,
      });

      // Change native question title
      await documentContent(page)
        .getByText("New question", { exact: true })
        .hover();
      await icon(page, "pencil").click();
      await page.keyboard.type("New native question", { delay: 10 });

      await page.locator(".node-paragraph").first().click(); // unfocus cardEmbed

      await expect(getDocumentCard(page, "New native question")).toBeVisible();

      // Verify document can be saved with a new question
      await expect(saveButton).toBeVisible();
      await saveButton.click();
      await expect(saveButton).toHaveCount(0);

      await expect(
        undoToast(page).getByText("Document saved", { exact: true }),
      ).toBeAttached();
    });

    test("should support keyboard navigation when creating a new question", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and navigate to 'Chart' item
      await addToDocument(page, "/", false);
      await expect(commandSuggestionItem(page, "Chart")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.keyboard.press("Enter");

      // Click 'New chart' to open question type menu
      const newChartItem = commandSuggestionItem(page, /New chart/);
      await expect(newChartItem).toBeAttached();
      await expect(newChartItem).toHaveAttribute("aria-selected", "true");
      await expect(commandSuggestionItem(page, /Browse all/)).toBeAttached();
      await page.keyboard.press("Enter");

      // Verify notebook option is selected by default
      await expect(
        commandSuggestionItem(page, /New Question/),
      ).toHaveAttribute("aria-selected", "true");

      // Navigate to SQL option
      await page.keyboard.press("ArrowDown");

      await expect(
        commandSuggestionItem(page, /New SQL query/),
      ).toHaveAttribute("aria-selected", "true");

      // Select SQL option with Enter
      await page.keyboard.press("Enter");

      // Verify native query modal opens
      const sqlDialog = page.getByRole("dialog", {
        name: "Edit SQL Query",
        exact: true,
      });
      await expect(sqlDialog).toBeVisible();

      // Cancel the modal
      await sqlDialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      // Verify modal is closed
      await expect(sqlDialog).toHaveCount(0);
    });

    test("should show 'Create new question' footer when no search results are found", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and select Chart
      await addToDocument(page, "/", false);
      await commandSuggestionItem(page, "Chart").click();

      // Search for something that doesn't exist
      await addToDocument(page, "xyznonexistentquery", false);

      // Verify 'No results found' message appears
      await expect(commandSuggestionDialog(page)).toContainText(
        "No results found",
      );

      await expect(
        commandSuggestionDialog(page).getByRole("separator"),
      ).toBeAttached();

      // Verify 'Create new question' footer is visible
      await expect(commandSuggestionItem(page, /New chart/)).toBeVisible();

      // Verify 'Browse all' footer is also visible
      await expect(commandSuggestionItem(page, /Browse all/)).toBeVisible();
    });

    test("should automatically assign appropriate visualization type for time series aggregation", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and create a new question
      await addToDocument(page, "/", false);
      await commandSuggestionItem(page, "Chart").click();
      await commandSuggestionItem(page, /New chart/).click();
      await commandSuggestionItem(page, /New Question/).click();

      // Create a time series query with Orders table
      const picker = miniPicker(page);
      await picker.getByText("Our analytics", { exact: true }).click();
      await picker.getByText("Orders", { exact: true }).click();

      await addSummaryField(page, { metric: "Sum of ...", field: "Total" });
      await addSummaryGroupingField(page, { field: "Created At" });

      await page
        .getByRole("dialog", { name: "Create new question", exact: true })
        .getByRole("button", { name: "Save and use", exact: true })
        .click();

      // Verify the question is embedded with a line chart visualization
      const card = getDocumentCard(
        page,
        "Orders, Sum of Total, Grouped by Created At: Month",
      );
      await expect(card).toBeAttached();
      // Verify it has a line chart visualization (not a table)
      await expect(card.getByTestId("chart-container")).toBeAttached();
      await expect(card.locator("svg").first()).toBeAttached();
      // The document contains a single chart, so the page-scoped circle
      // lookup matches only this card's line chart.
      await expect
        .poll(() => cartesianChartCircles(page).count())
        .toBeGreaterThanOrEqual(1);
    });

    test("should trigger new question type suggestion menu when typing non-matching search and hitting Enter", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Type a non-matching search term
      await addToDocument(page, "/asdfsdaf", false);

      await expect(commandSuggestionDialog(page)).toBeVisible();
      await expect(commandSuggestionDialog(page)).toContainText(
        "No results found",
      );
      const newChartItem = commandSuggestionItem(page, /New chart/);
      await expect(newChartItem).toBeAttached();
      await expect(newChartItem).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Enter");

      // Verify that the new question type suggestion menu appears
      await expect(commandSuggestionDialog(page)).toBeVisible();
      await expect(commandSuggestionItem(page, /New Question/)).toBeVisible();
      await expect(
        commandSuggestionDialog(page).getByText(/Browse all/),
      ).toHaveCount(0);
    });
  });

  test.describe("creating new questions - limited permissions", () => {
    test("should not show 'Create new question' option for users without database permissions", async ({
      page,
      mb,
    }) => {
      await mb.signIn("readonly");

      const doc = await createDocument(mb.api, {
        name: "Test Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
      });

      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and select Chart
      await addToDocument(page, "/", false);
      await commandSuggestionItem(page, "Chart").click();

      // Verify 'Create new question' footer is not visible
      await expect(
        commandSuggestionDialog(page).getByRole("button", {
          name: /New chart/,
        }),
      ).toHaveCount(0);

      // Search for something to verify footer doesn't appear
      await addToDocument(page, "xyznonexistent", false);

      // Verify 'No results found' message appears
      await expect(commandSuggestionDialog(page)).toContainText(
        "No results found",
      );

      // Verify 'Create new question' footer is still not visible for
      // no-permission user
      await expect(
        commandSuggestionDialog(page).getByRole("button", {
          name: /New chart/,
        }),
      ).toHaveCount(0);

      // Verify 'Browse all' footer is still available
      await expect(commandSuggestionItem(page, /Browse all/)).toBeVisible();
    });

    test("should not show native SQL question option for users without native query editing permissions", async ({
      page,
      mb,
    }) => {
      // "nosql" has a cached session but isn't in the USERS credential map,
      // hence the widening cast.
      await mb.signIn("nosql" as UserName);

      const doc = await createDocument(mb.api, {
        name: "Test Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: NO_SQL_PERSONAL_COLLECTION_ID,
      });

      await visitDocument(page, doc.id);
      await documentContent(page).click();

      // Trigger command menu and select Chart
      await addToDocument(page, "/", false);
      await commandSuggestionItem(page, "Chart").click();

      // Click 'New chart' to open question type menu
      await commandSuggestionItem(page, /New chart/).click();

      // Verify only notebook option is available, not SQL
      await expect(commandSuggestionItem(page, /New SQL query/)).toHaveCount(0);

      // Verify notebook modal opens automatically
      await expect(
        page.getByRole("dialog", { name: "Create new question", exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("anchor links", () => {
    // Helper to create filler paragraphs for scroll tests
    const createFillerParagraphs = (
      count: number,
      startIndex: number,
    ): DocumentNode[] =>
      Array.from({ length: count }, (_, i) => ({
        type: "paragraph",
        attrs: { _id: `filler-paragraph-${startIndex + i}` },
        content: [
          {
            type: "text",
            text: `This is filler paragraph ${startIndex + i} to make the document long enough to require scrolling. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
          },
        ],
      }));

    let doc: { id: number; document: DocumentContent };

    test.beforeEach(async ({ mb }) => {
      doc = await createDocument(mb.api, {
        name: "Anchor Test Document",
        document: {
          content: [
            {
              type: "heading",
              attrs: { level: 1, _id: "heading-block-1" },
              content: [{ type: "text", text: "First Heading" }],
            },
            {
              type: "paragraph",
              attrs: { _id: "paragraph-block-1" },
              content: [{ type: "text", text: "Some content here" }],
            },
            // Add filler content to ensure scrolling is needed
            ...createFillerParagraphs(15, 1),
            {
              type: "heading",
              attrs: { level: 2, _id: "heading-block-2" },
              content: [{ type: "text", text: "Second Heading" }],
            },
            {
              type: "paragraph",
              attrs: { _id: "paragraph-block-2" },
              content: [{ type: "text", text: "More content here" }],
            },
            // More filler to push blockquote down
            ...createFillerParagraphs(10, 16),
            {
              type: "blockquote",
              attrs: { _id: "blockquote-block-1" },
              content: [
                {
                  type: "paragraph",
                  attrs: { _id: "quote-paragraph" },
                  content: [{ type: "text", text: "A nice quote" }],
                },
              ],
            },
          ],
          type: "doc",
        },
        collection_id: null,
      });
    });

    test("should show anchor link icon on left side when hovering over a heading", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);

      await documentContent(page)
        .getByRole("heading", { name: "First Heading", exact: true })
        .hover();

      // Filter to visible one since all blocks have hidden buttons
      await expect(
        page
          .getByTestId("anchor-link-menu")
          .filter({ visible: true })
          .first()
          .getByRole("button", { name: /copy link/i }),
      ).toBeVisible();
    });

    test("should copy anchor URL to clipboard when clicking anchor link", async ({
      page,
      mb,
    }) => {
      await visitDocument(page, doc.id);

      // Port of the CDP Browser.grantPermissions call
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"], {
          origin: mb.baseUrl,
        });

      await documentContent(page)
        .getByRole("heading", { name: "First Heading", exact: true })
        .hover();

      // Filter to visible one since all blocks have hidden buttons
      await page
        .getByTestId("anchor-link-menu")
        .filter({ visible: true })
        .first()
        .getByRole("button", { name: /copy link/i })
        .click();

      await expect(page.getByText("Copied!", { exact: true })).toBeVisible();

      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(clipboardText).toContain("/document/");
      expect(clipboardText).toContain("#heading-block-1");
    });

    test("should scroll to the correct block when navigating with anchor hash", async ({
      page,
    }) => {
      await page.goto(`/document/${doc.id}#heading-block-2`);

      const secondHeading = documentContent(page).getByRole("heading", {
        name: "Second Heading",
        exact: true,
      });
      const firstHeading = documentContent(page).getByRole("heading", {
        name: "First Heading",
        exact: true,
      });

      await expect(secondHeading).toBeVisible();
      await expectInViewport(page, secondHeading, true);
      await expectInViewport(page, firstHeading, false);
    });

    test("should still show comments menu on right side (regression check)", async ({
      page,
    }) => {
      await visitDocument(page, doc.id);

      await documentContent(page)
        .getByRole("heading", { name: "First Heading", exact: true })
        .hover();

      // Filter to visible one since all blocks have hidden menus
      await expect(
        page
          .getByTestId("anchor-link-menu")
          .filter({ visible: true })
          .first()
          .getByRole("button", { name: /copy link/i }),
      ).toBeVisible();

      // Comments button uses ForwardRefLink, so it's a link role not button
      await expect(
        page
          .getByTestId("comments-menu")
          .filter({ visible: true })
          .first()
          .getByRole("link", { name: /comments/i }),
      ).toBeVisible();
    });
  });

  test.describe("error handling", () => {
    test("should display an error toast when creating a new document fails", async ({
      page,
    }) => {
      // setup
      await page.route("**/api/document", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({ status: 500, json: {} })
          : route.fallback(),
      );
      await page.goto("/document/new");

      // make changes and attempt to save. (The upstream "@getCollection"
      // wait is covered by the picker item's own actionability wait.)
      await documentTitleInput(page).pressSequentially("Title");
      await documentSaveButton(page).click();
      await entityPickerModalItem(page, 0, "Our analytics").click();
      await entityPickerModal(page)
        .getByRole("button", { name: "Select", exact: true })
        .click();

      // assert error toast is visible and user can reattempt save
      const toast = page.getByTestId("toast-undo");
      await expect(toast).toBeVisible();
      await expect(toast).toContainText("Error saving document");
      await expect(documentSaveButton(page)).toBeVisible();
    });

    test("should display an error toast when updating a document fails", async ({
      page,
      mb,
    }) => {
      // setup
      await page.route("**/api/document/*", (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({ status: 500, json: {} })
          : route.fallback(),
      );
      const doc = await createDocument(mb.api, {
        name: "Test Document",
        document: { type: "doc", content: [] },
      });
      await visitDocument(page, doc.id);

      // make changes and attempt to save
      await documentContent(page).click();
      await addToDocument(page, "aaa");
      await documentSaveButton(page).click();

      // assert error toast is visible and user can reattempt save
      const toast = page.getByTestId("toast-undo");
      await expect(toast).toBeVisible();
      await expect(toast).toContainText("Error saving document");
      await expect(documentSaveButton(page)).toBeVisible();
    });
  });

  test.describe("revision history", () => {
    test("should be able to view and revert document revisions", async ({
      page,
      mb,
    }) => {
      // Create a document with initial content
      const doc = await createDocument(mb.api, {
        name: "Revision Test Document",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Initial content",
                },
              ],
            },
          ],
        },
      });

      await visitDocument(page, doc.id);

      // Make changes to create a revision
      await documentTitleInput(page).fill("Updated Document Title");
      await documentContent(page).click();
      await addToDocument(page, "Updated content");
      await documentSaveButton(page).click();
      const savedToast = page
        .getByTestId("toast-undo")
        .filter({ hasText: "Document saved" });
      await expect(savedToast).toBeVisible();
      // dismiss after asserting so toasts don't stack into later lookups
      await savedToast.locator(".Icon-close").click({ force: true });

      // Make another change
      await documentContent(page).click();
      await addToDocument(page, "More changes");
      await documentSaveButton(page).click();
      await expect(savedToast).toBeVisible();
      await savedToast.locator(".Icon-close").click({ force: true });

      // Open revision history
      const revisionHistory = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname.startsWith("/api/revision"),
      );
      await page.getByLabel("More options", { exact: true }).click();
      await popover(page).getByText("History", { exact: true }).click();

      await revisionHistory;

      // Verify revision history sidebar is open
      const historyList = page.getByTestId("document-history-list");
      await expect(historyList).toBeVisible();

      // Verify revision entries are displayed
      await expect(historyList.getByText(/created this/)).toBeVisible();

      // Revert to an earlier revision
      const revert = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/revision/revert",
      );
      const documentReload = waitForDocumentGet(page);
      await historyList
        .getByText(/created this/)
        .locator('xpath=ancestor::*[@data-testid="revision-history-event"][1]')
        .getByTestId("question-revert-button")
        .click();
      await revert;
      await documentReload;

      // Verify document was reverted
      await expect(documentTitleInput(page)).toHaveValue(
        "Revision Test Document",
      );
      await expect(documentContent(page)).toContainText("Initial content");
      await expect(documentContent(page)).not.toContainText("Updated content");

      // Verify revert entry appears in history
      await expect(
        historyList.getByText(/reverted to an earlier version/),
      ).toBeVisible();

      // Surface backend error when a revert fails (UXW-310)
      await page.route("**/api/revision/revert", (route) =>
        route.fulfill({
          status: 500,
          json: { message: "Cannot revert: missing document" },
        }),
      );

      const failedRevert = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/revision/revert",
      );
      await historyList.getByTestId("question-revert-button").first().click();
      await failedRevert;

      await expect(
        page
          .getByTestId("toast-undo")
          .filter({ hasText: "Cannot revert: missing document" }),
      ).toBeVisible();
    });
  });
});
