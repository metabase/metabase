/**
 * Helpers for the documents-comments port (new module per porting rule 9).
 *
 * Ports of:
 * - e2e/support/helpers/e2e-comment-helpers.ts (Comments.*)
 * - e2e/support/helpers/e2e-document-helpers.ts (node getters, visitDocument,
 *   visitDocumentComment, documentContent, documentFormattingMenu, ...)
 * - api helpers: createDocument, createComment, updateComment, deleteComment,
 *   createReaction (e2e/support/helpers/api/*)
 *
 * Visibility note: the per-node "Comments" buttons live in portals
 * ([data-testid="comments-menu"]) that are hidden with `opacity: 0`
 * (CommentsMenu.module.css). Cypress's visibility algorithm treats
 * opacity: 0 as hidden; Playwright's toBeVisible/toBeHidden does NOT.
 * All node-button visibility checks therefore go through computed-opacity
 * helpers (expectNodeButtonVisibility / expectVisibleNodeButtonCount).
 */
import { expect } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { MetabaseApi } from "./api";
import { getInbox, type MaildevEmail } from "./onboarding-extras";
import { LOGIN_CACHE } from "./sample-data";

type Scope = Page | Locator;

/** users are keyed by email in cypress_sample_instance_data.json. */
const userIdByEmail = (email: string): number => {
  const user = SAMPLE_INSTANCE_DATA.users.find((user) => user.email === email);
  if (!user) {
    throw new Error(`User "${email}" not found in cypress_sample_instance_data`);
  }
  return user.id;
};

/** Port of NORMAL_USER_ID (e2e/support/cypress_sample_instance_data). */
export const NORMAL_USER_ID = userIdByEmail("normal@metabase.test");

/**
 * An API client running as a snapshot user with a cached session (the users
 * outside the harness USERS map, e.g. "impersonated"). Mirrors what
 * cy.signInAsImpersonatedUser + cy.request achieve without touching the
 * browser session.
 */
export function apiForCachedUser(
  request: APIRequestContext,
  user: string,
): MetabaseApi {
  const cached = LOGIN_CACHE[user];
  if (!cached) {
    throw new Error(`No cached session for user "${user}" in the login cache`);
  }
  return new MetabaseApi(request, () => cached.sessionId);
}

// === document/comment content types (local stand-ins for metabase-types) ===

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
};

export type CommentResponse = { id: number };

// === ports of e2e/support/helpers/api/* ===

/** Port of H.createDocument (api/createDocument.ts). */
export async function createDocument(
  api: MetabaseApi,
  {
    name,
    document,
    collection_id = null,
  }: { name: string; document: DocNode; collection_id?: number | null },
): Promise<{ id: number }> {
  const response = await api.post("/api/document", {
    name,
    collection_id,
    document,
  });
  return (await response.json()) as { id: number };
}

/**
 * Port of H.createComment (api/createComment.ts). Note: like the Cypress
 * helper, only content is sent — the `html` field some spec call sites
 * passed was silently dropped by the Cypress helper too.
 */
export async function createComment(
  api: MetabaseApi,
  {
    target_id,
    target_type,
    child_target_id,
    parent_comment_id = null,
    content,
  }: {
    target_id: number;
    target_type: string;
    child_target_id: string;
    parent_comment_id?: number | null;
    content: DocNode;
  },
): Promise<CommentResponse> {
  const response = await api.post("/api/comment", {
    target_id,
    target_type,
    child_target_id,
    parent_comment_id,
    content,
  });
  return (await response.json()) as CommentResponse;
}

/** Convenience shared by the spec: a one-paragraph text comment on a node. */
export function createNodeComment(
  api: MetabaseApi,
  documentId: number,
  nodeId: string,
  text: string,
  parent_comment_id: number | null = null,
): Promise<CommentResponse> {
  return createComment(api, {
    target_type: "document",
    target_id: documentId,
    child_target_id: nodeId,
    parent_comment_id,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { _id: crypto.randomUUID() },
          content: [{ type: "text", text }],
        },
      ],
    },
  });
}

/** Port of H.updateComment (api/updateComment.ts). */
export async function updateComment(
  api: MetabaseApi,
  {
    id,
    content,
    is_resolved,
  }: { id: number; content?: DocNode; is_resolved?: boolean },
): Promise<void> {
  await api.put(`/api/comment/${id}`, { content, is_resolved });
}

/** Port of H.deleteComment (api/deleteComment.ts). */
export async function deleteComment(
  api: MetabaseApi,
  commentId: number,
): Promise<void> {
  await api.fetch("DELETE", `/api/comment/${commentId}`);
}

/** Port of H.createReaction (api/createReaction.ts). */
export async function createReaction(
  api: MetabaseApi,
  { comment_id, emoji }: { comment_id: number; emoji: string },
): Promise<void> {
  await api.post(`/api/comment/${comment_id}/reaction`, { emoji });
}

// === ports of e2e-document-helpers.ts ===

/** Port of H.visitDocument: navigate and wait for the document fetch. */
export async function visitDocument(page: Page, documentId: number) {
  const documentLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/document/${documentId}`,
  );
  await page.goto(`/document/${documentId}`);
  await documentLoaded;
}

/** Port of H.visitDocumentComment. */
export async function visitDocumentComment(
  page: Page,
  documentId: number,
  nodeId: string,
  commentId?: number,
) {
  const documentLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/document/${documentId}`,
  );
  const hash = commentId == null ? "" : `#comment-${commentId}`;
  await page.goto(`/document/${documentId}/comments/${nodeId}${hash}`);
  await documentLoaded;
}

export function documentContent(page: Page): Locator {
  return page.getByTestId("document-content");
}

export function documentFormattingMenu(page: Page): Locator {
  return page.getByTestId("document-formatting-menu");
}

export function documentMentionDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Mention Dialog", exact: true });
}

// Document node getters. testing-library findByText with a string is an
// exact match; ancestor::x[1] is the Playwright spelling of closest(x).

export function getHeading1(page: Page, name = "Heading 1"): Locator {
  return documentContent(page).getByRole("heading", {
    name,
    level: 1,
    exact: true,
  });
}

export function getHeading2(page: Page, name = "Heading 2"): Locator {
  return documentContent(page).getByRole("heading", {
    name,
    level: 2,
    exact: true,
  });
}

export function getHeading3(page: Page, name = "Heading 3"): Locator {
  return documentContent(page).getByRole("heading", {
    name,
    level: 3,
    exact: true,
  });
}

export function getParagraph(
  page: Page,
  text = "Lorem ipsum dolor sit amet.",
): Locator {
  return documentContent(page)
    .getByText(text, { exact: true })
    .locator("xpath=..");
}

export function getBulletList(container: Scope, text = "Bullet A"): Locator {
  return container
    .getByText(text, { exact: true })
    .locator("xpath=ancestor::ul[1]");
}

export function getBlockquote(
  container: Scope,
  text = "A famous quote",
): Locator {
  return container
    .getByText(text, { exact: true })
    .locator("xpath=ancestor::blockquote[1]");
}

export function getOrderedList(container: Scope, text = "Item 1"): Locator {
  return container
    .getByText(text, { exact: true })
    .locator("xpath=ancestor::ol[1]");
}

export function getCodeBlock(
  container: Scope,
  text = "while (true) {}",
): Locator {
  return container
    .getByText(text, { exact: true })
    .locator("xpath=ancestor::pre[1]");
}

export function getEmbed(page: Page): Locator {
  return documentContent(page).getByTestId("document-card-embed");
}

// === ports of e2e-comment-helpers.ts (Comments.*) ===

export function getSidebar(page: Page): Locator {
  return page.getByTestId("comments-sidebar");
}

/** Port of Comments.closeSidebar (cy.icon("close").click()) — the only close
 * icon at that point is the sidebar header's. */
export async function closeSidebar(page: Page) {
  await getSidebar(page).locator(".Icon-close").first().click();
}

export function getNewThreadInput(scope: Scope): Locator {
  return scope.getByTestId("new-thread-editor");
}

export function getCommentInputs(scope: Scope): Locator {
  return scope.getByTestId("comment-editor");
}

export function getPlaceholder(scope: Scope): Locator {
  return scope.locator("[data-placeholder]");
}

const pageOf = (scope: Scope): Page =>
  "page" in scope && typeof scope.page === "function"
    ? scope.page()
    : (scope as Page);

/**
 * Port of Comments.getCommentByText: findByText(text).closest(discussion
 * comment). Exact inner-text match (findByText semantics), expressed as a
 * filter so the locator resolves to the comment element itself.
 */
export function getCommentByText(scope: Scope, text: string | RegExp): Locator {
  return scope.getByTestId("discussion-comment").filter({
    has:
      typeof text === "string"
        ? pageOf(scope).getByText(text, { exact: true })
        : pageOf(scope).getByText(text),
  });
}

/**
 * Case-sensitive substring matcher for comment text that shares an element
 * with inline siblings (PORTING.md's mixed-content gotcha): a mention
 * renders as its own span, so the paragraph's full text is
 * "@someone needs to see this" and Playwright's exact getByText — which
 * compares an element's *whole* text — never matches "needs to see this".
 * testing-library's findByText matched the direct text node, so the
 * original's exact string was fine.
 */
export const commentTextContaining = (text: string): RegExp =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

export function getAllComments(scope: Scope): Locator {
  return scope.getByTestId("discussion-comment");
}

export function getMentionDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Mention Dialog", exact: true });
}

export function getEmojiPicker(page: Page): Locator {
  return page.getByTestId("emoji-picker");
}

/**
 * Gate before pressing Enter to accept the emoji picker's first suggestion.
 *
 * EmojiSuggestionExtension's Enter handler reads the live DOM —
 * `popup.querySelector("[data-active]") ||
 *  popup.querySelector('[frimousse-row][aria-rowindex="0"] [data-emoji]')` —
 * and frimousse filters asynchronously, so row 0 lags the typed query.
 * Asserting the emoji is merely *somewhere* in the picker is not enough: it
 * can be present while row 0 is still a match for an earlier prefix (typing
 * ":eggplant" + Enter selected 🥺). Gate on the exact element the handler
 * reads. The Cypress original's per-key latency let the filter settle.
 */
export async function expectFirstEmojiSuggestion(page: Page, emoji: string) {
  await expect
    .poll(() =>
      getEmojiPicker(page)
        .locator('[frimousse-row][aria-rowindex="0"] [data-emoji]')
        .first()
        .getAttribute("data-emoji"),
    )
    .toBe(emoji);
}

/**
 * Gate after typing an emoji query, before arrow-key navigation.
 *
 * frimousse filters and renders asynchronously, and resets the active cell
 * to the first result once it settles. Arrowing into a still-filling grid
 * navigates from the wrong origin and lands on the wrong emoji (":smile"
 * + ArrowDown + ArrowRight gave 🥲 instead of 😊). Asserting the query's
 * matches are present/absent is not enough — that holds before the active
 * cell resets.
 *
 * Deliberately dataset-independent: "active cell == first result" rather
 * than hard-coding which emoji that is.
 */
export async function expectEmojiPickerSettled(page: Page) {
  const attr = (locator: Locator) =>
    locator
      .first()
      .getAttribute("data-emoji")
      .catch(() => null);

  await expect
    .poll(async () => {
      const picker = getEmojiPicker(page);
      const active = await attr(picker.locator("[data-active][data-emoji]"));
      const firstCell = await attr(
        picker.locator('[frimousse-row][aria-rowindex="0"] [data-emoji]'),
      );
      return active != null && active === firstCell;
    })
    .toBe(true);
}

/** The emoji the picker currently has navigated to, if any. */
function activeEmoji(page: Page): Promise<string | null> {
  return getEmojiPicker(page)
    .locator("[data-active][data-emoji]")
    .first()
    .getAttribute("data-emoji")
    .catch(() => null);
}

/**
 * Press an arrow key in the emoji picker until the active cell reaches
 * `emoji`, then stop.
 *
 * EmojiSuggestionExtension documents that the first arrow press can be spent
 * initialising navigation rather than moving ("the first one only focuses
 * first available emoji … initiating navigation is restricted by frimousse's
 * internal logic, depending on 'interaction' type"). Whether that happens is
 * internal state with no DOM signal, and it is racy under Playwright's
 * timing — Cypress's per-command latency always landed on the far side of
 * it. So re-nudge rather than assume, the same pattern PORTING.md prescribes
 * for editor autocomplete.
 *
 * Safe to repeat: each press moves at most one cell, and we stop as soon as
 * the target is active, so a press that *did* move cannot overshoot.
 */
export async function pressArrowUntilActive(
  page: Page,
  key: "ArrowDown" | "ArrowRight" | "ArrowLeft" | "ArrowUp",
  emoji: string,
) {
  await expect(async () => {
    if ((await activeEmoji(page)) === emoji) {
      return;
    }
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    expect(await activeEmoji(page)).toBe(emoji);
  }).toPass({ timeout: 15_000 });
}

/** Port of Comments.openAllComments. */
export async function openAllComments(page: Page) {
  await page.getByRole("link", { name: "Show all comments", exact: true }).click();
  await expect(getSidebar(page)).toContainText("All comments");
}

/** Port of Comments.resolveCommentByText. */
export async function resolveCommentByText(page: Page, text: string) {
  const comment = getCommentByText(page, text);
  await comment.hover();
  await expect(comment.getByTestId("comment-action-panel")).toBeVisible();
  const resolve = comment.getByTestId("comment-action-panel-resolve");
  await expect(resolve).toBeVisible();
  await resolve.click();
}

/** Port of Comments.reopenCommentByText. */
export async function reopenCommentByText(page: Page, text: string) {
  const comment = getCommentByText(page, text);
  await comment.hover();
  await expect(comment.getByTestId("comment-action-panel")).toBeVisible();
  const reopen = comment.getByTestId("comment-action-panel-reopen");
  await expect(reopen).toBeVisible();
  await reopen.click();
}

/** Port of Comments.reactToComment. */
export async function reactToComment(page: Page, text: string, emoji: string) {
  const comment = getCommentByText(getSidebar(page), text);
  await comment.hover();
  await expect(comment.getByTestId("comment-action-panel")).toBeVisible();
  await comment.getByRole("button", { name: "Add reaction", exact: true }).click();
  await getEmojiPicker(page).getByText(emoji, { exact: true }).click();
}

/**
 * Gate after submitting the first comment of a `?new=true` thread, before
 * doing anything that leaves the comments route (Escape, the sidebar's X,
 * a document edit).
 *
 * CommentsSidesheet.handleSubmit strips `?new=true` only once the create
 * mutation resolves, and strips it with `replace({ pathname:
 * location.pathname })` captured at submit time — so leaving the route
 * inside that window gets undone by the late replace (findings-inbox entry
 * 1). The Cypress original never waited: its command-queue latency always
 * covered the mutation. Waiting on the POST response is not enough — the
 * dispatch happens a tick later — so gate on the URL, which is the state
 * the race actually corrupts.
 *
 * Self-disarming: with no `new` param the helper returns immediately, and
 * deleteNewParamFromURLIfNeeded early-returns too, so there is no race.
 */
export async function expectNewThreadParamCleared(page: Page) {
  await expect.poll(() => page.url()).not.toContain("new=true");
}

/**
 * Park the real mouse away from the UI and wait for hover tooltips to go,
 * before a keyboard Escape that has to reach the app's window listener.
 *
 * Cypress's `.click()`/`.type()` are synthetic: the OS cursor stays wherever
 * the last `realHover()` put it (here, the document node — never the
 * sidebar). Playwright's `.click()` moves the real cursor and leaves it
 * parked, so freshly-rendered content under it (e.g. a new comment's
 * "a few seconds ago" timestamp) opens its Mantine tooltip.
 *
 * That matters because floating-ui's useDismiss calls `stopPropagation()` on
 * Escape while a floating element is open (escapeKeyBubbles defaults false),
 * so the Escape dismisses the tooltip and never reaches
 * CommentsSidesheet's `useWindowEvent("keydown")` — the sidebar silently
 * stays open and the next Escape is the one that closes it.
 */
export async function parkMouseAwayFromTooltips(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
}

// === document node comment buttons ===

/** Port of Comments.getDocumentNodeButtons. */
export function getDocumentNodeButtons(page: Page): Locator {
  return page.getByRole("link", { name: "Comments", exact: true });
}

/** Port of Comments.getDocumentNodeButton. */
export function getDocumentNodeButton(
  page: Page,
  {
    targetId,
    childTargetId,
    hasComments = false,
    isCardEmbedNode = false,
  }: {
    targetId: number;
    childTargetId: string;
    hasComments?: boolean;
    isCardEmbedNode?: boolean;
  },
): Locator {
  if (isCardEmbedNode) {
    return page.getByRole("button", { name: "Comments", exact: true });
  }
  const threadUrl = `/document/${targetId}/comments/${childTargetId}${
    hasComments ? "" : "?new=true"
  }`;
  return getDocumentNodeButtons(page).and(page.locator(`[href="${threadUrl}"]`));
}

/** The opacity-carrying portal wrapper of a node comment button. */
function commentsMenuOf(button: Locator): Locator {
  return button.locator("xpath=ancestor::*[@data-testid='comments-menu'][1]");
}

/**
 * Cypress-visibility check for a node comment button: the button is always
 * in the DOM; its menu wrapper toggles opacity 0/1 (see module header).
 */
export async function expectNodeButtonVisibility(
  button: Locator,
  visible: boolean,
) {
  await expect
    .poll(() =>
      commentsMenuOf(button).evaluate(
        (element) => getComputedStyle(element).opacity,
      ),
    )
    .toBe(visible ? "1" : "0");
}

/** Port of getDocumentNodeButtons().filter(":visible").should("have.length", n). */
export async function expectVisibleNodeButtonCount(page: Page, count: number) {
  await expect
    .poll(() =>
      page
        .locator("[data-testid='comments-menu']")
        .evaluateAll(
          (elements) =>
            elements.filter(
              (element) => getComputedStyle(element).opacity === "1",
            ).length,
        ),
    )
    .toBe(count);
}

/**
 * The href of the LAST visible node button in DOM order — the Playwright
 * spelling of `.filter(":visible").last()` (needed because the split
 * paragraph's node id, and therefore its href, is generated client-side).
 */
export async function lastVisibleNodeButtonHref(
  page: Page,
): Promise<string | null> {
  return page
    .locator("[data-testid='comments-menu']")
    .evaluateAll(
      (elements) =>
        elements
          .filter((element) => getComputedStyle(element).opacity === "1")
          .at(-1)
          ?.querySelector("a")
          ?.getAttribute("href") ?? null,
    );
}

// === inbox count polling (port of getInboxWithRetry(emailsCount)) ===

/**
 * Port of H.getInbox(emailsCount): polls until the inbox holds exactly
 * `expectedCount` emails (or is simply non-empty when omitted). The comment
 * notification emails are sent on background threads, so they land a beat
 * after the API response.
 */
export async function getInboxWithRetry(
  expectedCount?: number,
  timeoutMs = 15_000,
): Promise<MaildevEmail[]> {
  const deadline = Date.now() + timeoutMs;
  let inbox: MaildevEmail[] = [];
  for (;;) {
    inbox = await getInbox();
    if (
      inbox.length > 0 &&
      (expectedCount == null || inbox.length === expectedCount)
    ) {
      return inbox;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Inbox retry timeout (wanted ${expectedCount ?? "some"} emails, ` +
          `have ${inbox.length}: [${inbox.map((email) => email.subject).join(", ")}])`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
