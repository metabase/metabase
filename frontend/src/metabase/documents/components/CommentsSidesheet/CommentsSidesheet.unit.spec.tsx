import userEvent from "@testing-library/user-event";
import type { Emoji } from "frimousse";

import {
  setupCommentEndpoints,
  setupStatefulCommentEndpoints,
  setupUpdateCommentEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { initialState as documentsInitialState } from "metabase/documents/documents.slice";
import { Route, useParams } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type { Comment, User } from "metabase-types/api";
import {
  createMockDocument,
  createMockDocumentContent,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";

import { CommentsSidesheet } from "./CommentsSidesheet";

const FIRST_EMOJI = "😀";
const SECOND_EMOJI = "😃";

// The real picker renders a virtualized list that jsdom cannot lay out.
jest.mock("metabase/common/components/EmojiPicker", () => ({
  EmojiPicker: ({
    onEmojiSelect,
  }: {
    onEmojiSelect?: (emoji: Pick<Emoji, "emoji" | "label">) => void;
  }) => (
    <div>
      {[FIRST_EMOJI, SECOND_EMOJI].map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onEmojiSelect?.({ emoji, label: emoji })}
        >
          {emoji}
        </button>
      ))}
    </div>
  ),
}));

const DOCUMENT_ID = 1;
const HEADING_ID = "heading-block-1";
const PARAGRAPH_ID = "paragraph-block-1";
const COMMENTS_PATH = `/document/${DOCUMENT_ID}/comments/${HEADING_ID}`;

const ADMIN = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
});
const NORMAL_USER = createMockUser({
  id: 2,
  first_name: "Robert",
  last_name: "Tableton",
});

function commentWithText(text: string, comment?: Partial<Comment>): Comment {
  return createMockComment({
    target_type: "document",
    target_id: DOCUMENT_ID,
    child_target_id: PARAGRAPH_ID,
    creator: ADMIN,
    content: createMockDocumentContent({
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }),
    ...comment,
  });
}

interface SetupOpts {
  comments?: Comment[];
  childTargetId?: string;
  currentUser?: User;
}

function setup({
  comments = [],
  childTargetId = PARAGRAPH_ID,
  currentUser = ADMIN,
}: SetupOpts = {}) {
  setupStatefulCommentEndpoints({ comments, currentUser });
  const onClose = jest.fn();

  renderWithProviders(
    <Route
      path="*"
      element={
        <CommentsSidesheet params={{ childTargetId }} onClose={onClose} />
      }
    />,
    {
      withRouter: true,
      initialRoute: `/document/${DOCUMENT_ID}/comments/${childTargetId}`,
      storeInitialState: createMockState({
        currentUser,
        documents: {
          ...documentsInitialState,
          currentDocument: createMockDocument({ id: DOCUMENT_ID }),
        },
      }),
    },
  );

  return { onClose };
}

function getComment(text: string) {
  const comment = screen
    .getAllByTestId("discussion-comment")
    .find((comment) => within(comment).queryByText(text));
  if (!comment) {
    throw new Error(`Comment "${text}" not found`);
  }
  return comment;
}

function getTextbox(editor: HTMLElement) {
  return within(editor).getByRole("textbox");
}

async function findNewThreadTextbox() {
  return getTextbox(await screen.findByTestId("new-thread-editor"));
}

// Reply editors are the editable ones among the thread editors, in thread order.
function getReplyTextbox(threadIndex: number) {
  const textboxes = screen
    .getAllByTestId("comment-editor")
    .map(getTextbox)
    .filter((textbox) => textbox.getAttribute("contenteditable") === "true");
  return textboxes[threadIndex];
}

// Only editable editors have a send button: one per open thread, in thread
// order, followed by the new thread editor's.
function getSendButton(index: number | "new-thread") {
  const buttons = screen.getAllByRole("button", { name: "Send" });
  return index === "new-thread" ? buttons[buttons.length - 1] : buttons[index];
}

async function typeComment(textbox: HTMLElement, text: string) {
  await userEvent.click(textbox);
  await userEvent.type(textbox, text);
}

async function submitWithShortcut(textbox: HTMLElement, text: string) {
  await typeComment(textbox, text);
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
}

async function openMoreActions(text: string) {
  await userEvent.click(
    within(getComment(text)).getByRole("button", { name: "More actions" }),
  );
}

async function reactToComment(text: string, emoji: string) {
  await userEvent.click(
    within(getComment(text)).getByRole("button", { name: "Add reaction" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: emoji }));
}

function getOpenPanel() {
  // the panel has no accessible name while the tabs are hidden
  const panel = screen
    .getAllByRole("tabpanel", { hidden: true })
    .find((panel) => panel.getAttribute("id")?.endsWith("-panel-open"));
  if (!panel) {
    throw new Error("Open tab panel not found");
  }
  return panel;
}

describe("CommentsSidesheet", () => {
  describe("creating, editing and deleting comments", () => {
    it("does not send empty comments", async () => {
      setup();

      const textbox = await findNewThreadTextbox();
      await userEvent.click(textbox);
      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      expect(
        screen.queryByTestId("discussion-comment"),
      ).not.toBeInTheDocument();
    });

    it("starts threads and adds replies with the keyboard shortcut and the send button", async () => {
      setup();

      await submitWithShortcut(await findNewThreadTextbox(), "1st thread");
      expect(await screen.findByText("1st thread")).toBeInTheDocument();
      expect(screen.getByText("a few seconds ago")).toBeInTheDocument();

      await typeComment(await findNewThreadTextbox(), "2nd thread");
      await userEvent.click(getSendButton("new-thread"));
      expect(await screen.findByText("2nd thread")).toBeInTheDocument();
      expect(screen.getAllByText("a few seconds ago")).toHaveLength(2);

      await submitWithShortcut(getReplyTextbox(0), "Reply 1");
      expect(await screen.findByText("Reply 1")).toBeInTheDocument();

      await typeComment(getReplyTextbox(1), "Reply A");
      await userEvent.click(getSendButton(1));
      expect(await screen.findByText("Reply A")).toBeInTheDocument();

      await submitWithShortcut(getReplyTextbox(0), "Reply 2");
      expect(await screen.findByText("Reply 2")).toBeInTheDocument();

      await typeComment(getReplyTextbox(1), "Reply B");
      await userEvent.click(getSendButton(1));
      expect(await screen.findByText("Reply B")).toBeInTheDocument();

      // replies are listed under their thread, not in the order of creation
      expect(
        screen
          .getAllByTestId("discussion-comment")
          .map((comment) => getTextbox(comment).textContent),
      ).toEqual([
        "1st thread",
        "Reply 1",
        "Reply 2",
        "2nd thread",
        "Reply A",
        "Reply B",
      ]);
      // 6 comments, 2 reply editors and the new thread editor
      expect(screen.getAllByRole("textbox")).toHaveLength(9);
    });

    it("deletes replies without a trace and leaves a placeholder for a deleted first comment", async () => {
      setup({
        comments: [
          commentWithText("1st thread", { id: 1 }),
          commentWithText("Reply 1", { id: 2, parent_comment_id: 1 }),
          commentWithText("Reply 2", { id: 3, parent_comment_id: 1 }),
          commentWithText("2nd thread", { id: 4 }),
          commentWithText("Reply A", { id: 5, parent_comment_id: 4 }),
        ],
      });

      await screen.findByText("Reply A");
      await openMoreActions("Reply A");
      await userEvent.click(await screen.findByText("Delete"));

      await waitFor(() => {
        expect(screen.queryByText("Reply A")).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText("This comment was deleted."),
      ).not.toBeInTheDocument();

      await openMoreActions("1st thread");
      await userEvent.click(await screen.findByText("Delete"));

      expect(
        await screen.findByText("This comment was deleted."),
      ).toBeInTheDocument();
      expect(screen.queryByText("1st thread")).not.toBeInTheDocument();
      expect(screen.getByText("Reply 1")).toBeInTheDocument();
      expect(screen.getByText("Reply 2")).toBeInTheDocument();
    });

    it("edits a comment in an autofocused editor and cancels editing with Escape before closing the sidebar", async () => {
      const { onClose } = setup({
        comments: [
          commentWithText("Reply 1", { id: 1 }),
          commentWithText("Reply 2", { id: 2, parent_comment_id: 1 }),
        ],
      });

      await screen.findByText("Reply 1");
      await openMoreActions("Reply 1");
      await userEvent.click(await screen.findByText("Edit"));

      const textbox = getTextbox(getComment("Reply 1"));
      expect(textbox).toHaveAttribute("contenteditable", "true");
      await waitFor(() => expect(textbox).toHaveFocus());

      await userEvent.keyboard("My ");
      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      expect(await screen.findByText("My Reply 1")).toBeInTheDocument();
      expect(getTextbox(getComment("My Reply 1"))).toHaveAttribute(
        "contenteditable",
        "false",
      );

      await openMoreActions("Reply 2");
      await userEvent.click(await screen.findByText("Edit"));
      const secondTextbox = getTextbox(getComment("Reply 2"));
      expect(secondTextbox).toHaveAttribute("contenteditable", "true");
      await waitFor(() => expect(secondTextbox).toHaveFocus());

      await userEvent.keyboard("{Escape}");
      expect(getTextbox(getComment("Reply 2"))).toHaveAttribute(
        "contenteditable",
        "false",
      );
      expect(onClose).not.toHaveBeenCalled();

      await userEvent.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("threads", () => {
    it("shows only unresolved threads with undeleted comments, and the rest under the resolved tab", async () => {
      setup({
        comments: [
          // thread with the 1st comment deleted
          commentWithText("Test 1", { id: 1, deleted_at: "2024-01-02" }),
          commentWithText("Test 2", { id: 2, parent_comment_id: 1 }),
          commentWithText("Test 3", { id: 3, parent_comment_id: 1 }),
          // thread with the 2nd comment deleted
          commentWithText("Test A", { id: 4 }),
          commentWithText("Test B", {
            id: 5,
            parent_comment_id: 4,
            deleted_at: "2024-01-02",
          }),
          commentWithText("Test C", { id: 6, parent_comment_id: 4 }),
          // resolved thread with the 1st comment deleted
          commentWithText("Test I", {
            id: 7,
            deleted_at: "2024-01-02",
            is_resolved: true,
          }),
          commentWithText("Test II", { id: 8, parent_comment_id: 7 }),
          commentWithText("Test III", { id: 9, parent_comment_id: 7 }),
          // thread with all comments deleted
          commentWithText("Test X", { id: 10, deleted_at: "2024-01-02" }),
          commentWithText("Test Y", {
            id: 11,
            parent_comment_id: 10,
            deleted_at: "2024-01-02",
          }),
          // resolved thread with all comments deleted
          commentWithText("Test D", {
            id: 12,
            deleted_at: "2024-01-02",
            is_resolved: true,
          }),
          commentWithText("Test E", {
            id: 13,
            parent_comment_id: 12,
            deleted_at: "2024-01-02",
          }),
        ],
      });

      expect(
        await screen.findByRole("heading", { name: "Comments about this" }),
      ).toBeInTheDocument();
      await screen.findByText("Test 2");

      const openPanel = getOpenPanel();
      ["Test 2", "Test 3", "Test A", "Test C"].forEach((text) =>
        expect(within(openPanel).getByText(text)).toBeInTheDocument(),
      );
      [
        "Test 1",
        "Test B",
        "Test I",
        "Test II",
        "Test III",
        "Test X",
        "Test Y",
        "Test D",
        "Test E",
      ].forEach((text) =>
        expect(within(openPanel).queryByText(text)).not.toBeInTheDocument(),
      );
      // the "Test 1" thread leaves a placeholder, the fully deleted "Test X" thread does not
      expect(
        within(openPanel).getAllByTestId("discussion-comment-deleted"),
      ).toHaveLength(1);

      await userEvent.click(screen.getByRole("tab", { name: "Resolved (2)" }));

      const resolvedPanel = screen.getByRole("tabpanel", {
        name: "Resolved (2)",
      });
      ["Test II", "Test III"].forEach((text) =>
        expect(within(resolvedPanel).getByText(text)).toBeInTheDocument(),
      );
      ["Test 2", "Test A", "Test C", "Test I", "Test X", "Test D"].forEach(
        (text) =>
          expect(
            within(resolvedPanel).queryByText(text),
          ).not.toBeInTheDocument(),
      );
      // the "Test I" thread leaves a placeholder, the fully deleted "Test D" thread does not
      expect(
        within(resolvedPanel).getAllByTestId("discussion-comment-deleted"),
      ).toHaveLength(1);
    });

    it("shows comments of other users, but does not let edit or delete them", async () => {
      setup({
        comments: [
          commentWithText("Test 1", { id: 1 }),
          commentWithText("Test A", {
            id: 2,
            parent_comment_id: 1,
            creator: NORMAL_USER,
          }),
          commentWithText("Test 2", { id: 3, parent_comment_id: 1 }),
          commentWithText("Test B", {
            id: 4,
            parent_comment_id: 1,
            creator: NORMAL_USER,
          }),
        ],
        currentUser: NORMAL_USER,
      });

      await screen.findByText("Test 1");
      ["Test 1", "Test 2"].forEach((text) => {
        expect(getComment(text)).toHaveTextContent("Bobby Tables");
        expect(getComment(text)).toHaveTextContent("BT");
      });
      ["Test A", "Test B"].forEach((text) => {
        expect(getComment(text)).toHaveTextContent("Robert Tableton");
        expect(getComment(text)).toHaveTextContent("RT");
      });

      await openMoreActions("Test 1");
      expect(await screen.findByText("Copy link")).toBeInTheDocument();
      expect(screen.queryByText(/edit/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/delete|remove/i)).not.toBeInTheDocument();
    });

    it.each([
      { childTargetId: PARAGRAPH_ID, shown: "Test 1", hidden: "Test X" },
      { childTargetId: HEADING_ID, shown: "Test X", hidden: "Test 1" },
    ])(
      "shows only the comments of node $childTargetId",
      async ({ childTargetId, shown, hidden }) => {
        setup({
          childTargetId,
          comments: [
            commentWithText("Test X", { id: 1, child_target_id: HEADING_ID }),
            commentWithText("Test 1", { id: 2 }),
          ],
        });

        expect(await screen.findByText(shown)).toBeInTheDocument();
        expect(screen.queryByText(hidden)).not.toBeInTheDocument();
      },
    );

    it("shows the comments of the new node when the open sidebar switches nodes", async () => {
      setupStatefulCommentEndpoints({
        comments: [
          commentWithText("Heading comment", {
            id: 1,
            child_target_id: HEADING_ID,
          }),
          commentWithText("Paragraph comment", { id: 2 }),
        ],
        currentUser: ADMIN,
      });

      function RoutedCommentsSidesheet() {
        const params = useParams<{ childTargetId: string }>();
        return <CommentsSidesheet params={params} onClose={jest.fn()} />;
      }

      const { router } = renderWithProviders(
        <Route
          path="/document/:entityId/comments/:childTargetId"
          element={<RoutedCommentsSidesheet />}
        />,
        {
          withRouter: true,
          initialRoute: `/document/${DOCUMENT_ID}/comments/${PARAGRAPH_ID}`,
          storeInitialState: createMockState({
            currentUser: ADMIN,
            documents: {
              ...documentsInitialState,
              currentDocument: createMockDocument({ id: DOCUMENT_ID }),
            },
          }),
        },
      );

      expect(await screen.findByText("Paragraph comment")).toBeInTheDocument();
      expect(screen.queryByText("Heading comment")).not.toBeInTheDocument();
      const sidebar = screen.getByTestId("comments-sidebar");

      act(() => {
        checkNotNull(router).navigate(
          `/document/${DOCUMENT_ID}/comments/${HEADING_ID}`,
        );
      });

      expect(await screen.findByText("Heading comment")).toBeInTheDocument();
      expect(screen.queryByText("Paragraph comment")).not.toBeInTheDocument();
      // the same sidebar stays mounted across the switch
      expect(screen.getByTestId("comments-sidebar")).toBe(sidebar);
    });
  });

  describe("resolving and unresolving", () => {
    it("resolves and unresolves a thread, shows the resolved tab only when needed, and blocks replies to resolved threads", async () => {
      setup();

      await submitWithShortcut(await findNewThreadTextbox(), "Test resolving");
      expect(await screen.findByText("Test resolving")).toBeInTheDocument();
      expect(
        screen.queryByTestId("comments-resolved-tab"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(getComment("Test resolving")).getByRole("button", {
          name: "Resolve",
        }),
      );

      const resolvedTab = await screen.findByTestId("comments-resolved-tab");
      expect(resolvedTab).toHaveTextContent("Resolved (1)");
      expect(
        within(getOpenPanel()).queryByText("Test resolving"),
      ).not.toBeInTheDocument();

      await userEvent.click(resolvedTab);
      const resolvedPanel = screen.getByRole("tabpanel", {
        name: "Resolved (1)",
      });
      // only the comment itself, no reply editor
      expect(within(resolvedPanel).getAllByRole("textbox")).toHaveLength(1);

      await userEvent.click(
        within(getComment("Test resolving")).getByRole("button", {
          name: "Re-open",
        }),
      );
      await waitFor(() => {
        expect(
          screen.queryByTestId("comments-resolved-tab"),
        ).not.toBeInTheDocument();
      });
    });

    it("lets a user resolve a thread created by another user from the all comments sidebar", async () => {
      setup({
        childTargetId: "all",
        comments: [
          commentWithText("Test resolving", { id: 1, is_resolved: true }),
          commentWithText("Main comment", { id: 2 }),
        ],
        currentUser: NORMAL_USER,
      });

      await screen.findByText("Main comment");
      await userEvent.click(
        within(getComment("Main comment")).getByRole("button", {
          name: "Resolve",
        }),
      );

      expect(
        await screen.findByRole("tab", { name: "Resolved (2)" }),
      ).toBeInTheDocument();
      expect(
        within(getOpenPanel()).queryByText("Main comment"),
      ).not.toBeInTheDocument();
    });

    it("resolves only via the first comment, shows all comments of a resolved thread, and resolves and unresolves a thread whose first comment is deleted", async () => {
      setup({
        comments: [
          commentWithText("Main comment", { id: 1 }),
          commentWithText("Reply 1", { id: 2, parent_comment_id: 1 }),
        ],
      });

      await screen.findByText("Reply 1");
      expect(
        within(getComment("Reply 1")).getByTestId("comment-action-panel"),
      ).toBeInTheDocument();
      expect(
        within(getComment("Reply 1")).queryByRole("button", {
          name: "Resolve",
        }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(getComment("Main comment")).getByRole("button", {
          name: "Resolve",
        }),
      );
      await userEvent.click(await screen.findByTestId("comments-resolved-tab"));
      const resolvedPanel = screen.getByRole("tabpanel", {
        name: "Resolved (2)",
      });
      expect(
        within(resolvedPanel).getByText("Main comment"),
      ).toBeInTheDocument();
      expect(within(resolvedPanel).getByText("Reply 1")).toBeInTheDocument();

      await userEvent.click(
        within(getComment("Main comment")).getByRole("button", {
          name: "Re-open",
        }),
      );
      await waitFor(() => {
        expect(
          screen.queryByTestId("comments-resolved-tab"),
        ).not.toBeInTheDocument();
      });
      expect(
        within(getOpenPanel()).getByText("Main comment"),
      ).toBeInTheDocument();
      expect(within(getOpenPanel()).getByText("Reply 1")).toBeInTheDocument();

      await openMoreActions("Main comment");
      await userEvent.click(
        await screen.findByTestId("comment-action-panel-delete"),
      );

      const deletedComment = await screen.findByTestId(
        "discussion-comment-deleted",
      );
      await userEvent.click(
        within(deletedComment).getByRole("button", { name: "Resolve" }),
      );

      expect(
        await screen.findByTestId("comments-resolved-tab"),
      ).toBeInTheDocument();
      expect(
        within(getOpenPanel()).queryByTestId("discussion-comment-deleted"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: "Resolved (1)" }));
      await userEvent.click(
        within(screen.getByTestId("discussion-comment-deleted")).getByRole(
          "button",
          { name: "Re-open" },
        ),
      );

      await waitFor(() => {
        expect(screen.queryAllByRole("tab")).toHaveLength(0);
      });
      expect(screen.getByTestId("new-thread-editor")).toBeVisible();
    });
  });

  describe("all comments", () => {
    it("shows all threads newest first and does not allow creating new threads", async () => {
      setup({
        childTargetId: "all",
        comments: [
          commentWithText("thread 1", {
            id: 1,
            created_at: "2024-01-01T00:00:00Z",
          }),
          commentWithText("thread 2", {
            id: 2,
            child_target_id: HEADING_ID,
            created_at: "2024-01-02T00:00:00Z",
          }),
        ],
      });

      expect(
        await screen.findByRole("heading", { name: "All comments" }),
      ).toBeInTheDocument();
      const comments = await screen.findAllByTestId("discussion-comment");
      expect(comments).toHaveLength(2);
      expect(comments[0]).toHaveTextContent("thread 2");
      expect(comments[1]).toHaveTextContent("thread 1");
      expect(screen.queryByTestId("new-thread-editor")).not.toBeInTheDocument();
    });

    it("renders a placeholder when there are no comments", async () => {
      setup({ childTargetId: "all" });

      expect(
        await screen.findByRole("heading", { name: "All comments" }),
      ).toBeInTheDocument();
      expect(screen.getByText("No comments")).toBeInTheDocument();
    });

    it("renders a placeholder when all comments are resolved", async () => {
      setup({
        childTargetId: "all",
        comments: [commentWithText("Test 1", { id: 1, is_resolved: true })],
      });

      expect(
        await screen.findByRole("tab", { name: "Resolved (1)" }),
      ).toBeInTheDocument();
      expect(
        within(getOpenPanel()).getByText("No comments"),
      ).toBeInTheDocument();
      expect(
        within(getOpenPanel()).queryByText("Test 1"),
      ).not.toBeInTheDocument();
    });
  });

  describe("reactions", () => {
    function getReactions(text: string) {
      return within(getComment(text)).getByTestId("discussion-reactions");
    }

    it("adds multiple reactions to a comment and removes own reactions", async () => {
      setup({ comments: [commentWithText("Test 1", { id: 1 })] });

      await screen.findByText("Test 1");
      await reactToComment("Test 1", FIRST_EMOJI);
      await reactToComment("Test 1", SECOND_EMOJI);

      await waitFor(() => {
        expect(getReactions("Test 1")).toHaveTextContent(
          `${FIRST_EMOJI}1${SECOND_EMOJI}1`,
        );
      });

      await userEvent.click(
        within(getReactions("Test 1")).getByText(FIRST_EMOJI),
      );

      await waitFor(() => {
        expect(
          within(getReactions("Test 1")).queryByText(FIRST_EMOJI),
        ).not.toBeInTheDocument();
      });
      expect(getReactions("Test 1")).toHaveTextContent(`${SECOND_EMOJI}1`);
    });

    it("reacts on resolved comments", async () => {
      setup({
        comments: [
          commentWithText("Resolved comment", { id: 1, is_resolved: true }),
        ],
      });

      await userEvent.click(
        await screen.findByRole("tab", { name: "Resolved (1)" }),
      );
      await reactToComment("Resolved comment", FIRST_EMOJI);
      await reactToComment("Resolved comment", SECOND_EMOJI);

      await waitFor(() => {
        expect(getReactions("Resolved comment")).toHaveTextContent(
          `${FIRST_EMOJI}1${SECOND_EMOJI}1`,
        );
      });
    });

    it("does not offer reactions on deleted comments", async () => {
      setup({
        comments: [
          commentWithText("Deleted comment", {
            id: 1,
            deleted_at: "2024-01-02",
          }),
          commentWithText("Test II", { id: 2, parent_comment_id: 1 }),
        ],
      });

      await screen.findByText("Test II");
      expect(
        within(getComment("Test II")).getByRole("button", {
          name: "Add reaction",
        }),
      ).toBeInTheDocument();

      const deletedComment = screen.getByTestId("discussion-comment-deleted");
      expect(
        within(deletedComment).getByTestId("comment-action-panel"),
      ).toBeInTheDocument();
      expect(
        within(deletedComment).queryByRole("button", { name: "Add reaction" }),
      ).not.toBeInTheDocument();
    });

    it("adds to other users' reactions from the reaction and from the picker, and removes own reaction from them", async () => {
      setup({
        currentUser: NORMAL_USER,
        comments: [
          commentWithText("Test 1", {
            id: 1,
            reactions: [
              {
                emoji: FIRST_EMOJI,
                count: 1,
                users: [{ id: ADMIN.id, name: ADMIN.common_name }],
              },
              {
                emoji: SECOND_EMOJI,
                count: 1,
                users: [{ id: ADMIN.id, name: ADMIN.common_name }],
              },
            ],
          }),
        ],
      });

      await screen.findByText("Test 1");
      await userEvent.click(
        within(getReactions("Test 1")).getByText(FIRST_EMOJI),
      );
      await reactToComment("Test 1", SECOND_EMOJI);

      await waitFor(() => {
        expect(getReactions("Test 1")).toHaveTextContent(
          `${FIRST_EMOJI}2${SECOND_EMOJI}2`,
        );
      });

      await userEvent.click(
        within(getReactions("Test 1")).getByText(FIRST_EMOJI),
      );

      await waitFor(() => {
        expect(getReactions("Test 1")).toHaveTextContent(
          `${FIRST_EMOJI}1${SECOND_EMOJI}2`,
        );
      });
    });
  });
});

function createComment(
  text: string,
  childTargetId: string,
  comment?: Partial<Comment>,
) {
  return createMockComment({
    target_type: "document",
    target_id: DOCUMENT_ID,
    child_target_id: childTargetId,
    content: createMockDocumentContent({
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }),
    ...comment,
  });
}

interface CommentLinksSetupOpts {
  isFooResolved?: boolean;
  /** Add another, resolved thread so the tabs stay when Foo is re-opened. */
  withResolvedThread?: boolean;
  /** Render with Foo's comment link as the browser URL, as when it is opened cold. */
  openFooLink?: boolean;
}

function setupCommentLinks({
  isFooResolved = false,
  withResolvedThread = false,
  openFooLink = false,
}: CommentLinksSetupOpts = {}) {
  const foo = createComment("Foo", HEADING_ID, { is_resolved: isFooResolved });
  const comments = [
    foo,
    createComment("Bar", HEADING_ID),
    createComment("Paragraph Foo", PARAGRAPH_ID),
    ...(withResolvedThread
      ? [createComment("Baz", HEADING_ID, { is_resolved: true })]
      : []),
  ];
  setupCommentEndpoints(comments, {
    target_type: "document",
    target_id: DOCUMENT_ID,
  });
  setupUpdateCommentEndpoint(comments);

  const fooLink = `${COMMENTS_PATH}#comment-${foo.id}`;
  // The comments read the hash from the browser location, not the router.
  window.history.replaceState(null, "", openFooLink ? fooLink : COMMENTS_PATH);

  renderWithProviders(
    <Route
      path="/document/:entityId/comments/:childTargetId"
      element={
        <CommentsSidesheet
          params={{ childTargetId: HEADING_ID }}
          onClose={jest.fn()}
        />
      }
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: COMMENTS_PATH,
      storeInitialState: {
        documents: {
          ...documentsInitialState,
          currentDocument: createMockDocument({ id: DOCUMENT_ID }),
        },
      },
    },
  );

  return { fooLink };
}

async function findCommentByText(text: string) {
  return waitFor(() => {
    const comment = screen
      .getAllByTestId("discussion-comment")
      .find((element) => within(element).queryByText(text));
    if (!comment) {
      throw new Error(`No comment with text "${text}"`);
    }
    return comment;
  });
}

/** Sets the browser URL in place, like opening a link that only changes the hash. */
function openLink(link: string) {
  act(() => {
    window.history.replaceState(null, "", link);
    // A browser fires popstate when a link changes only the hash. react-use's
    // useLocation listens for it. Its replaceState patch can't be relied on,
    // because it wraps the history of the window that was there when the
    // package loaded, and the node:test runner loads packages once per worker.
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function getSidebar() {
  return screen.getByTestId("comments-sidebar");
}

describe("CommentsSidesheet comment links", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // jsdom keeps the URL between tests
    openLink("/");
  });

  it("copies a link to a comment", async () => {
    const { fooLink } = setupCommentLinks();
    const writeText = jest.spyOn(navigator.clipboard, "writeText");

    const foo = await findCommentByText("Foo");
    await userEvent.click(within(foo).getByLabelText("More actions"));
    await userEvent.click(
      await within(await screen.findByRole("dialog")).findByText("Copy link"),
    );

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${fooLink}`,
    );
    expect(await screen.findByText("Copied link")).toBeInTheDocument();
  });

  it("opens a comment link in the comment's thread and highlights the comment", async () => {
    const { fooLink } = setupCommentLinks();
    expect(await findCommentByText("Foo")).not.toHaveAttribute("aria-current");
    openLink(fooLink);

    const sidebar = getSidebar();
    expect(
      await within(sidebar).findByRole("heading", {
        name: "Comments about this",
      }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("heading", { name: "All comments" }),
    ).not.toBeInTheDocument();
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(within(sidebar).getAllByTestId("discussion-comment")).toHaveLength(
      2,
    );
    expect(await findCommentByText("Bar")).not.toHaveAttribute("aria-current");
  });

  it("switches between the Open and Resolved tabs as the linked thread is resolved and unresolved", async () => {
    const { fooLink } = setupCommentLinks();
    expect(await findCommentByText("Foo")).not.toHaveAttribute("aria-current");
    openLink(fooLink);

    expect(await findCommentByText("Foo")).toBeInTheDocument();
    expect(
      screen.queryByTestId("comments-resolved-tab"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Resolve",
      }),
    );

    expect(await screen.findByTestId("comments-resolved-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Re-open",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("comments-resolved-tab"),
      ).not.toBeInTheDocument(),
    );
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("selects the Open or Resolved tab from the linked thread's state while other threads stay resolved", async () => {
    setupCommentLinks({ withResolvedThread: true, openFooLink: true });

    expect(await screen.findByTestId("comments-open-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Resolve",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("comments-resolved-tab")).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Re-open",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("comments-open-tab")).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByTestId("comments-resolved-tab")).toBeInTheDocument();
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("opens a link to a resolved comment in the Resolved tab", async () => {
    setupCommentLinks({ isFooResolved: true, openFooLink: true });

    expect(await screen.findByTestId("comments-resolved-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(
      within(getSidebar()).getAllByTestId("discussion-comment"),
    ).toHaveLength(1);
  });
});
