/**
 * Playwright port of e2e/test/scenarios/documents/comments.cy.spec.ts
 *
 * - Snowplow: H.resetSnowplow is a no-op stub (no snowplow-micro container
 *   in the spike harness); the spec had no snowplow assertions anyway.
 * - Email notifications run for REAL against the maildev container
 *   (SMTP :1025, web API :1080) and skip gracefully when it isn't running
 *   (isMaildevRunning gate, same pattern as onboarding-notifications).
 *   The Cypress spec hardcoded http://localhost:4000 in the expected email
 *   links; under per-worker backends the links come from the backend's
 *   site-url setting (restored from the snapshot), so the expectations are
 *   built from that setting instead.
 * - The per-node "Comments" buttons hide via opacity: 0, which Cypress
 *   counts as invisible but Playwright does not — all their visibility
 *   assertions go through the computed-opacity helpers in
 *   support/documents.ts (see that module's header).
 * - cy.realType/realPress → page.keyboard.type/press ("ControlOrMeta" for
 *   the platform meta key).
 * - The "upgrades existing documents" test anchors the Save click on the
 *   PUT /api/document/:id response before reloading (rule 2 — Cypress
 *   relied on the button unmounting).
 * - The Cypress createComment API helper silently dropped the `html`
 *   field the @mention test passed; the port's helper takes content only.
 */
import type { Locator, Page } from "@playwright/test";

import { icon } from "../support/dashboard-cards";
import {
  NORMAL_USER_ID,
  apiForCachedUser,
  closeSidebar,
  createComment,
  createDocument,
  createNodeComment,
  createReaction,
  deleteComment,
  documentContent,
  documentFormattingMenu,
  documentMentionDialog,
  expectNodeButtonVisibility,
  expectVisibleNodeButtonCount,
  getAllComments,
  getBlockquote,
  getBulletList,
  getCodeBlock,
  getCommentByText,
  getCommentInputs,
  getDocumentNodeButton,
  getDocumentNodeButtons,
  getEmbed,
  getEmojiPicker,
  getHeading1,
  getHeading2,
  getHeading3,
  getInboxWithRetry,
  getMentionDialog,
  getNewThreadInput,
  getOrderedList,
  getParagraph,
  getPlaceholder,
  getSidebar,
  lastVisibleNodeButtonHref,
  openAllComments,
  reactToComment,
  reopenCommentByText,
  resolveCommentByText,
  updateComment,
  visitDocument,
  visitDocumentComment,
} from "../support/documents";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import type { MetabaseApi } from "../support/api";
import {
  clearInbox,
  isMaildevRunning,
  setupSMTP,
  type MaildevEmail,
} from "../support/onboarding-extras";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { menu } from "../support/schema-viewer";
import { popover } from "../support/ui";

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};

const META = "ControlOrMeta";

const HEADING_1_ID = "c2187a62-1093-61ee-3174-0bbe64c8bbfa";
const HEADING_2_ID = "82999d0b-d7a7-c0f8-aedf-6ddf737edf78";
const HEADING_3_ID = "190b1dd2-d875-18ae-0ba0-a13c91630c2b";
const PARAGRAPH_ID = "b7fa322a-964e-d668-8d30-c772ef4f0022";
const BULLET_LIST_ID = "3fd94c59-614d-bce7-37ef-c2f46871679a";
const BLOCKQUOTE_ID = "e785b000-1651-c154-e0bd-7313f839bb50";
const ORDERED_LIST_ID = "12fd2bdb-76f7-d07a-b61e-b2d2eee127b5";
const CODE_BLOCK_ID = "b9fec4be-4b44-2c24-7073-10f23522cfd3";
const CARD_EMBED_ID = "cce109c3-4cec-caf1-a569-89fa15410ae1";
const FIRST_REACTION_EMOJI = "😀";
const SECOND_REACTION_EMOJI = "😃";

// keyboard shims for cy.realType / cy.realPress
async function realType(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 25 });
}

async function pressTimes(page: Page, key: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press(key);
  }
}

async function selectCharactersLeft(page: Page, count: number) {
  await pressTimes(page, "Shift+ArrowLeft", count);
}

function documentTitleInput(page: Page): Locator {
  return page.getByRole("textbox", { name: "Document Title", exact: true });
}

function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: "Save", exact: true });
}

function nodeViewWrapperOf(node: Locator): Locator {
  return node.locator("xpath=ancestor-or-self::*[@data-node-view-wrapper][1]");
}

// === document factories (ports of the spec-local create* functions) ===

function loremIpsumDocumentContent() {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, _id: HEADING_1_ID },
        content: [{ type: "text", text: "Heading 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2, _id: HEADING_2_ID },
        content: [{ type: "text", text: "Heading 2" }],
      },
      {
        type: "heading",
        attrs: { level: 3, _id: HEADING_3_ID },
        content: [{ type: "text", text: "Heading 3" }],
      },
      {
        type: "paragraph",
        attrs: { _id: PARAGRAPH_ID },
        content: [{ type: "text", text: "Lorem ipsum dolor sit amet." }],
      },
      {
        type: "bulletList",
        attrs: { _id: BULLET_LIST_ID },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "d89a509c-0a03-3856-8e10-481a58797df1" },
                content: [{ type: "text", text: "Bullet A" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "4080cc00-a884-af5d-8863-643a9490d5ae" },
                content: [{ type: "text", text: "Bullet B" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "f2cb1cfe-5d39-f733-9122-bb5e5f876c17" },
                content: [{ type: "text", text: "Bullet C" }],
              },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        attrs: { _id: BLOCKQUOTE_ID },
        content: [
          {
            type: "paragraph",
            attrs: { _id: "0c48f302-cb8d-ca5b-9c6f-32a7b3723c53" },
            content: [{ type: "text", text: "A famous quote" }],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 1, type: null, _id: ORDERED_LIST_ID },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "1b044a62-221e-0ee9-f68f-3a8e026c073d" },
                content: [{ type: "text", text: "Item 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "53cb6ee7-6012-2fd6-61e1-5a4a22ba38d0" },
                content: [{ type: "text", text: "Item 2" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { _id: "a3ba73b9-4f43-e1f6-4867-832fa0dc2df1" },
                content: [{ type: "text", text: "Item 3" }],
              },
            ],
          },
        ],
      },
      {
        type: "codeBlock",
        attrs: { language: null, _id: CODE_BLOCK_ID },
        content: [{ type: "text", text: "while (true) {}" }],
      },
      {
        type: "resizeNode",
        attrs: { height: 350, minHeight: 280 },
        content: [
          {
            type: "cardEmbed",
            attrs: { id: ORDERS_QUESTION_ID, name: null, _id: CARD_EMBED_ID },
          },
        ],
      },
      {
        type: "paragraph",
        attrs: { _id: "b0ab4c7e-7802-c6f7-2708-0f63bdd0b129" },
      },
    ],
  };
}

function createLoremIpsumDocument(api: MetabaseApi) {
  return createDocument(api, {
    name: "Lorem ipsum",
    document: loremIpsumDocumentContent(),
  });
}

function create1ParagraphDocument(api: MetabaseApi) {
  return createDocument(api, {
    name: "Lorem ipsum",
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { _id: PARAGRAPH_ID },
          content: [{ type: "text", text: "Lorem ipsum dolor sit amet." }],
        },
      ],
    },
  });
}

async function expectDocumentTitle(page: Page) {
  const title = documentTitleInput(page);
  await expect(title).toBeVisible();
  await expect(title).toHaveValue("Lorem ipsum");
}

async function createAndVisitLoremIpsumDocument(page: Page, api: MetabaseApi) {
  const { id } = await createLoremIpsumDocument(api);
  await visitDocument(page, id);
  await expectDocumentTitle(page);
  return id;
}

async function createAndVisit1ParagraphDocument(page: Page, api: MetabaseApi) {
  const { id } = await create1ParagraphDocument(api);
  await visitDocument(page, id);
  await expectDocumentTitle(page);
  return id;
}

async function startNewCommentIn1ParagraphDocument(
  page: Page,
  api: MetabaseApi,
) {
  const documentId = await createAndVisit1ParagraphDocument(page, api);

  await getParagraph(page).hover();

  const button = getDocumentNodeButton(page, {
    targetId: documentId,
    childTargetId: PARAGRAPH_ID,
  });
  await expectNodeButtonVisibility(button, true);
  await button.click();

  const sidebar = getSidebar(page);
  await expect(
    sidebar.getByRole("heading", { name: "Comments about this", exact: true }),
  ).toBeVisible();
  await getNewThreadInput(sidebar).click();

  return documentId;
}

function createParagraphComment(
  api: MetabaseApi,
  documentId: number,
  text: string,
  parent_comment_id: number | null = null,
) {
  return createNodeComment(api, documentId, PARAGRAPH_ID, text, parent_comment_id);
}

test.describe("document comments", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await resetSnowplow();
  });

  test("allows to comment on every type of node", async ({ page, mb }) => {
    test.setTimeout(240_000); // 9 sequential per-node UI round trips

    const documentId = await createAndVisitLoremIpsumDocument(page, mb.api);

    // does not need schema adjustments by default
    await expect(saveButton(page)).toHaveCount(0);

    // does not have any comments by default
    await expect(
      page.getByRole("link", { name: "All comments", exact: true }),
    ).toHaveCount(0);

    const nodes: Array<{
      childTargetId: string;
      getNodeElement: () => Locator;
      isCardEmbedNode?: boolean;
    }> = [
      { childTargetId: HEADING_1_ID, getNodeElement: () => getHeading1(page) },
      { childTargetId: HEADING_2_ID, getNodeElement: () => getHeading2(page) },
      { childTargetId: HEADING_3_ID, getNodeElement: () => getHeading3(page) },
      { childTargetId: PARAGRAPH_ID, getNodeElement: () => getParagraph(page) },
      { childTargetId: BULLET_LIST_ID, getNodeElement: () => getBulletList(documentContent(page)) },
      { childTargetId: BLOCKQUOTE_ID, getNodeElement: () => getBlockquote(documentContent(page)) },
      { childTargetId: ORDERED_LIST_ID, getNodeElement: () => getOrderedList(documentContent(page)) },
      { childTargetId: CODE_BLOCK_ID, getNodeElement: () => getCodeBlock(documentContent(page)) },
      {
        childTargetId: CARD_EMBED_ID,
        getNodeElement: () => getEmbed(page),
        isCardEmbedNode: true,
      },
    ];

    for (const { childTargetId, getNodeElement, isCardEmbedNode = false } of nodes) {
      await page.mouse.click(0, 0);

      const node = getNodeElement();
      const wrapper = nodeViewWrapperOf(node);

      if (isCardEmbedNode) {
        await node.scrollIntoViewIfNeeded();
        await node.hover();
        await icon(node, "ellipsis").click();
        await menu(page).getByText("Comment", { exact: true }).click();
      } else {
        const button = getDocumentNodeButton(page, {
          targetId: documentId,
          childTargetId,
        });
        await expectNodeButtonVisibility(button, false);
        await expect(wrapper).toHaveAttribute("aria-expanded", "false");
        await node.scrollIntoViewIfNeeded();
        await node.hover();
        await expectNodeButtonVisibility(button, true);
        await button.click();
      }

      const sidebar = getSidebar(page);
      await expect(
        sidebar.getByRole("heading", {
          name: "Comments about this",
          exact: true,
        }),
      ).toBeVisible();
      await getNewThreadInput(sidebar).click();
      await realType(page, "Hello");
      await page.keyboard.press(`${META}+Enter`);
      await expect(getPlaceholder(getNewThreadInput(sidebar))).toBeVisible();

      // highlights related document node
      await expect(wrapper).toHaveAttribute("aria-expanded", "true");

      // shows comments button when comments for the node are open
      const buttonWithComments = getDocumentNodeButton(page, {
        targetId: documentId,
        childTargetId,
        hasComments: true,
        isCardEmbedNode,
      });
      if (isCardEmbedNode) {
        await expect(buttonWithComments).toBeVisible();
      } else {
        await expectNodeButtonVisibility(buttonWithComments, true);
      }
      await expect(buttonWithComments).toContainText("1");

      // can close the sidebar with a keyboard shortcut
      await page.keyboard.press("Escape");
      await expect(sidebar).toHaveCount(0);

      await expect(wrapper).toHaveAttribute("aria-expanded", "false");

      // shows comments button when node has unresolved comments
      if (isCardEmbedNode) {
        await expect(buttonWithComments).toBeVisible();
      } else {
        await expectNodeButtonVisibility(buttonWithComments, true);
      }
    }
  });

  test("allows to split a paragraph in two, and then to comment on both paragraphs", async ({
    page,
    mb,
  }) => {
    const targetId = await startNewCommentIn1ParagraphDocument(page, mb.api);

    await realType(page, "Hello");
    await page.keyboard.press(`${META}+Enter`);
    await expect(
      getPlaceholder(getNewThreadInput(getSidebar(page))),
    ).toBeVisible();
    await closeSidebar(page);

    await documentContent(page).click();
    await pressTimes(page, "ArrowLeft", "lor sit amet.".length);
    await page.keyboard.press("Enter");
    await saveButton(page).click();
    await expect(saveButton(page)).toHaveCount(0);

    await expectNodeButtonVisibility(
      getDocumentNodeButton(page, {
        targetId,
        childTargetId: PARAGRAPH_ID,
        hasComments: true,
      }),
      true,
    );

    await expectVisibleNodeButtonCount(page, 1);
    await getParagraph(page, "lor sit amet.").hover();
    await expectVisibleNodeButtonCount(page, 2);

    const href = await lastVisibleNodeButtonHref(page);
    expect(href).toBeTruthy();
    const lastButton = page.locator(`[href="${href}"]`);
    await expect(lastButton).not.toContainText("1");
    await lastButton.click();

    const sidebar = getSidebar(page);
    await expect(
      sidebar.getByRole("heading", { name: "Comments about this", exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Hello", { exact: true })).toHaveCount(0);
  });

  test("upgrades existing documents without _id attributes in nodes that support comments", async ({
    page,
    mb,
  }) => {
    const { id: documentId } = await createDocument(mb.api, {
      name: "Lorem ipsum",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            /* Intentionally no attrs._id */
            content: [{ type: "text", text: "Lorem ipsum dolor sit amet." }],
          },
        ],
      },
    });
    await visitDocument(page, documentId);
    await expectDocumentTitle(page);

    // document is dirty after schema migration
    await expect(saveButton(page)).toBeVisible();
    const documentSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === `/api/document/${documentId}`,
    );
    await saveButton(page).click();
    await documentSaved;
    await expect(saveButton(page)).toHaveCount(0);

    await page.reload();

    // document is not dirty after persisting the missing _id
    await expectDocumentTitle(page);
    await expect(saveButton(page)).toHaveCount(0);
  });

  test("allows to create / update / delete comments", async ({ page, mb }) => {
    await startNewCommentIn1ParagraphDocument(page, mb.api);

    const sidebar = getSidebar(page);
    const sends = sidebar.getByLabel("Send", { exact: true });
    const inputs = getCommentInputs(sidebar);

    // does not allow to send empty comments
    await page.keyboard.press(`${META}+Enter`);
    await expect(sends).toBeDisabled();
    await expect(inputs).toHaveCount(0);

    // allows to start threads and add replies with keyboard shortcut
    await getNewThreadInput(sidebar).click();
    await realType(page, "1st thread");
    await page.keyboard.press(`${META}+Enter`);
    const timestamps = sidebar.getByText("a few seconds ago", { exact: true });
    await expect(timestamps).toHaveCount(1);
    await expect(timestamps.first()).toBeVisible();

    await expect(inputs).toHaveCount(2);
    await inputs.last().click();
    await realType(page, "Reply 1");
    await page.keyboard.press(`${META}+Enter`);
    await expect(timestamps).toHaveCount(2);

    await expect(inputs).toHaveCount(3);
    await inputs.last().click();
    await realType(page, "Reply 2");
    await page.keyboard.press(`${META}+Enter`);

    // allows to start threads and add replies with the button
    await getNewThreadInput(sidebar).click();
    await realType(page, "2nd thread");
    await expect(sends).toHaveCount(2);
    await sends.last().click();

    await expect(inputs).toHaveCount(6);
    await inputs.last().click();
    await realType(page, "Reply A");
    await expect(sends).toHaveCount(3);
    await sends.nth(1).click();

    await expect(inputs).toHaveCount(7);
    await inputs.last().click();
    await realType(page, "Reply B");
    await expect(sends).toHaveCount(3);
    await sends.nth(1).click();

    // allows to delete a comment
    const replyA = getCommentByText(sidebar, "Reply A");
    await replyA.hover();
    await replyA.getByLabel("More actions", { exact: true }).click();
    await popover(page).getByText("Delete", { exact: true }).click();

    await expect(sidebar.getByText("Reply A", { exact: true })).toHaveCount(0);
    await expect(
      sidebar.getByText("This comment was deleted.", { exact: true }),
    ).toHaveCount(0);

    // allows to delete a comment that starts a thread
    const firstThread = getCommentByText(sidebar, "1st thread");
    await firstThread.hover();
    await firstThread.getByLabel("More actions", { exact: true }).click();
    await popover(page).getByText("Delete", { exact: true }).click();

    await expect(sidebar.getByText("1st thread", { exact: true })).toHaveCount(0);
    await expect(
      sidebar.getByText("This comment was deleted.", { exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Reply 1", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Reply 2", { exact: true })).toBeVisible();

    // allows to edit a comment
    const reply1 = getCommentByText(sidebar, "Reply 1");
    await reply1.hover();
    await reply1.getByLabel("More actions", { exact: true }).click();
    await popover(page).getByText("Edit", { exact: true }).click();
    // editor should be autofocused when editing
    await realType(page, "My ");
    await page.keyboard.press(`${META}+Enter`);

    const myReply1 = getCommentByText(sidebar, "My Reply 1");
    await expect(myReply1).toBeVisible();
    await expect(myReply1.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );

    // allows to cancel editing a comment with Esc
    const reply2 = getCommentByText(sidebar, "Reply 2");
    await reply2.hover();
    await reply2.getByLabel("More actions", { exact: true }).click();
    await popover(page).getByText("Edit", { exact: true }).click();
    await expect(reply2.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "true",
    );

    await page.keyboard.press("Escape");
    await expect(reply2.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
    await expect(sidebar).toBeVisible();

    // subsequent Esc should close the modal
    await page.keyboard.press("Escape");
    await expect(sidebar).toHaveCount(0);
  });

  test("shows comment button with unresolved, undeleted comments count", async ({
    page,
    mb,
  }) => {
    const { id: documentId } = await create1ParagraphDocument(mb.api);

    const comment = (text: string, parent_comment_id: number | null = null) =>
      createParagraphComment(mb.api, documentId, text, parent_comment_id);

    // 3-comments thread with 1st comment deleted
    {
      const root = await comment("Test 1");
      await comment("Test 2", root.id);
      await comment("Test 3", root.id);
      await deleteComment(mb.api, root.id);
    }

    // 3-comments thread with 2nd comment deleted
    {
      const root = await comment("Test A");
      const testB = await comment("Test B", root.id);
      await deleteComment(mb.api, testB.id);
      await comment("Test C", root.id);
    }

    // resolved 3-comments thread with 1st comment deleted
    {
      const root = await comment("Test I");
      await comment("Test II", root.id);
      await comment("Test III", root.id);
      await deleteComment(mb.api, root.id);
      await updateComment(mb.api, { id: root.id, is_resolved: true });
    }

    // 3-comments thread with all comments deleted
    {
      const root = await comment("Test X");
      const testY = await comment("Test Y", root.id);
      await deleteComment(mb.api, testY.id);
      const testZ = await comment("Test Z", root.id);
      await deleteComment(mb.api, testZ.id);
      await deleteComment(mb.api, root.id);
    }

    // resolved 3-comments thread with all comments deleted
    {
      const root = await comment("Test D");
      const testE = await comment("Test E", root.id);
      await deleteComment(mb.api, testE.id);
      const testF = await comment("Test F", root.id);
      await deleteComment(mb.api, testF.id);
      await updateComment(mb.api, { id: root.id, is_resolved: true });
      await deleteComment(mb.api, root.id);
    }

    await visitDocument(page, documentId);
    await expectDocumentTitle(page);

    const button = getDocumentNodeButton(page, {
      targetId: documentId,
      childTargetId: PARAGRAPH_ID,
      hasComments: true,
    });
    await expectNodeButtonVisibility(button, true);
    await expect(button).toHaveText("4");
    await button.click();

    const sidebar = getSidebar(page);
    await expect(
      sidebar.getByRole("heading", { name: "Comments about this", exact: true }),
    ).toBeVisible();

    const visibleInOpenTab = ["Test 2", "Test 3", "Test A", "Test C"];
    const hiddenInOpenTab = [
      "Test 1",
      "Test B",
      "Test I",
      "Test II",
      "Test III",
      "Test X",
      "Test Y",
      "Test Z",
      "Test D",
      "Test E",
      "Test F",
    ];
    for (const text of visibleInOpenTab) {
      await expect(sidebar.getByText(text, { exact: true })).toBeVisible();
    }
    for (const text of hiddenInOpenTab) {
      await expect(sidebar.getByText(text, { exact: true })).toHaveCount(0);
    }

    await sidebar.getByRole("tab", { name: "Resolved (2)", exact: true }).click();

    const visibleInResolvedTab = ["Test II", "Test III"];
    const hiddenInResolvedTab = [
      "Test 1",
      "Test 2",
      "Test 3",
      "Test A",
      "Test B",
      "Test C",
      "Test I",
      "Test X",
      "Test Y",
      "Test Z",
      "Test D",
      "Test E",
      "Test F",
    ];
    for (const text of visibleInResolvedTab) {
      await expect(sidebar.getByText(text, { exact: true })).toBeVisible();
    }
    for (const text of hiddenInResolvedTab) {
      await expect(sidebar.getByText(text, { exact: true })).toHaveCount(0);
    }
  });

  test("does not show comment button when all threads are resolved", async ({
    page,
    mb,
  }) => {
    const { id: documentId } = await create1ParagraphDocument(mb.api);

    const comment = (text: string, parent_comment_id: number | null = null) =>
      createParagraphComment(mb.api, documentId, text, parent_comment_id);

    // resolved 3-comments thread
    {
      const root = await comment("Test 1");
      await comment("Test 2", root.id);
      await comment("Test 3", root.id);
      await updateComment(mb.api, { id: root.id, is_resolved: true });
    }

    // resolved 3-comments thread
    {
      const root = await comment("Test I");
      await comment("Test II", root.id);
      await comment("Test III", root.id);
      await updateComment(mb.api, { id: root.id, is_resolved: true });
    }

    // 3-comments thread with all comments deleted
    {
      const root = await comment("Test X");
      const testY = await comment("Test Y", root.id);
      await deleteComment(mb.api, testY.id);
      const testZ = await comment("Test Z", root.id);
      await deleteComment(mb.api, testZ.id);
      await deleteComment(mb.api, root.id);
    }

    await visitDocument(page, documentId);
    await expectDocumentTitle(page);

    await page.getByPlaceholder("New document").click();
    await expectNodeButtonVisibility(
      getDocumentNodeButton(page, {
        targetId: documentId,
        childTargetId: PARAGRAPH_ID,
      }),
      false,
    );
  });

  test("shows other users comments and does not show comments from other nodes", async ({
    page,
    mb,
  }) => {
    const { id: documentId } = await createLoremIpsumDocument(mb.api);
    const normalApi = apiForCachedUser(mb.api.requestContext, "normal");

    await createNodeComment(mb.api, documentId, HEADING_1_ID, "Test X");

    const root = await createParagraphComment(mb.api, documentId, "Test 1");
    await createParagraphComment(normalApi, documentId, "Test A", root.id);
    await createParagraphComment(mb.api, documentId, "Test 2", root.id);
    await createParagraphComment(normalApi, documentId, "Test B", root.id);

    await mb.signInAsNormalUser();
    await visitDocumentComment(page, documentId, PARAGRAPH_ID, root.id);

    const sidebar = getSidebar(page);
    const expectAuthor = async (text: string, name: string, initials: string) => {
      const comment = getCommentByText(sidebar, text);
      await expect(comment).toContainText(name);
      await expect(comment).toContainText(initials);
    };
    await expectAuthor("Test 1", "Bobby Tables", "BT");
    await expectAuthor("Test A", "Robert Tableton", "RT");
    await expectAuthor("Test 2", "Bobby Tables", "BT");
    await expectAuthor("Test B", "Robert Tableton", "RT");

    await expect(sidebar.getByText("Test X", { exact: true })).toHaveCount(0);

    const test1 = getCommentByText(sidebar, "Test 1");
    await test1.hover();
    await test1.getByLabel("More actions", { exact: true }).click();

    // does not allow to edit or delete other people's comments
    await expect(popover(page)).toBeVisible();
    await expect(popover(page).getByText(/edit/i)).toHaveCount(0);
    await expect(popover(page).getByText(/delete|remove/i)).toHaveCount(0);

    const headingButton = getDocumentNodeButton(page, {
      targetId: documentId,
      childTargetId: HEADING_1_ID,
      hasComments: true,
    });
    await expectNodeButtonVisibility(headingButton, true);
    await expect(headingButton).toContainText("1");
    await headingButton.click();

    await expect(sidebar.getByText("Test X", { exact: true })).toBeVisible();
    for (const text of ["Test 1", "Test 2", "Test A", "Test B"]) {
      await expect(sidebar.getByText(text, { exact: true })).toHaveCount(0);
    }
  });

  test("allows editing the document when comments are open", async ({
    page,
    mb,
  }) => {
    const { id: documentId } = await create1ParagraphDocument(mb.api);

    await visitDocumentComment(page, documentId, PARAGRAPH_ID);

    const main = page.locator("main");
    await documentContent(page).click();
    await realType(page, "test");
    await expect(
      main.getByRole("button", { name: "Save", exact: true }),
    ).toBeVisible();

    await expect(
      documentContent(page).locator('[contenteditable="true"]').first(),
    ).toBeVisible();
    await expect(documentFormattingMenu(page)).toHaveCount(0);
  });

  test("allows opening comments when document has changes", async ({
    page,
    mb,
  }) => {
    const { id: documentId } = await create1ParagraphDocument(mb.api);
    await createParagraphComment(mb.api, documentId, "Test");

    await visitDocument(page, documentId);
    await expectDocumentTitle(page);

    await getParagraph(page).hover();
    await expectNodeButtonVisibility(
      getDocumentNodeButton(page, {
        targetId: documentId,
        childTargetId: PARAGRAPH_ID,
        hasComments: true,
      }),
      true,
    );

    await documentContent(page).click();
    await realType(page, "xyz");

    await getParagraph(page, "Lorem ipsum dolor sit amet.xyz").hover();

    await page.getByLabel("Comments", { exact: true }).click();
    await expect(getSidebar(page)).toBeVisible();

    await page.getByLabel("Show all comments", { exact: true }).click();
    await expect(getSidebar(page)).toBeVisible();
  });

  test.describe("comment editor", () => {
    async function expectFormattedComment(page: Page) {
      const firstInput = getCommentInputs(getSidebar(page)).first();
      await expect(firstInput.locator("strong")).toHaveText("bold");
      await expect(firstInput.locator("em")).toHaveText("italic");
      await expect(firstInput.locator("s")).toHaveText("strike");
      await expect(firstInput.locator("code")).toHaveText("code");
    }

    test("supports basic formatting with markdown", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "**bold** *italic* ~~strike~~ `code`");
      await page.keyboard.press(`${META}+Enter`);

      await expectFormattedComment(page);
    });

    test("supports basic formatting with keyboard shortcuts", async ({
      page,
      mb,
    }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "bold italic strike code");

      await selectCharactersLeft(page, "code".length);
      await page.keyboard.press(`${META}+e`);

      await pressTimes(page, "ArrowLeft", 2);
      await selectCharactersLeft(page, "strike".length);
      await page.keyboard.press(`${META}+Shift+S`);

      await pressTimes(page, "ArrowLeft", 2);
      await selectCharactersLeft(page, "italic".length);
      await page.keyboard.press(`${META}+i`);

      await pressTimes(page, "ArrowLeft", 2);
      await selectCharactersLeft(page, "bold".length);
      await page.keyboard.press(`${META}+b`);

      await page.getByRole("button", { name: "Send", exact: true }).click();

      await expectFormattedComment(page);
    });

    test("supports basic formatting with formatting menu", async ({
      page,
      mb,
    }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "bold italic strike code");

      const formatWith = async (buttonName: RegExp) => {
        const formattingMenu = documentFormattingMenu(page);
        await expect(formattingMenu).toBeVisible();
        await formattingMenu.getByRole("button", { name: buttonName }).click();
      };

      await selectCharactersLeft(page, "code".length);
      await formatWith(/format_code/);

      await pressTimes(page, "ArrowLeft", 2);
      await selectCharactersLeft(page, "strike".length);
      await formatWith(/text_strike/);

      await pressTimes(page, "ArrowLeft", 2);
      await selectCharactersLeft(page, "italic".length);
      await formatWith(/text_italic/);

      await pressTimes(page, "ArrowLeft", 2);
      await selectCharactersLeft(page, "bold".length);
      await formatWith(/text_bold/);

      await page.keyboard.press(`${META}+Enter`);

      await expectFormattedComment(page);
    });

    test("supports mentions and can mention yourself", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      const dialog = documentMentionDialog(page);

      await realType(page, "@");
      await expect(dialog.getByText("Lorem ipsum", { exact: true })).toBeVisible();
      await expect(
        dialog.getByText("First collection", { exact: true }),
      ).toBeVisible();
      await expect(dialog.getByText("Browse all", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Bobby Tables", { exact: true })).toHaveCount(0);

      await realType(page, "tAbLe");
      await expect(dialog.getByText("Lorem ipsum", { exact: true })).toHaveCount(0);
      await expect(dialog.getByText("Bobby Tables", { exact: true })).toBeVisible();
      await expect(
        dialog.getByText("No Collection Tableton", { exact: true }),
      ).toBeVisible();

      await realType(page, "s");
      await expect(dialog.getByText("Bobby Tables", { exact: true })).toBeVisible();
      await expect(
        dialog.getByText("Bobby Tables's Personal Collection", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("No Collection Tableton", { exact: true }),
      ).toHaveCount(0);

      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);

      // closes suggestion dialog but not the comments modal on Esc
      await realType(page, " @no");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(getSidebar(page)).toBeVisible();

      await pressTimes(page, "Backspace", 3);
      await realType(page, "@none");
      await dialog.getByText("None Tableton", { exact: true }).click();

      const sidebar = getSidebar(page);
      const input = getNewThreadInput(sidebar);
      await expect(input.getByText("@Bobby Tables", { exact: true })).toBeVisible();
      await expect(input.getByText("@None Tableton", { exact: true })).toBeVisible();

      await page.keyboard.press(`${META}+Enter`);

      await expect(
        sidebar.getByText("a few seconds ago", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("@Bobby Tables", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("@None Tableton", { exact: true }),
      ).toBeVisible();
    });

    test("supports emojis", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      const picker = getEmojiPicker(page);

      await realType(page, ":s");
      await expect(picker).toBeVisible();
      await expect(picker).toContainText("😄");
      await expect(picker).toContainText("💦");

      // can filter emojis
      await realType(page, "mile");
      await expect(picker).toBeVisible();
      await expect(picker).toContainText("😄");
      await expect(picker).not.toContainText("💦");

      // can use arrow keys for navigation within the emoji picker
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");

      await expect(picker).toHaveCount(0);

      // can submit first suggestion with Enter
      await realType(page, ":eggplant");
      await page.keyboard.press("Enter");

      // closes suggestion dialog but not the comments modal on Esc
      await realType(page, ":eg");
      await page.keyboard.press("Escape");
      await expect(picker).toHaveCount(0);
      await expect(getSidebar(page)).toBeVisible();

      // can use mouse to select emoji
      await pressTimes(page, "Backspace", 3);
      await realType(page, ":egg");
      await picker.getByText("🥚", { exact: true }).click();

      const sidebar = getSidebar(page);
      const input = getNewThreadInput(sidebar);
      await expect(input).toContainText("😊");
      await expect(input).toContainText("🍆");
      await expect(input).toContainText("🥚");

      await page.keyboard.press(`${META}+Enter`);

      // cy.contains → first match
      await expect(sidebar.getByText("😊").first()).toBeVisible();
      await expect(sidebar.getByText("🍆").first()).toBeVisible();
      await expect(sidebar.getByText("🥚").first()).toBeVisible();
    });
  });

  test.describe("resolve / unresolve", () => {
    test("should resolve / unresolve basic discussion", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      const commentText = "Test resolving";
      await realType(page, commentText);
      await page.keyboard.press(`${META}+Enter`);

      await resolveCommentByText(page, commentText);

      await expect(page.getByTestId("discussion")).toHaveCount(0);
      const resolvedTab = page.getByTestId("comments-resolved-tab");
      await expect(resolvedTab).toBeVisible();
      await expect(resolvedTab).toContainText("Resolved (1)");
      await resolvedTab.click();

      await reopenCommentByText(page, commentText);

      await expect(page.getByTestId("comments-resolved-tab")).toHaveCount(0);
    });

    test("only first comment in a thread can be resolved", async ({
      page,
      mb,
    }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "Main comment");
      await page.keyboard.press(`${META}+Enter`);

      const inputs = getCommentInputs(getSidebar(page));
      await expect(inputs).toHaveCount(2);
      await inputs.last().click();
      await realType(page, "Reply 1");
      await page.keyboard.press(`${META}+Enter`);

      const reply1 = getCommentByText(getSidebar(page), "Reply 1");
      await reply1.hover();
      await expect(reply1.getByTestId("comment-action-panel")).toBeVisible();
      await expect(
        reply1.getByTestId("comment-action-panel-resolve"),
      ).toHaveCount(0);

      const mainComment = getCommentByText(getSidebar(page), "Main comment");
      await mainComment.hover();
      await expect(mainComment.getByTestId("comment-action-panel")).toBeVisible();
      await expect(
        mainComment.getByTestId("comment-action-panel-resolve"),
      ).toBeVisible();
    });

    test("does not show resolved tab when there are no resolved comments", async ({
      page,
      mb,
    }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "Main comment");
      await page.keyboard.press(`${META}+Enter`);

      await expect(page.getByTestId("comments-resolved-tab")).toHaveCount(0);
    });

    test("resolved threads show all comments in them", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "Main comment");
      await page.keyboard.press(`${META}+Enter`);

      const inputs = getCommentInputs(getSidebar(page));
      await expect(inputs).toHaveCount(2);
      await inputs.last().click();
      await realType(page, "Reply 1");
      await page.keyboard.press(`${META}+Enter`);

      await resolveCommentByText(page, "Main comment");
      const resolvedTab = page.getByTestId("comments-resolved-tab");
      await expect(resolvedTab).toBeVisible();
      await resolvedTab.click();

      await expect(getCommentByText(page, "Main comment")).toBeVisible();
      await expect(getCommentByText(page, "Reply 1")).toBeVisible();
    });

    test("should be possible to resolve and unresolve a thread when the first comment is deleted", async ({
      page,
      mb,
    }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "Main comment");
      await page.keyboard.press(`${META}+Enter`);

      const inputs = getCommentInputs(getSidebar(page));
      await expect(inputs).toHaveCount(2);
      await inputs.last().click();
      await realType(page, "Reply 1");
      await page.keyboard.press(`${META}+Enter`);

      const mainComment = getCommentByText(getSidebar(page), "Main comment");
      await mainComment.hover();
      await expect(mainComment.getByTestId("comment-action-panel")).toBeVisible();
      const moreActions = mainComment.getByTestId(
        "comment-action-panel-more-actions",
      );
      await expect(moreActions).toBeVisible();
      await moreActions.click();

      const deleteAction = page.getByTestId("comment-action-panel-delete");
      await expect(deleteAction).toBeVisible();
      await deleteAction.click();

      const deletedComment = page.getByTestId("discussion-comment-deleted");
      await expect(deletedComment).toBeVisible();
      await deletedComment.hover();
      await expect(
        deletedComment.getByTestId("comment-action-panel"),
      ).toBeVisible();
      const resolveAction = deletedComment.getByTestId(
        "comment-action-panel-resolve",
      );
      await expect(resolveAction).toBeVisible();
      await resolveAction.click();

      await expect(page.getByTestId("comments-resolved-tab")).toBeVisible();
      await expect(deletedComment).toHaveCount(0);

      // unresolving a thread when the first comment is deleted
      await page.getByRole("tab", { name: "Resolved (1)", exact: true }).click();
      await deletedComment.hover();
      await page.getByLabel("Re-open", { exact: true }).click();

      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(getNewThreadInput(getSidebar(page))).toBeVisible();
    });

    test("should be possible to resolve a thread created by another user", async ({
      page,
      mb,
    }) => {
      const documentId = await startNewCommentIn1ParagraphDocument(
        page,
        mb.api,
      );

      await realType(page, "Main comment");
      await page.keyboard.press(`${META}+Enter`);
      await expect(getCommentByText(getSidebar(page), "Main comment")).toBeVisible();

      await mb.signInAsNormalUser();
      await visitDocument(page, documentId);
      await page.getByLabel("Show all comments", { exact: true }).click();
      await expect(getCommentByText(getSidebar(page), "Main comment")).toBeVisible();
      await resolveCommentByText(page, "Main comment");

      await expect(page.getByTestId("comments-resolved-tab")).toBeVisible();
      await expect(page.getByTestId("discussion-comment")).toHaveCount(0);
    });

    test("should not allow replies for resolved threads", async ({
      page,
      mb,
    }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "Main comment");
      await page.keyboard.press(`${META}+Enter`);

      await resolveCommentByText(page, "Main comment");
      const resolvedTab = page.getByTestId("comments-resolved-tab");
      await expect(resolvedTab).toBeVisible();
      await resolvedTab.click();

      // only the comment content
      await expect(getCommentInputs(getSidebar(page))).toHaveCount(1);
    });
  });

  test.describe("links", () => {
    let documentId: number;
    let headingCommentId: number;

    test.beforeEach(async ({ mb, context }) => {
      // Port of H.grantClipboardPermissions.
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      ({ id: documentId } = await createLoremIpsumDocument(mb.api));

      ({ id: headingCommentId } = await createNodeComment(
        mb.api,
        documentId,
        HEADING_1_ID,
        "Foo",
      ));
      await createNodeComment(mb.api, documentId, HEADING_1_ID, "Bar");
      await createNodeComment(mb.api, documentId, PARAGRAPH_ID, "Paragraph Foo");
    });

    test("copies and opens a link to a comment", async ({ page }) => {
      await visitDocument(page, documentId);

      await getDocumentNodeButton(page, {
        targetId: documentId,
        childTargetId: HEADING_1_ID,
        hasComments: true,
      }).click();

      const fooComment = getCommentByText(getSidebar(page), "Foo");
      await fooComment.hover();
      await fooComment.getByLabel("More actions", { exact: true }).click();

      await popover(page).getByText("Copy link", { exact: true }).click();
      await expect(
        undoToast(page).getByText("Copied link", { exact: true }),
      ).toBeVisible();

      const link = await page.evaluate(() => navigator.clipboard.readText());
      await page.goto(link);

      expect(page.url()).toMatch(
        new RegExp(
          `/document/${documentId}/comments/${HEADING_1_ID}#comment-${headingCommentId}$`,
        ),
      );

      await expect(getCommentByText(getSidebar(page), "Foo")).toHaveAttribute(
        "aria-current",
        "location",
      );
    });

    test("opens a comment link in its thread vs. 'All comments'", async ({
      page,
    }) => {
      await visitDocumentComment(
        page,
        documentId,
        HEADING_1_ID,
        headingCommentId,
      );

      const sidebar = getSidebar(page);
      await expect(
        sidebar.getByRole("heading", { name: "All comments", exact: true }),
      ).toHaveCount(0);
      await expect(
        sidebar.getByRole("heading", {
          name: "Comments about this",
          exact: true,
        }),
      ).toBeVisible();
      await expect(sidebar.getByTestId("discussion-comment")).toHaveCount(2);
      await expect(getCommentByText(sidebar, "Foo")).toHaveAttribute(
        "aria-current",
        "location",
      );
    });

    test("opens a link to a resolved comment correctly", async ({
      page,
      mb,
    }) => {
      await updateComment(mb.api, { id: headingCommentId, is_resolved: true });
      await visitDocumentComment(
        page,
        documentId,
        HEADING_1_ID,
        headingCommentId,
      );

      const sidebar = getSidebar(page);
      await expect(sidebar.getByTestId("comments-resolved-tab")).toBeVisible();
      await expect(sidebar.getByTestId("discussion-comment")).toHaveCount(1);
      await expect(getCommentByText(sidebar, "Foo")).toHaveAttribute(
        "aria-current",
        "location",
      );
    });

    test("changes between open/resolved tabs when resolving/unresolving a linked comment", async ({
      page,
    }) => {
      await visitDocumentComment(
        page,
        documentId,
        HEADING_1_ID,
        headingCommentId,
      );

      const resolvedTab = getSidebar(page).getByTestId("comments-resolved-tab");
      await expect(resolvedTab).toHaveCount(0);
      await resolveCommentByText(page, "Foo");

      await expect(resolvedTab).toBeVisible();

      await reopenCommentByText(page, "Foo");
      await expect(resolvedTab).toHaveCount(0);
    });
  });

  test.describe("all comments sidebar", () => {
    test("should all threads new to old", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);
      await realType(page, "thread 1");
      await page.keyboard.press(`${META}+Enter`);

      await getNewThreadInput(getSidebar(page)).click();
      await realType(page, "thread 2");
      await page.keyboard.press(`${META}+Enter`);

      await openAllComments(page);

      const comments = getAllComments(page);
      await expect(comments.nth(0)).toContainText("thread 2");
      await expect(comments.nth(1)).toContainText("thread 1");
    });

    test("does not allow to create new threads", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);
      await realType(page, "thread 1");
      await page.keyboard.press(`${META}+Enter`);

      await openAllComments(page);

      await expect(getNewThreadInput(page)).toHaveCount(0);
    });

    test("should render placeholder when no comments", async ({ page, mb }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      await visitDocument(page, documentId);

      const { pathname } = new URL(page.url());
      await page.goto(`${pathname}/comments/all`);

      const sidebar = getSidebar(page);
      await expect(sidebar).toContainText("All comments");
      await expect(sidebar).toContainText("No comments");
    });

    test("should render placeholder when no open comments, but resolved", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      await createParagraphComment(mb.api, documentId, "Test 1");

      await visitDocument(page, documentId);

      await getDocumentNodeButtons(page).nth(0).click();
      await resolveCommentByText(page, "Test 1");
      await openAllComments(page);

      const sidebar = getSidebar(page);
      await expect(sidebar).toContainText("All comments");
      await expect(sidebar).toContainText("No comments");
    });
  });

  test.describe("comment reactions", () => {
    test("should allow to add multiple reactions to a comment", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      await createParagraphComment(mb.api, documentId, "Test 1");

      await visitDocumentComment(page, documentId, PARAGRAPH_ID);

      await reactToComment(page, "Test 1", FIRST_REACTION_EMOJI);
      await reactToComment(page, "Test 1", SECOND_REACTION_EMOJI);

      const reactions = getSidebar(page).getByTestId("discussion-reactions");
      await expect(reactions).toContainText(
        new RegExp(`${FIRST_REACTION_EMOJI}\\s*1`),
      );
      await expect(reactions).toContainText(
        new RegExp(`${SECOND_REACTION_EMOJI}\\s*1`),
      );
    });

    test("should allow to remove own reactions from a comment", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      await createParagraphComment(mb.api, documentId, "Test 1");

      await visitDocumentComment(page, documentId, PARAGRAPH_ID);

      await reactToComment(page, "Test 1", FIRST_REACTION_EMOJI);
      await reactToComment(page, "Test 1", SECOND_REACTION_EMOJI);

      const reactions = getSidebar(page).getByTestId("discussion-reactions");
      const firstReaction = reactions.getByText(FIRST_REACTION_EMOJI, {
        exact: true,
      });
      await expect(firstReaction).toBeVisible();
      await firstReaction.click();
      await expect(firstReaction).toHaveCount(0);
    });

    test("should allow to react on other people's reactions", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      const { id: commentId } = await createParagraphComment(
        mb.api,
        documentId,
        "Test 1",
      );
      await createReaction(mb.api, {
        comment_id: commentId,
        emoji: FIRST_REACTION_EMOJI,
      });
      await createReaction(mb.api, {
        comment_id: commentId,
        emoji: SECOND_REACTION_EMOJI,
      });

      await mb.signInAsNormalUser();
      await visitDocumentComment(page, documentId, PARAGRAPH_ID);

      await reactToComment(page, "Test 1", FIRST_REACTION_EMOJI);
      await reactToComment(page, "Test 1", SECOND_REACTION_EMOJI);

      const reactions = getSidebar(page).getByTestId("discussion-reactions");
      await expect(reactions).toContainText(
        new RegExp(`${FIRST_REACTION_EMOJI}\\s*2`),
      );
      await expect(reactions).toContainText(
        new RegExp(`${SECOND_REACTION_EMOJI}\\s*2`),
      );
      await reactions.getByText(FIRST_REACTION_EMOJI, { exact: true }).click();
      await expect(reactions).toContainText(
        new RegExp(`${FIRST_REACTION_EMOJI}\\s*1`),
      );
    });

    test("should allow to react on resolved comments", async ({ page, mb }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      const { id: commentId } = await createParagraphComment(
        mb.api,
        documentId,
        "Test 1",
      );
      await updateComment(mb.api, { id: commentId, is_resolved: true });

      await visitDocumentComment(page, documentId, PARAGRAPH_ID);

      await page.getByRole("tab", { name: "Resolved (1)", exact: true }).click();

      await reactToComment(page, "Test 1", FIRST_REACTION_EMOJI);
      await reactToComment(page, "Test 1", SECOND_REACTION_EMOJI);

      const reactions = getSidebar(page).getByTestId("discussion-reactions");
      await expect(reactions).toContainText(
        new RegExp(`${FIRST_REACTION_EMOJI}\\s*1`),
      );
      await expect(reactions).toContainText(
        new RegExp(`${SECOND_REACTION_EMOJI}\\s*1`),
      );
    });

    test("should not allow to react on deleted comments", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      const { id: commentId } = await createParagraphComment(
        mb.api,
        documentId,
        "Test 1",
      );
      await createParagraphComment(mb.api, documentId, "Test II", commentId);
      await deleteComment(mb.api, commentId);

      await visitDocumentComment(page, documentId, PARAGRAPH_ID);

      const deletedComment = getSidebar(page).getByTestId(
        "discussion-comment-deleted",
      );
      await deletedComment.hover();
      await expect(
        deletedComment.getByTestId("comment-action-panel"),
      ).toBeVisible();
      await expect(
        deletedComment.getByRole("button", {
          name: "Add reaction",
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });

  test.describe("top level blocks", () => {
    test.describe("with markdown", () => {
      test("should support blockquotes", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        // verify blockquote is rendered during typing
        await realType(page, "> blockquote");
        await expect(
          getBlockquote(getSidebar(page), "blockquote"),
        ).toBeVisible();

        // verify blockquote is rendered after submitting
        await page.keyboard.press(`${META}+Enter`);
        await expect(
          getBlockquote(getSidebar(page), "blockquote"),
        ).toBeVisible();
      });

      test("should support ordered lists", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "1. one");
        await page.keyboard.press("Enter");
        await realType(page, "two");
        // verify ordered list is rendered during typing
        await expect(getOrderedList(getSidebar(page), "one")).toBeVisible();
        await expect(getOrderedList(getSidebar(page), "two")).toBeVisible();

        // verify ordered list is rendered after submitting
        await page.keyboard.press(`${META}+Enter`);

        await expect(getOrderedList(getSidebar(page), "one")).toBeVisible();
        await expect(getOrderedList(getSidebar(page), "two")).toBeVisible();
      });

      test("should support unordered lists", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "- a");
        await page.keyboard.press("Enter");
        await realType(page, "b");
        // verify bullet list is rendered during typing
        await expect(getBulletList(getSidebar(page), "a")).toBeVisible();
        await expect(getBulletList(getSidebar(page), "b")).toBeVisible();

        // verify bullet list is rendered after submitting
        await page.keyboard.press(`${META}+Enter`);

        await expect(getBulletList(getSidebar(page), "a")).toBeVisible();
        await expect(getBulletList(getSidebar(page), "b")).toBeVisible();
      });

      test("should support code blocks", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "```");
        await page.keyboard.press("Enter");
        // verify code block is rendered during typing
        await realType(page, "code");
        await expect(getCodeBlock(getSidebar(page), "code")).toBeVisible();

        // verify code block is rendered after submitting
        await page.keyboard.press(`${META}+Enter`);

        await expect(getCodeBlock(getSidebar(page), "code")).toBeVisible();
      });
    });

    test.describe("with shortcuts", () => {
      test("should support ordered list", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "ol");
        await page.keyboard.press(`${META}+Shift+7`);

        await expect(getOrderedList(getSidebar(page), "ol")).toBeVisible();
      });

      test("should support bullet list", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "ul");
        await page.keyboard.press(`${META}+Shift+8`);

        await expect(getBulletList(getSidebar(page), "ul")).toBeVisible();
      });

      test("should support code block", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "code");
        await page.keyboard.press(`${META}+Alt+c`);

        await expect(getCodeBlock(getSidebar(page), "code")).toBeVisible();
      });

      // explicitly disabled in CustomStarterKit to keep default browser behavior
      test.skip("should support blockquote", async ({ page, mb }) => {
        await startNewCommentIn1ParagraphDocument(page, mb.api);

        await realType(page, "blockquote");
        await page.keyboard.press(`${META}+Shift+k`);

        await expect(
          getBlockquote(getSidebar(page), "blockquote"),
        ).toBeVisible();
      });
    });

    test("should render saved top level blocks", async ({ page, mb }) => {
      await startNewCommentIn1ParagraphDocument(page, mb.api);

      await realType(page, "> blockquote");
      await page.keyboard.press(`${META}+Enter`);

      await getNewThreadInput(getSidebar(page)).click();
      await realType(page, "1. ol");
      await page.keyboard.press("Enter");
      await realType(page, "two");
      await page.keyboard.press(`${META}+Enter`);

      await getNewThreadInput(getSidebar(page)).click();
      await realType(page, "- ul");
      await page.keyboard.press("Enter");
      await realType(page, "b");
      await page.keyboard.press(`${META}+Enter`);

      await getNewThreadInput(getSidebar(page)).click();
      await realType(page, "```");
      await page.keyboard.press("Enter");
      await realType(page, "code");
      await page.keyboard.press(`${META}+Enter`);

      await page.reload();

      await expect(getBlockquote(getSidebar(page), "blockquote")).toBeVisible();
      await expect(getOrderedList(getSidebar(page), "ol")).toBeVisible();
      await expect(getBulletList(getSidebar(page), "ul")).toBeVisible();
      await expect(getCodeBlock(getSidebar(page), "code")).toBeVisible();
    });
  });

  test("should remove ?new=true from the url after creating a comment", async ({
    page,
    mb,
  }) => {
    await startNewCommentIn1ParagraphDocument(page, mb.api);

    await expect.poll(() => page.url()).toContain("?new=true");

    await realType(page, "Test");
    await page.keyboard.press(`${META}+Enter`);

    await expect.poll(() => page.url()).not.toContain("?new=true");
  });

  test.describe("email notifications", () => {
    let maildevUp = false;
    let siteUrl = "";

    test.beforeAll(async () => {
      maildevUp = await isMaildevRunning();
    });

    test.beforeEach(async ({ mb }) => {
      test.skip(!maildevUp, "maildev is not reachable on http://localhost:1080");

      await setupSMTP(mb.api);

      // The Cypress spec hardcoded http://localhost:4000 — the links in the
      // emails come from the backend's site-url setting, which per-worker
      // backends restore from the snapshot regardless of their actual port.
      const properties = (await (
        await mb.api.get("/api/session/properties")
      ).json()) as Record<string, unknown>;
      siteUrl = String(properties["site-url"]);
    });

    type ExpectedEmail = {
      subject: string;
      address: string;
      heading: string;
      documentHref: string;
      documentTitle: string;
      commentHref: string;
    };

    /** Port of the spec's verifyEmail — the DOM queries run via DOMParser in
     * the browser page, same as Cypress ran them in its test window. */
    async function verifyEmail(
      page: Page,
      email: MaildevEmail,
      expected: ExpectedEmail,
    ) {
      expect(email.subject).toBe(expected.subject);
      const to = (email.to ?? []) as { address?: string }[];
      expect(to).toHaveLength(1);
      expect(to[0].address).toBe(expected.address);

      const parsed = await page.evaluate(
        ({ html, documentHref, commentHref, siteUrl }) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const all = [...doc.querySelectorAll("*")];
          return {
            heading: doc.querySelector("h1")?.textContent ?? "",
            documentLinkText:
              doc.querySelector(`a[href="${documentHref}"]`)?.textContent ?? "",
            commentLinkText:
              doc.querySelector(`a[href="${commentHref}"]`)?.textContent ?? "",
            instanceLinkText:
              doc.querySelector(`a[href="${siteUrl}"]`)?.textContent ?? "",
            websiteLinkText:
              doc.querySelector('a[href="https://www.metabase.com"]')
                ?.textContent ?? "",
            hasCompanyName: all.some(
              (element) => element.textContent?.trim() === "Metabase, Inc.",
            ),
            hasCompanyAddress: all.some(
              (element) =>
                element.textContent?.trim() ===
                "9740 Campo Rd., Suite 1029, Spring Valley, CA 91977",
            ),
          };
        },
        {
          html: email.html ?? "",
          documentHref: expected.documentHref,
          commentHref: expected.commentHref,
          siteUrl,
        },
      );

      expect(parsed.heading).toContain(expected.heading);
      expect(parsed.documentLinkText).toContain(expected.documentTitle);
      expect(parsed.commentLinkText).toContain("Open in Metabase");
      expect(parsed.instanceLinkText).toContain(siteUrl);
      expect(parsed.hasCompanyName).toBe(true);
      expect(parsed.hasCompanyAddress).toBe(true);
      expect(parsed.websiteLinkText).toContain("www.metabase.com");
    }

    test("a new thread group notifies the owner of the document", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);

      const normalApi = apiForCachedUser(mb.api.requestContext, "normal");
      const { id: commentId } = await createParagraphComment(
        normalApi,
        documentId,
        "Test 1",
      );

      const emails = await getInboxWithRetry();
      expect(emails).toHaveLength(1);

      await verifyEmail(page, emails[0], {
        address: "admin@metabase.test",
        subject: "Comment on Lorem ipsum",
        heading: "Robert Tableton left a comment on a document",
        documentTitle: "Lorem ipsum",
        documentHref: `${siteUrl}/document/${documentId}`,
        commentHref: `${siteUrl}/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${commentId}`,
      });
    });

    test("a new reply in a thread notifies anyone in the thread", async ({
      page,
      mb,
    }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);
      const root = await createParagraphComment(mb.api, documentId, "Test 1");

      const normalApi = apiForCachedUser(mb.api.requestContext, "normal");
      const { id: reply2Id } = await createParagraphComment(
        normalApi,
        documentId,
        "Test 2",
        root.id,
      );

      // you should not get notified about your own comments
      const firstBatch = await getInboxWithRetry(1);
      expect(firstBatch).toHaveLength(1);
      await verifyEmail(page, firstBatch[0], {
        address: "admin@metabase.test",
        subject: "Comment on Lorem ipsum",
        heading: "Robert Tableton replied to a thread",
        documentTitle: "Lorem ipsum",
        documentHref: `${siteUrl}/document/${documentId}`,
        commentHref: `${siteUrl}/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${reply2Id}`,
      });

      await clearInbox();

      const impersonatedApi = apiForCachedUser(
        mb.api.requestContext,
        "impersonated",
      );
      const { id: reply3Id } = await createParagraphComment(
        impersonatedApi,
        documentId,
        "Test 3",
        root.id,
      );

      const secondBatch = await getInboxWithRetry(2);
      expect(secondBatch).toHaveLength(2);

      const emailToAdmin = secondBatch.find(
        (email) =>
          (email.to?.[0] as { address?: string })?.address ===
          "admin@metabase.test",
      );
      const emailToNormalUser = secondBatch.find(
        (email) =>
          (email.to?.[0] as { address?: string })?.address ===
          "normal@metabase.test",
      );
      expect(emailToAdmin).toBeTruthy();
      expect(emailToNormalUser).toBeTruthy();

      await verifyEmail(page, emailToAdmin as MaildevEmail, {
        address: "admin@metabase.test",
        subject: "Comment on Lorem ipsum",
        heading: "User Impersonated replied to a thread",
        documentTitle: "Lorem ipsum",
        documentHref: `${siteUrl}/document/${documentId}`,
        commentHref: `${siteUrl}/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${reply3Id}`,
      });

      await verifyEmail(page, emailToNormalUser as MaildevEmail, {
        address: "normal@metabase.test",
        subject: "Comment on Lorem ipsum",
        heading: "User Impersonated replied to a thread",
        documentTitle: "Lorem ipsum",
        documentHref: `${siteUrl}/document/${documentId}`,
        commentHref: `${siteUrl}/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${reply3Id}`,
      });
    });

    test("an explicit @mention notifies that person", async ({ page, mb }) => {
      const { id: documentId } = await create1ParagraphDocument(mb.api);

      const { id: commentId } = await createComment(mb.api, {
        target_type: "document",
        target_id: documentId,
        child_target_id: PARAGRAPH_ID,
        parent_comment_id: null,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { _id: PARAGRAPH_ID },
              content: [
                {
                  type: "smartLink",
                  attrs: {
                    entityId: NORMAL_USER_ID,
                    model: "user",
                    label: "Robert Tableton",
                  },
                },
              ],
            },
          ],
        },
      });

      const emails = await getInboxWithRetry();
      expect(emails).toHaveLength(1);

      await verifyEmail(page, emails[0], {
        address: "normal@metabase.test",
        subject: "Comment on Lorem ipsum",
        heading: "Bobby Tables left a comment on a document",
        documentTitle: "Lorem ipsum",
        documentHref: `${siteUrl}/document/${documentId}`,
        commentHref: `${siteUrl}/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${commentId}`,
      });
    });
  });

  test("handles commenting with users without first and last names", async ({
    page,
    mb,
  }) => {
    await mb.api.post("/api/user", { email: "no-name@metabase.test" });
    await startNewCommentIn1ParagraphDocument(page, mb.api);

    await realType(page, "@No");
    await getMentionDialog(page)
      .getByText("no-name@metabase.test", { exact: true })
      .click();
    await realType(page, "needs to see this");
    await page.keyboard.press(`${META}+Enter`);

    const sidebar = getSidebar(page);
    // assert that the comment was created
    await expect(getAllComments(sidebar)).toHaveCount(1);
    // mention is its own span, so we need to search for the pieces individually
    await expect(
      getCommentByText(sidebar, "@no-name@metabase.test"),
    ).toHaveCount(1);
    await expect(getCommentByText(sidebar, "needs to see this")).toHaveCount(1);
  });
});
