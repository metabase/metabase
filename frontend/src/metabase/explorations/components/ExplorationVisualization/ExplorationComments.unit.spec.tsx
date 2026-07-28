import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Comment, CommentContext } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { ExplorationComments } from "./ExplorationComments";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

jest.mock("metabase/comments/components", () => ({
  CommentEditor: ({
    readonly,
    initialContent,
    placeholder,
    onSubmit,
    "data-testid": dataTestId,
  }: {
    readonly?: boolean;
    initialContent?: { content?: { content?: { text?: string }[] }[] };
    placeholder?: string;
    onSubmit?: (content: unknown) => void;
    "data-testid"?: string;
  }) => (
    <div data-testid={dataTestId} data-readonly={readonly ? "true" : "false"}>
      {placeholder && <span>{placeholder}</span>}
      <span>{initialContent?.content?.[0]?.content?.[0]?.text}</span>
      {!readonly && (
        <button
          type="button"
          onClick={() => onSubmit?.({ type: "doc", content: [] })}
        >
          Send
        </button>
      )}
    </div>
  ),
}));

const PAGE_ID = "7";
const EXPLORATION_ID = 1;

function commentWithText(text: string, comment?: Partial<Comment>): Comment {
  return createMockComment({
    target_type: "exploration",
    target_id: EXPLORATION_ID,
    child_target_id: PAGE_ID,
    content: createMockDocumentContent({
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }),
    ...comment,
  });
}

interface SetupOpts {
  comments?: Comment[];
  context?: CommentContext;
  renderCommentTags?: (comment: Comment) => React.ReactNode;
}

function setup({ comments = [], context, renderCommentTags }: SetupOpts = {}) {
  fetchMock.get("path:/api/comment", { comments });
  fetchMock.post("path:/api/comment", 200);

  const onClose = jest.fn();

  renderWithProviders(
    <Route
      path="*"
      element={
        <ExplorationComments
          explorationId={EXPLORATION_ID}
          pageId={PAGE_ID}
          context={context}
          onClose={onClose}
          renderCommentTags={renderCommentTags}
        />
      }
    />,
    {
      withRouter: true,
      initialRoute: "/question/research/1",
      storeInitialState: createMockState({
        currentUser: createMockUser({ id: 1 }),
      }),
    },
  );

  return { onClose };
}

describe("ExplorationComments", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("renders the page's comments as one flat chronological stream, replies included", async () => {
    setup({
      comments: [
        commentWithText("First", {
          id: 1,
          created_at: "2026-01-01T00:00:00Z",
        }),
        // A reply from the threaded era surfaces as a plain stream entry.
        commentWithText("Third (was a reply)", {
          id: 2,
          parent_comment_id: 1,
          created_at: "2026-01-03T00:00:00Z",
        }),
        commentWithText("Second", {
          id: 3,
          created_at: "2026-01-02T00:00:00Z",
        }),
        commentWithText("Other page", { id: 4, child_target_id: "999" }),
        commentWithText("Deleted", {
          id: 5,
          deleted_at: "2026-01-04T00:00:00Z",
        }),
      ],
    });

    const rows = await screen.findAllByTestId("discussion-comment");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("First"),
      expect.stringContaining("Second"),
      expect.stringContaining("Third (was a reply)"),
    ]);
    expect(screen.queryByText("Other page")).not.toBeInTheDocument();
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("shows resolved comments in the stream and offers no resolution controls or tabs", async () => {
    setup({
      comments: [
        commentWithText("Resolved earlier", { id: 1, is_resolved: true }),
      ],
    });

    expect(await screen.findByText("Resolved earlier")).toBeInTheDocument();
    expect(screen.queryByTestId("comments-open-tab")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("comments-resolved-tab"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("comment-action-panel-resolve"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("comment-action-panel-reopen"),
    ).not.toBeInTheDocument();
  });

  it("offers a single composer that posts a top-level comment against the page", async () => {
    setup({
      comments: [commentWithText("Existing", { id: 1 })],
      context: { timeline_id: 42 },
    });

    const composer = await screen.findByTestId("new-thread-editor");
    // The per-comment editors are read-only; only the composer can submit.
    expect(screen.getByTestId("comment-editor")).toHaveAttribute(
      "data-readonly",
      "true",
    );

    await userEvent.click(
      within(composer).getByRole("button", { name: "Send" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/comment", { method: "POST" }),
      ).toBe(true);
    });
    const [call] = fetchMock.callHistory.calls("path:/api/comment", {
      method: "POST",
    });
    // Unjustified type cast. FIXME
    const body = JSON.parse(call.options?.body as string);
    expect(body).toMatchObject({
      child_target_id: PAGE_ID,
      target_id: EXPLORATION_ID,
      target_type: "exploration",
      parent_comment_id: null,
      context: { timeline_id: 42 },
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "exploration_comment_created",
      target_id: EXPLORATION_ID,
      triggered_from: "sidebar",
    });
  });

  it("renders metadata tags between the author line and the comment body", async () => {
    setup({
      comments: [commentWithText("Tagged comment", { id: 1 })],
      renderCommentTags: () => (
        <div data-testid="comment-tag">Marketing Events, on Sunday</div>
      ),
    });

    const row = await screen.findByTestId("discussion-comment");
    const tag = within(row).getByTestId("comment-tag");
    const body = within(row).getByText("Tagged comment");
    expect(
      tag.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps reactions on stream comments", async () => {
    setup({
      comments: [
        commentWithText("Funny", {
          id: 1,
          reactions: [
            { emoji: "😂", count: 1, users: [{ id: 2, name: "Kyle" }] },
          ],
        }),
      ],
    });

    expect(await screen.findByText("😂")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { onClose } = setup({
      comments: [commentWithText("Hello", { id: 1 })],
    });

    await screen.findByTestId("discussion-comment");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
