import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { DocumentContent, Timeline, TimelineId } from "metabase-types/api";
import { createMockTimeline } from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { ActionToolbar } from "./ActionToolbar";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const EXPLORATION_ID = 42;
const GROUP_ID = "group-1";
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
  timelines?: Timeline[];
  selectedTimelineId?: TimelineId | null;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
  showTimelineDropdown?: boolean;
  withUndos?: boolean;
}

function setup({
  timelines = [],
  selectedTimelineId = null,
  interestingTimelineIds,
  showTimelineDropdown = true,
  withUndos = false,
}: SetupOpts = {}) {
  const onSelectTimelineId = jest.fn();
  const setCommentDrafts = jest.fn();

  renderWithProviders(
    <ActionToolbar
      explorationId={EXPLORATION_ID}
      groupId={GROUP_ID}
      commentDrafts={{}}
      setCommentDrafts={setCommentDrafts}
      showTimelineDropdown={showTimelineDropdown}
      availableTimelines={timelines}
      selectedTimelineId={selectedTimelineId}
      onSelectTimelineId={onSelectTimelineId}
      interestingTimelineIds={interestingTimelineIds}
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

    it("shows available timelines when opened, with marker on interesting ones", async () => {
      setup({
        timelines: [releases, incidents],
        interestingTimelineIds: new Set([releases.id]),
      });

      await openTimelineMenu();

      const releasesItem = await screen.findByRole("menuitem", {
        name: /Releases/,
      });
      const incidentsItem = screen.getByRole("menuitem", { name: /Incidents/ });

      expect(
        within(releasesItem).getByTestId("potentially-interesting-marker"),
      ).toBeInTheDocument();
      expect(
        within(incidentsItem).queryByTestId("potentially-interesting-marker"),
      ).not.toBeInTheDocument();
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
          child_target_id: GROUP_ID,
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
        child_target_id: GROUP_ID,
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
});
