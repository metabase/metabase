import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { initialState as documentsInitialState } from "metabase/documents/documents.slice";
import { Route } from "metabase/router";
import type { Comment, CommentReaction, User } from "metabase-types/api";
import { createMockDocument, createMockUser } from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { CommentsSidesheet } from "./CommentsSidesheet";

jest.mock("metabase/comments/components/CommentEditor", () => ({
  CommentEditor: ({
    readonly,
    initialContent,
    placeholder,
    "data-testid": dataTestId,
  }: {
    readonly?: boolean;
    initialContent?: { content?: { content?: { text?: string }[] }[] } | null;
    placeholder?: string;
    "data-testid"?: string;
  }) => (
    <div data-testid={dataTestId} data-readonly={readonly ? "true" : "false"}>
      {placeholder && <span>{placeholder}</span>}
      <span>{initialContent?.content?.[0]?.content?.[0]?.text}</span>
    </div>
  ),
}));

jest.mock("metabase/common/components/EmojiPicker", () => ({
  EmojiPicker: ({
    onEmojiSelect,
  }: {
    onEmojiSelect?: (emoji: { emoji: string; label: string }) => void;
  }) => (
    <div data-testid="emoji-picker">
      {["😀", "😃"].map((emoji) => (
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
const PARAGRAPH_ID = "paragraph-node";
const HEADING_ID = "heading-node";
const DELETED_AT = "2024-01-02T00:00:00Z";
const FIRST_EMOJI = "😀";
const SECOND_EMOJI = "😃";

const ADMIN = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
});
const NORMAL_USER = createMockUser({
  id: 2,
  first_name: "Robert",
  last_name: "Tableton",
  common_name: "Robert Tableton",
});

function createComment({
  text,
  ...comment
}: Partial<Comment> & { text: string }): Comment {
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

function createReaction({
  emoji,
  users,
}: {
  emoji: string;
  users: User[];
}): CommentReaction {
  return {
    emoji,
    count: users.length,
    users: users.map(({ id, common_name }) => ({ id, name: common_name })),
  };
}

function toggleUserReaction({
  reactions,
  emoji,
  user,
}: {
  reactions: CommentReaction[];
  emoji: string;
  user: User;
}): CommentReaction[] {
  const reaction = reactions.find((reaction) => reaction.emoji === emoji);
  if (!reaction) {
    return [...reactions, createReaction({ emoji, users: [user] })];
  }
  const hasReacted = reaction.users.some(({ id }) => id === user.id);
  const users = hasReacted
    ? reaction.users.filter(({ id }) => id !== user.id)
    : [...reaction.users, { id: user.id, name: user.common_name }];
  return reactions
    .map((item) =>
      item.emoji === emoji ? { ...item, users, count: users.length } : item,
    )
    .filter(({ count }) => count > 0);
}

function setupStatefulCommentEndpoints({
  comments,
  currentUser,
}: {
  comments: Comment[];
  currentUser: User;
}) {
  const commentsById = new Map(
    comments.map((comment) => [comment.id, comment]),
  );
  const getComment = (id: string | undefined) => {
    const comment = commentsById.get(Number(id));
    if (!comment) {
      throw new Error(`Unknown comment ${id}`);
    }
    return comment;
  };

  fetchMock.get("path:/api/comment", () => ({
    comments: [...commentsById.values()],
  }));
  fetchMock.put("express:/api/comment/:id", (call) => {
    const changes: Partial<Comment> = JSON.parse(String(call.options.body));
    const comment = { ...getComment(call.expressParams?.id), ...changes };
    commentsById.set(comment.id, comment);
    return comment;
  });
  fetchMock.post("express:/api/comment/:id/reaction", (call) => {
    const { emoji }: { emoji: string } = JSON.parse(String(call.options.body));
    const comment = getComment(call.expressParams?.id);
    const reactions = toggleUserReaction({
      reactions: comment.reactions,
      emoji,
      user: currentUser,
    });
    commentsById.set(comment.id, { ...comment, reactions });
    return {
      reacted: reactions.some(
        (reaction) =>
          reaction.emoji === emoji &&
          reaction.users.some(({ id }) => id === currentUser.id),
      ),
    };
  });
}

interface SetupOpts {
  comments: Comment[];
  childTargetId?: string;
  currentUser?: User;
  hash?: string;
}

function setup({
  comments,
  childTargetId = PARAGRAPH_ID,
  currentUser = ADMIN,
  hash = "",
}: SetupOpts) {
  setupStatefulCommentEndpoints({ comments, currentUser });

  window.location.hash = hash;

  renderWithProviders(
    <Route
      path="*"
      element={
        <CommentsSidesheet params={{ childTargetId }} onClose={jest.fn()} />
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
}

const getActivePanel = () => screen.getByRole("tabpanel");

function getCommentRow(text: string) {
  const row = within(getActivePanel())
    .getAllByTestId("discussion-comment")
    .find((comment) => within(comment).queryByText(text));
  if (!row) {
    throw new Error(`No comment row found for "${text}"`);
  }
  return row;
}

function expectPanelTexts({
  visible,
  absent,
}: {
  visible: string[];
  absent: string[];
}) {
  const panel = within(getActivePanel());
  visible.forEach((text) => expect(panel.getByText(text)).toBeInTheDocument());
  absent.forEach((text) =>
    expect(panel.queryByText(text)).not.toBeInTheDocument(),
  );
}

async function openMoreActions(text: string) {
  await userEvent.click(
    within(getCommentRow(text)).getByRole("button", { name: "More actions" }),
  );
}

async function addReaction({ text, emoji }: { text: string; emoji: string }) {
  await userEvent.click(
    within(getCommentRow(text)).getByRole("button", { name: "Add reaction" }),
  );
  await userEvent.click(
    within(await screen.findByTestId("emoji-picker")).getByRole("button", {
      name: emoji,
    }),
  );
}

const getReactions = (text: string) =>
  within(getCommentRow(text)).getByTestId("discussion-reactions");

describe("CommentsSidesheet", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  describe("threads", () => {
    it("shows unresolved, undeleted comments and moves resolved threads to the Resolved tab", async () => {
      setup({
        comments: [
          createComment({ id: 1, text: "Test 1", deleted_at: DELETED_AT }),
          createComment({ id: 2, text: "Test 2", parent_comment_id: 1 }),
          createComment({ id: 3, text: "Test 3", parent_comment_id: 1 }),
          createComment({ id: 4, text: "Test A" }),
          createComment({
            id: 5,
            text: "Test B",
            parent_comment_id: 4,
            deleted_at: DELETED_AT,
          }),
          createComment({ id: 6, text: "Test C", parent_comment_id: 4 }),
          createComment({
            id: 7,
            text: "Test I",
            deleted_at: DELETED_AT,
            is_resolved: true,
          }),
          createComment({ id: 8, text: "Test II", parent_comment_id: 7 }),
          createComment({ id: 9, text: "Test III", parent_comment_id: 7 }),
          createComment({ id: 10, text: "Test X", deleted_at: DELETED_AT }),
          createComment({
            id: 11,
            text: "Test Y",
            parent_comment_id: 10,
            deleted_at: DELETED_AT,
          }),
          createComment({
            id: 12,
            text: "Test Z",
            parent_comment_id: 10,
            deleted_at: DELETED_AT,
          }),
          createComment({
            id: 13,
            text: "Test D",
            deleted_at: DELETED_AT,
            is_resolved: true,
          }),
          createComment({
            id: 14,
            text: "Test E",
            parent_comment_id: 13,
            deleted_at: DELETED_AT,
          }),
          createComment({
            id: 15,
            text: "Test F",
            parent_comment_id: 13,
            deleted_at: DELETED_AT,
          }),
        ],
      });

      expect(
        await screen.findByRole("heading", { name: "Comments about this" }),
      ).toBeInTheDocument();
      expectPanelTexts({
        visible: ["Test 2", "Test 3", "Test A", "Test C"],
        absent: [
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
        ],
      });

      await userEvent.click(screen.getByRole("tab", { name: "Resolved (2)" }));

      expectPanelTexts({
        visible: ["Test II", "Test III"],
        absent: [
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
        ],
      });
    });

    it("shows other users' comments with their names, only for the current node, and without edit or delete actions", async () => {
      setup({
        currentUser: NORMAL_USER,
        comments: [
          createComment({ id: 1, text: "Test 1", creator: ADMIN }),
          createComment({
            id: 2,
            text: "Test A",
            parent_comment_id: 1,
            creator: NORMAL_USER,
          }),
          createComment({
            id: 3,
            text: "Test X",
            child_target_id: HEADING_ID,
          }),
        ],
      });

      expect(await screen.findByText("Test 1")).toBeInTheDocument();
      expect(getCommentRow("Test 1")).toHaveTextContent("Bobby Tables");
      expect(getCommentRow("Test 1")).toHaveTextContent("BT");
      expect(getCommentRow("Test A")).toHaveTextContent("Robert Tableton");
      expect(getCommentRow("Test A")).toHaveTextContent("RT");
      expect(screen.queryByText("Test X")).not.toBeInTheDocument();

      await openMoreActions("Test 1");
      expect(await screen.findByText("Copy link")).toBeInTheDocument();
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
      await openMoreActions("Test 1");
      await waitFor(() =>
        expect(screen.queryByText("Copy link")).not.toBeInTheDocument(),
      );

      await openMoreActions("Test A");
      expect(await screen.findByText("Edit")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });
  });

  describe("resolve / re-open", () => {
    it("offers resolving only on the first comment of a thread and does not show the Resolved tab without resolved comments", async () => {
      setup({
        comments: [
          createComment({ id: 1, text: "Main comment" }),
          createComment({ id: 2, text: "Reply 1", parent_comment_id: 1 }),
        ],
      });

      expect(await screen.findByText("Main comment")).toBeInTheDocument();
      expect(
        within(getCommentRow("Main comment")).getByTestId(
          "comment-action-panel-resolve",
        ),
      ).toBeInTheDocument();
      expect(
        within(getCommentRow("Reply 1")).getByTestId("comment-action-panel"),
      ).toBeInTheDocument();
      expect(
        within(getCommentRow("Reply 1")).queryByTestId(
          "comment-action-panel-resolve",
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("comments-resolved-tab"),
      ).not.toBeInTheDocument();
    });

    it("resolves another user's thread, shows all its comments without a reply editor, and re-opens it", async () => {
      setup({
        currentUser: ADMIN,
        comments: [
          createComment({ id: 1, text: "Main comment", creator: NORMAL_USER }),
          createComment({ id: 2, text: "Reply 1", parent_comment_id: 1 }),
        ],
      });

      expect(await screen.findByText("Main comment")).toBeInTheDocument();
      expect(
        within(getActivePanel()).getByTestId("new-thread-editor"),
      ).toBeInTheDocument();
      expect(
        within(getActivePanel())
          .getAllByTestId("comment-editor")
          .filter((editor) => editor.dataset.readonly === "false"),
      ).toHaveLength(1);

      await userEvent.click(
        within(getCommentRow("Main comment")).getByTestId(
          "comment-action-panel-resolve",
        ),
      );

      await waitFor(() =>
        expect(screen.getByTestId("comments-resolved-tab")).toHaveTextContent(
          "Resolved (2)",
        ),
      );
      expect(
        fetchMock.callHistory.lastCall("path:/api/comment/1", { method: "PUT" })
          ?.options.body,
      ).toBe(JSON.stringify({ is_resolved: true }));
      expect(screen.getByTestId("new-thread-editor")).toBeInTheDocument();
      expect(
        within(getActivePanel()).queryByTestId("discussion-comment"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("comments-resolved-tab"));

      expectPanelTexts({ visible: ["Main comment", "Reply 1"], absent: [] });
      const resolvedEditors =
        within(getActivePanel()).getAllByTestId("comment-editor");
      expect(resolvedEditors).toHaveLength(2);
      resolvedEditors.forEach((editor) =>
        expect(editor).toHaveAttribute("data-readonly", "true"),
      );

      await userEvent.click(
        within(getCommentRow("Main comment")).getByTestId(
          "comment-action-panel-reopen",
        ),
      );

      await waitFor(() =>
        expect(
          screen.queryByTestId("comments-resolved-tab"),
        ).not.toBeInTheDocument(),
      );
      expectPanelTexts({ visible: ["Main comment", "Reply 1"], absent: [] });
    });

    it("resolves and re-opens a thread whose first comment is deleted", async () => {
      setup({
        comments: [
          createComment({
            id: 1,
            text: "Main comment",
            deleted_at: DELETED_AT,
          }),
          createComment({ id: 2, text: "Reply 1", parent_comment_id: 1 }),
        ],
      });

      const deletedComment = await screen.findByTestId(
        "discussion-comment-deleted",
      );
      expect(deletedComment).toHaveTextContent("This comment was deleted.");

      await userEvent.click(
        within(deletedComment).getByTestId("comment-action-panel-resolve"),
      );

      const resolvedTab = await screen.findByRole("tab", {
        name: "Resolved (1)",
      });
      expect(
        within(getActivePanel()).queryByTestId("discussion-comment-deleted"),
      ).not.toBeInTheDocument();

      await userEvent.click(resolvedTab);
      await userEvent.click(
        within(
          within(getActivePanel()).getByTestId("discussion-comment-deleted"),
        ).getByRole("button", { name: "Re-open" }),
      );

      await waitFor(() => expect(screen.queryAllByRole("tab")).toHaveLength(0));
      expect(screen.getByTestId("new-thread-editor")).toBeInTheDocument();
      expectPanelTexts({ visible: ["Reply 1"], absent: [] });
    });
  });

  describe("comment links", () => {
    it("opens a linked comment in its node thread and marks it as current", async () => {
      setup({
        childTargetId: HEADING_ID,
        hash: "#comment-1",
        comments: [
          createComment({ id: 1, text: "Foo", child_target_id: HEADING_ID }),
          createComment({ id: 2, text: "Bar", child_target_id: HEADING_ID }),
          createComment({ id: 3, text: "Paragraph Foo" }),
        ],
      });

      expect(
        await screen.findByRole("heading", { name: "Comments about this" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "All comments" }),
      ).not.toBeInTheDocument();
      expect(
        within(getActivePanel()).getAllByTestId("discussion-comment"),
      ).toHaveLength(2);
      expect(getCommentRow("Foo")).toHaveAttribute("aria-current", "location");
      expect(getCommentRow("Bar")).not.toHaveAttribute("aria-current");
    });

    it("switches to the tab of a linked comment as it gets resolved and re-opened", async () => {
      setup({
        childTargetId: HEADING_ID,
        hash: "#comment-1",
        comments: [
          createComment({
            id: 1,
            text: "Foo",
            child_target_id: HEADING_ID,
            is_resolved: true,
          }),
          createComment({ id: 2, text: "Bar", child_target_id: HEADING_ID }),
        ],
      });

      expect(
        await screen.findByTestId("comments-resolved-tab"),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        within(getActivePanel()).getAllByTestId("discussion-comment"),
      ).toHaveLength(1);
      expect(getCommentRow("Foo")).toHaveAttribute("aria-current", "location");

      await userEvent.click(
        within(getCommentRow("Foo")).getByTestId("comment-action-panel-reopen"),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("comments-resolved-tab"),
        ).not.toBeInTheDocument(),
      );
      expectPanelTexts({ visible: ["Foo", "Bar"], absent: [] });

      await userEvent.click(
        within(getCommentRow("Foo")).getByTestId(
          "comment-action-panel-resolve",
        ),
      );
      await waitFor(() =>
        expect(screen.getByTestId("comments-resolved-tab")).toHaveAttribute(
          "aria-selected",
          "true",
        ),
      );
      expectPanelTexts({ visible: ["Foo"], absent: ["Bar"] });
    });
  });

  describe("all comments", () => {
    it("lists threads from all nodes newest first without a new thread editor", async () => {
      setup({
        childTargetId: "all",
        comments: [
          createComment({
            id: 1,
            text: "thread 1",
            created_at: "2024-01-01T00:00:00Z",
          }),
          createComment({
            id: 2,
            text: "thread 2",
            child_target_id: HEADING_ID,
            created_at: "2024-01-02T00:00:00Z",
          }),
        ],
      });

      expect(
        await screen.findByRole("heading", { name: "All comments" }),
      ).toBeInTheDocument();
      const comments =
        within(getActivePanel()).getAllByTestId("discussion-comment");
      expect(comments.map((comment) => comment.textContent)).toEqual([
        expect.stringContaining("thread 2"),
        expect.stringContaining("thread 1"),
      ]);
      expect(screen.queryByTestId("new-thread-editor")).not.toBeInTheDocument();
    });

    it("shows a placeholder when there are no comments", async () => {
      setup({ childTargetId: "all", comments: [] });

      expect(
        await screen.findByRole("heading", { name: "All comments" }),
      ).toBeInTheDocument();
      expect(
        within(getActivePanel()).getByText("No comments"),
      ).toBeInTheDocument();
    });

    it("shows a placeholder when all comments are resolved", async () => {
      setup({
        childTargetId: "all",
        comments: [createComment({ id: 1, text: "Test 1", is_resolved: true })],
      });

      expect(
        await screen.findByRole("tab", { name: "Resolved (1)" }),
      ).toBeInTheDocument();
      expectPanelTexts({ visible: ["No comments"], absent: ["Test 1"] });
    });
  });

  describe("reactions", () => {
    it("adds multiple reactions and removes the current user's own reaction", async () => {
      setup({ comments: [createComment({ id: 1, text: "Test 1" })] });

      expect(await screen.findByText("Test 1")).toBeInTheDocument();
      await addReaction({ text: "Test 1", emoji: FIRST_EMOJI });
      await addReaction({ text: "Test 1", emoji: SECOND_EMOJI });

      await waitFor(() =>
        expect(getReactions("Test 1")).toHaveTextContent(
          `${FIRST_EMOJI}1${SECOND_EMOJI}1`,
        ),
      );
      expect(
        fetchMock.callHistory.calls("express:/api/comment/:id/reaction"),
      ).toHaveLength(2);

      await userEvent.click(
        within(getReactions("Test 1")).getByText(FIRST_EMOJI),
      );

      await waitFor(() =>
        expect(getReactions("Test 1")).toHaveTextContent(`${SECOND_EMOJI}1`),
      );
      await waitFor(() =>
        expect(getReactions("Test 1")).not.toHaveTextContent(FIRST_EMOJI),
      );
    });

    it("joins and leaves other users' reactions", async () => {
      setup({
        currentUser: NORMAL_USER,
        comments: [
          createComment({
            id: 1,
            text: "Test 1",
            reactions: [createReaction({ emoji: FIRST_EMOJI, users: [ADMIN] })],
          }),
        ],
      });

      expect(await screen.findByText("Test 1")).toBeInTheDocument();
      await userEvent.click(
        within(getReactions("Test 1")).getByText(FIRST_EMOJI),
      );
      await waitFor(() =>
        expect(getReactions("Test 1")).toHaveTextContent(`${FIRST_EMOJI}2`),
      );

      await userEvent.click(
        within(getReactions("Test 1")).getByText(FIRST_EMOJI),
      );
      await waitFor(() =>
        expect(getReactions("Test 1")).toHaveTextContent(`${FIRST_EMOJI}1`),
      );
    });

    it("allows reacting to resolved comments", async () => {
      setup({
        comments: [createComment({ id: 1, text: "Test 1", is_resolved: true })],
      });

      await userEvent.click(
        await screen.findByRole("tab", { name: "Resolved (1)" }),
      );
      await addReaction({ text: "Test 1", emoji: FIRST_EMOJI });

      await waitFor(() =>
        expect(getReactions("Test 1")).toHaveTextContent(`${FIRST_EMOJI}1`),
      );
    });

    it("does not allow reacting to deleted comments", async () => {
      setup({
        comments: [
          createComment({ id: 1, text: "Test 1", deleted_at: DELETED_AT }),
          createComment({ id: 2, text: "Test II", parent_comment_id: 1 }),
        ],
      });

      const deletedComment = await screen.findByTestId(
        "discussion-comment-deleted",
      );
      expect(
        within(deletedComment).getByTestId("comment-action-panel"),
      ).toBeInTheDocument();
      expect(
        within(deletedComment).queryByRole("button", { name: "Add reaction" }),
      ).not.toBeInTheDocument();
      expect(
        within(getCommentRow("Test II")).getByRole("button", {
          name: "Add reaction",
        }),
      ).toBeInTheDocument();
    });
  });
});
