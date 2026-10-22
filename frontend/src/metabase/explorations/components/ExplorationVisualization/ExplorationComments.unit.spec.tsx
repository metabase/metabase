import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockState } from "__support__/state";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { getHighlightedComment } from "metabase/explorations/selectors";
import { Route } from "metabase/router";
import type { Comment, CommentContext, Timeline } from "metabase-types/api";
import { createMockTimeline, createMockUser } from "metabase-types/api/mocks";
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
  timelines?: Timeline[];
  onSelectTimelineId?: (timelineId: number | null) => void;
  pageId?: string;
}

function setup({
  comments = [],
  context,
  timelines = [],
  onSelectTimelineId,
  pageId = PAGE_ID,
}: SetupOpts = {}) {
  fetchMock.get("path:/api/comment", { comments });
  fetchMock.post("path:/api/comment", 200);

  const onClose = jest.fn();

  const view = renderWithProviders(
    <Route
      path="*"
      element={
        <ExplorationComments
          explorationId={EXPLORATION_ID}
          pageId={pageId}
          view="page"
          context={context}
          onClose={onClose}
          timelines={timelines}
          onSelectTimelineId={onSelectTimelineId}
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

  return { onClose, store: view.store };
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

  it("renders highlight and timeline badges between the author line and the comment body", async () => {
    setup({
      comments: [
        commentWithText("Tagged comment", {
          id: 1,
          context: {
            highlight_label: "Gadget, EU",
            exploration_query_ids: [102],
            highlighted: {
              dimensions: [{ columnName: "category", value: "Gadget" }],
            },
            timeline_id: 42,
          },
        }),
      ],
      timelines: [createMockTimeline({ id: 42, name: "Releases" })],
      onSelectTimelineId: jest.fn(),
    });

    const row = await screen.findByTestId("discussion-comment");
    const highlightBadge = within(row).getByRole("button", {
      name: "Gadget, EU",
    });
    const timelineBadge = within(row).getByRole("button", { name: "Releases" });
    const body = within(row).getByText("Tagged comment");
    expect(
      highlightBadge.compareDocumentPosition(body) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(timelineBadge).toBeInTheDocument();
  });

  it("dispatches highlightedComment on highlight badge hover", async () => {
    const { store } = setup({
      comments: [
        commentWithText("Hover me", {
          id: 1,
          context: {
            highlight_label: "Gadget",
            exploration_query_ids: [101],
            highlighted: {
              dimensions: [{ columnName: "category", value: "Gadget" }],
            },
          },
        }),
      ],
    });

    const badge = await screen.findByRole("button", { name: "Gadget" });
    fireEvent.mouseEnter(badge);

    expect(getHighlightedComment(store.getState())).toEqual({
      childTargetId: PAGE_ID,
      explorationQueryIds: [101],
      highlighted: {
        dimensions: [{ columnName: "category", value: "Gadget" }],
      },
    });

    fireEvent.mouseLeave(badge);
    expect(getHighlightedComment(store.getState())).toBeNull();
  });

  it("calls onSelectTimelineId when a timeline badge is clicked", async () => {
    const onSelectTimelineId = jest.fn();
    setup({
      comments: [
        commentWithText("Timeline", {
          id: 1,
          context: { timeline_id: 42 },
        }),
      ],
      timelines: [createMockTimeline({ id: 42, name: "Releases" })],
      onSelectTimelineId,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Releases" }),
    );

    expect(onSelectTimelineId).toHaveBeenCalledWith(42);
  });

  it("renders the timeline badge as a plain label when onSelectTimelineId is omitted", async () => {
    setup({
      comments: [
        commentWithText("Timeline", {
          id: 1,
          context: { timeline_id: 42 },
        }),
      ],
      timelines: [createMockTimeline({ id: 42, name: "Releases" })],
    });

    expect(await screen.findByText("Releases")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Releases" }),
    ).not.toBeInTheDocument();
  });

  it("renders no tags and does not throw when the child target is a prose uuid", async () => {
    const proseId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    setup({
      pageId: proseId,
      comments: [
        commentWithText("Prose note", {
          id: 1,
          child_target_id: proseId,
          context: {},
        }),
      ],
    });

    expect(await screen.findByText("Prose note")).toBeInTheDocument();
    // No highlight/timeline tags — only the action-panel chrome buttons remain.
    expect(screen.queryByText("Gadget")).not.toBeInTheDocument();
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

  it("scrolls the deep-linked comment into view and marks it current", async () => {
    const scrollIntoViewMock = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
    window.location.hash = "#comment-2";

    try {
      setup({
        comments: [
          commentWithText("First", {
            id: 1,
            created_at: "2026-01-01T00:00:00Z",
          }),
          commentWithText("Target", {
            id: 2,
            created_at: "2026-01-02T00:00:00Z",
          }),
          commentWithText("Last", {
            id: 3,
            created_at: "2026-01-03T00:00:00Z",
          }),
        ],
      });

      const rows = await screen.findAllByTestId("discussion-comment");
      expect(rows[1]).toHaveAttribute("aria-current", "location");
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center" });
      });
      // The scroll targeted the deep-linked row itself.
      expect(scrollIntoViewMock.mock.contexts).toContain(rows[1]);
    } finally {
      window.location.hash = "";
    }
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
