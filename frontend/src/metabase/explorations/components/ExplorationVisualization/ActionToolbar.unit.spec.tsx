import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { createPage } from "metabase/explorations/test-utils";
import type {
  DocumentContent,
  ExplorationPageNode,
  Timeline,
  TimelineId,
} from "metabase-types/api";
import { createMockTimeline } from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { ActionToolbar } from "./ActionToolbar";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const EXPLORATION_ID = 42;
const PAGE_ID = 1;
const mockCommentContent = createMockDocumentContent({
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Looks interesting" }],
    },
  ],
});

jest.mock("metabase/comments/components", () => ({
  CommentEditor: ({
    onSubmit,
    placeholder,
  }: {
    onSubmit?: (content: DocumentContent) => void;
    placeholder?: string;
  }) => (
    <div>
      {placeholder && <span>{placeholder}</span>}
      <button type="button" onClick={() => onSubmit?.(mockCommentContent)}>
        Submit comment
      </button>
    </div>
  ),
}));

function makeTimeline(id: TimelineId, name: string): Timeline {
  return createMockTimeline({ id, name });
}

interface SetupOpts {
  page?: ExplorationPageNode;
  timelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  showTimelineDropdown?: boolean;
  withUndos?: boolean;
}

function setup({
  page = createPage({ id: PAGE_ID }),
  timelines = [],
  selectedTimelineId = null,
  showTimelineDropdown = true,
  withUndos = false,
}: SetupOpts = {}) {
  const onSelectTimelineId = jest.fn();
  const setCommentDrafts = jest.fn();

  renderWithProviders(
    <ActionToolbar
      explorationId={EXPLORATION_ID}
      page={page}
      commentDrafts={{}}
      setCommentDrafts={setCommentDrafts}
      showTimelineDropdown={showTimelineDropdown}
      availableTimelines={timelines}
      selectedTimelineId={selectedTimelineId}
      onSelectTimelineId={onSelectTimelineId}
    />,
    { withUndos },
  );

  return { onSelectTimelineId, setCommentDrafts };
}

async function openTimelineMenu() {
  const trigger =
    screen.queryByLabelText("Change selected timeline") ??
    screen.getByRole("button", { name: "Select timeline" });

  await userEvent.click(trigger);
}

async function openCommentEditor() {
  await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
  expect(await screen.findByText("Add a comment…")).toBeInTheDocument();
}

async function openMoreActionsMenu() {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
}

function expectTimelineChangedAnalytics(triggered_from: "click" | "keyboard") {
  expect(trackSimpleEvent).toHaveBeenCalledWith({
    event: "exploration_timeline_changed",
    target_id: EXPLORATION_ID,
    triggered_from,
  });
}

describe("ActionToolbar", () => {
  const releases = makeTimeline(1, "Releases");
  const incidents = makeTimeline(2, "Incidents");

  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
  });

  describe("timeline menu", () => {
    it("shows selected timeline name in menu target", () => {
      setup({
        timelines: [releases, incidents],
        selectedTimelineId: releases.id,
      });

      expect(screen.getByText("Releases")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Change selected timeline"),
      ).toBeInTheDocument();
    });

    it("shows the clock icon when no timeline is selected", () => {
      setup({ timelines: [releases, incidents] });

      expect(screen.getByLabelText("clock icon")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Select timeline" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Change selected timeline"),
      ).not.toBeInTheDocument();
    });

    it("shows available timelines when opened", async () => {
      setup({ timelines: [releases, incidents] });

      await openTimelineMenu();

      expect(
        await screen.findByRole("menuitem", { name: "Releases" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Incidents" }),
      ).toBeInTheDocument();
    });
  });

  describe("timeline selection", () => {
    it("selects a timeline from the menu and tracks analytics", async () => {
      const { onSelectTimelineId } = setup({
        timelines: [releases, incidents],
      });

      await openTimelineMenu();
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Incidents/ }),
      );

      expect(onSelectTimelineId).toHaveBeenCalledWith(incidents.id);
      expectTimelineChangedAnalytics("click");
    });

    it("clears the selected timeline and tracks analytics", async () => {
      const { onSelectTimelineId } = setup({
        timelines: [releases, incidents],
        selectedTimelineId: releases.id,
      });

      await userEvent.click(screen.getByLabelText("Remove timeline"));

      expect(onSelectTimelineId).toHaveBeenCalledWith(null);
      expectTimelineChangedAnalytics("click");
    });
  });

  describe("keyboard shortcuts", () => {
    it("selects the next timeline with ArrowDown and tracks analytics", () => {
      const { onSelectTimelineId } = setup({
        timelines: [releases, incidents],
        selectedTimelineId: releases.id,
      });

      fireEvent.keyDown(document.body, { key: "ArrowDown" });

      expect(onSelectTimelineId).toHaveBeenCalledWith(incidents.id);
      expectTimelineChangedAnalytics("keyboard");
    });

    it("selects the previous timeline with ArrowUp and tracks analytics", () => {
      const { onSelectTimelineId } = setup({
        timelines: [releases, incidents],
        selectedTimelineId: incidents.id,
      });

      fireEvent.keyDown(document.body, { key: "ArrowUp" });

      expect(onSelectTimelineId).toHaveBeenCalledWith(releases.id);
      expectTimelineChangedAnalytics("keyboard");
    });

    it("does not cycle timelines when the dropdown is hidden", () => {
      const { onSelectTimelineId } = setup({
        timelines: [releases, incidents],
        showTimelineDropdown: false,
      });

      fireEvent.keyDown(document.body, { key: "ArrowDown" });
      fireEvent.keyDown(document.body, { key: "ArrowUp" });

      expect(onSelectTimelineId).not.toHaveBeenCalled();
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });
  });

  describe("comments", () => {
    it("opens the comment editor from the toolbar button", async () => {
      setup({ timelines: [releases, incidents] });

      await userEvent.click(
        screen.getByRole("button", { name: "Add comment" }),
      );
      expect(await screen.findByText("Add a comment…")).toBeInTheDocument();
    });

    it("opens the comment editor with the c shortcut", () => {
      setup({ timelines: [releases, incidents] });

      fireEvent.keyDown(document.body, { key: "c" });

      expect(screen.getByText("Add a comment…")).toBeInTheDocument();
    });

    it("submits a comment with the selected timeline in context", async () => {
      fetchMock.post(
        "path:/api/comment",
        createMockComment({
          target_type: "exploration",
          target_id: EXPLORATION_ID,
          child_target_id: String(PAGE_ID),
        }),
      );

      setup({
        timelines: [releases, incidents],
        selectedTimelineId: releases.id,
      });

      await openCommentEditor();
      await userEvent.click(
        screen.getByRole("button", { name: "Submit comment" }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/comment", { method: "POST" }),
        ).toHaveLength(1);
      });

      const lastCall = fetchMock.callHistory.lastCall("path:/api/comment", {
        method: "POST",
      });
      expect(await lastCall?.request?.json()).toEqual({
        target_id: EXPLORATION_ID,
        target_type: "exploration",
        child_target_id: String(PAGE_ID),
        parent_comment_id: null,
        content: mockCommentContent,
        context: {
          timeline_id: releases.id,
        },
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Submit comment" }),
        ).not.toBeInTheDocument();
      });
    });

    it("shows a toast when comment submission fails", async () => {
      fetchMock.post("path:/api/comment", 500);

      setup({ timelines: [releases, incidents], withUndos: true });

      await openCommentEditor();
      await userEvent.click(
        screen.getByRole("button", { name: "Submit comment" }),
      );

      expect(
        await screen.findByText("Failed to send comment"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Submit comment" }),
      ).toBeInTheDocument();
    });
  });

  describe("star", () => {
    it("shows the star action when the page is not starred", () => {
      setup({ page: createPage({ id: PAGE_ID, starred: false }) });

      expect(screen.getByRole("button", { name: "Star" })).toBeInTheDocument();
    });

    it("shows the remove-star action when the page is starred", () => {
      setup({ page: createPage({ id: PAGE_ID, starred: true }) });

      expect(
        screen.getByRole("button", { name: "Remove star" }),
      ).toBeInTheDocument();
    });

    it("stars the page on click", async () => {
      fetchMock.put(`path:/api/exploration/page/${PAGE_ID}/starred`, 204);

      setup({ page: createPage({ id: PAGE_ID, starred: false }) });

      await userEvent.click(screen.getByRole("button", { name: "Star" }));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls(
          `path:/api/exploration/page/${PAGE_ID}/starred`,
          { method: "PUT" },
        );
        expect(calls).toHaveLength(1);
        // Unjustified type cast. FIXME
        expect(JSON.parse(calls[0].options?.body as string)).toEqual({
          starred: true,
        });
      });
    });

    it("unstars the page on click", async () => {
      fetchMock.put(`path:/api/exploration/page/${PAGE_ID}/starred`, 204);

      setup({ page: createPage({ id: PAGE_ID, starred: true }) });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove star" }),
      );

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls(
          `path:/api/exploration/page/${PAGE_ID}/starred`,
          { method: "PUT" },
        );
        expect(calls).toHaveLength(1);
        // Unjustified type cast. FIXME
        expect(JSON.parse(calls[0].options?.body as string)).toEqual({
          starred: false,
        });
      });
    });

    it("toggles the star with the s shortcut", async () => {
      fetchMock.put(`path:/api/exploration/page/${PAGE_ID}/starred`, 204);

      setup({ page: createPage({ id: PAGE_ID, starred: false }) });

      fireEvent.keyDown(document.body, { key: "s" });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(
            `path:/api/exploration/page/${PAGE_ID}/starred`,
            { method: "PUT" },
          ),
        ).toHaveLength(1);
      });
    });

    it("shows a toast when starring fails", async () => {
      fetchMock.put(`path:/api/exploration/page/${PAGE_ID}/starred`, 500);

      setup({
        page: createPage({ id: PAGE_ID, starred: false }),
        withUndos: true,
      });

      await userEvent.click(screen.getByRole("button", { name: "Star" }));

      expect(
        await screen.findByText("Failed to update star"),
      ).toBeInTheDocument();
    });
  });

  describe("hide", () => {
    it("shows the hide action in the more-actions menu when the page is not hidden", async () => {
      setup({ page: createPage({ id: PAGE_ID, hidden: false }) });

      await openMoreActionsMenu();

      expect(
        screen.getByRole("menuitem", { name: /Hide/ }),
      ).toBeInTheDocument();
    });

    it("shows the show action in the more-actions menu when the page is hidden", async () => {
      setup({ page: createPage({ id: PAGE_ID, hidden: true }) });

      await openMoreActionsMenu();

      expect(
        screen.getByRole("menuitem", { name: /Show/ }),
      ).toBeInTheDocument();
    });

    it("hides the page on click", async () => {
      fetchMock.put(`path:/api/exploration/pages/hidden`, 204);

      setup({ page: createPage({ id: PAGE_ID, hidden: false }) });

      await openMoreActionsMenu();
      await userEvent.click(screen.getByRole("menuitem", { name: /Hide/ }));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls(
          `path:/api/exploration/pages/hidden`,
          { method: "PUT" },
        );
        expect(calls).toHaveLength(1);
        // Unjustified type cast. FIXME
        expect(JSON.parse(calls[0].options?.body as string)).toEqual({
          page_ids: [PAGE_ID],
          hidden: true,
        });
      });
    });

    it("unhides the page on click", async () => {
      fetchMock.put(`path:/api/exploration/pages/hidden`, 204);

      setup({ page: createPage({ id: PAGE_ID, hidden: true }) });

      await openMoreActionsMenu();
      await userEvent.click(screen.getByRole("menuitem", { name: /Show/ }));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls(
          `path:/api/exploration/pages/hidden`,
          { method: "PUT" },
        );
        expect(calls).toHaveLength(1);
        // Unjustified type cast. FIXME
        expect(JSON.parse(calls[0].options?.body as string)).toEqual({
          page_ids: [PAGE_ID],
          hidden: false,
        });
      });
    });

    it("toggles hidden with the h shortcut", async () => {
      fetchMock.put(`path:/api/exploration/pages/hidden`, 204);

      setup({ page: createPage({ id: PAGE_ID, hidden: false }) });

      fireEvent.keyDown(document.body, { key: "h" });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(`path:/api/exploration/pages/hidden`, {
            method: "PUT",
          }),
        ).toHaveLength(1);
      });
    });

    it("shows an undo toast after hiding the page", async () => {
      fetchMock.put(`path:/api/exploration/pages/hidden`, 204);

      setup({
        page: createPage({ id: PAGE_ID, hidden: false, name: "Orders chart" }),
        withUndos: true,
      });

      await openMoreActionsMenu();
      await userEvent.click(screen.getByRole("menuitem", { name: /Hide/ }));

      expect(
        await screen.findByText('"Orders chart" hidden'),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    });

    it("does not show an undo toast when unhiding", async () => {
      fetchMock.put(`path:/api/exploration/pages/hidden`, 204);

      setup({
        page: createPage({ id: PAGE_ID, hidden: true }),
        withUndos: true,
      });

      await openMoreActionsMenu();
      await userEvent.click(screen.getByRole("menuitem", { name: /Show/ }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls(`path:/api/exploration/pages/hidden`, {
            method: "PUT",
          }),
        ).toHaveLength(1);
      });
      expect(screen.queryByText("Chart hidden")).not.toBeInTheDocument();
    });

    it("shows a toast when hiding fails", async () => {
      fetchMock.put(`path:/api/exploration/pages/hidden`, 500);

      setup({
        page: createPage({ id: PAGE_ID, hidden: false }),
        withUndos: true,
      });

      await openMoreActionsMenu();
      await userEvent.click(screen.getByRole("menuitem", { name: /Hide/ }));

      expect(
        await screen.findByText("Failed to update visibility"),
      ).toBeInTheDocument();
    });
  });
});
