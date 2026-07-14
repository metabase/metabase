import { act, render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";

import { screen } from "__support__/ui";
import type {
  ClickActionPopoverProps,
  ClickObject,
} from "metabase/visualizations/types";
import { createMockColumn } from "metabase-types/api/mocks";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import type { CommentDrafts } from "../types";

import { useExplorationClickActionsMode } from "./useExplorationClickActionsMode";

const exploreFurtherMock = jest.fn();
const createCommentMock = jest.fn();
const sendToastMock = jest.fn();

jest.mock("metabase/api/exploration", () => ({
  useExploreFurtherMutation: () => [exploreFurtherMock],
}));

jest.mock("metabase/api/comment", () => ({
  useCreateCommentMutation: () => [createCommentMock],
}));

jest.mock("metabase/common/hooks", () => ({
  ...jest.requireActual("metabase/common/hooks"),
  useToast: () => [sendToastMock],
}));

jest.mock(
  "../components/ExplorationVisualization/ExplorationCommentEditor",
  () => ({
    ExplorationCommentEditor: ({
      handleAddComment,
      placeholder,
    }: {
      handleAddComment: (content: unknown) => void;
      placeholder?: string;
    }) => (
      <div>
        {placeholder && <span>{placeholder}</span>}
        <button
          type="button"
          onClick={() => handleAddComment(createMockDocumentContent())}
        >
          Submit comment
        </button>
      </div>
    ),
  }),
);

function makeClicked(overrides: Partial<ClickObject> = {}): ClickObject {
  return {
    value: 10,
    column: createMockColumn({ name: "count", source: "aggregation" }),
    dimensions: [
      {
        column: createMockColumn({
          name: "category",
          source: "breakout",
          field_ref: ["field", 1, null],
        }),
        value: "Gadget",
      },
    ],
    settings: {},
    cardId: 101,
    ...overrides,
  };
}

function getAddCommentPopover(
  actions: Array<{
    name: string;
    popover?: ComponentType<ClickActionPopoverProps>;
  }>,
) {
  return actions.find((item) => item.name === "add-comment")?.popover;
}

function renderMode(
  overrides: Partial<Parameters<typeof useExplorationClickActionsMode>[0]> = {},
) {
  const setCommentDrafts = jest.fn();
  const view = renderHook(
    ({ commentDrafts }) =>
      useExplorationClickActionsMode({
        explorationId: 42,
        pageId: 7,
        blockType: "metric",
        queryType: "default",
        commentDrafts,
        setCommentDrafts,
        ...overrides,
      }),
    {
      initialProps: {
        // Unjustified type cast. FIXME
        commentDrafts: {} as CommentDrafts,
      },
    },
  );
  return { ...view, setCommentDrafts };
}

describe("useExplorationClickActionsMode", () => {
  beforeEach(() => {
    exploreFurtherMock.mockReset();
    createCommentMock.mockReset();
    sendToastMock.mockReset();
    exploreFurtherMock.mockResolvedValue({ data: {} });
    createCommentMock.mockResolvedValue({ data: {} });
  });

  it("shows explore further before add comment for eligible clicks", () => {
    const { result } = renderMode();
    const actions = result.current.actionsForClick(makeClicked());

    expect(actions.map((action) => action.name)).toEqual([
      "explore-further",
      "add-comment",
    ]);
  });

  it("omits explore further for ineligible clicks but still offers add comment", () => {
    const { result } = renderMode({ blockType: "dimension" });
    const actions = result.current.actionsForClick(makeClicked());

    expect(actions.map((action) => action.name)).toEqual(["add-comment"]);
  });

  it("fires explore further with filters and closes the popover", async () => {
    const closePopover = jest.fn();
    const { result } = renderMode();
    // Unjustified type cast. FIXME
    const exploreAction = result.current
      .actionsForClick(makeClicked())
      .find((action) => action.name === "explore-further") as {
      onClick?: (props: { closePopover: () => void }) => void;
    };

    await act(async () => {
      // Unjustified type cast. FIXME
      exploreAction?.onClick?.({ closePopover } as any);
    });

    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Exploring further…" }),
    );
    expect(exploreFurtherMock).toHaveBeenCalledWith({
      id: 42,
      page_id: 7,
      explore_filters: [{ field_ref: ["field", 1, null], value: "Gadget" }],
    });
    expect(closePopover).toHaveBeenCalled();
  });

  it("shows an error toast when explore further fails", async () => {
    exploreFurtherMock.mockResolvedValue({ error: { status: 500 } });
    const { result } = renderMode();
    // Unjustified type cast. FIXME
    const exploreAction = result.current
      .actionsForClick(makeClicked())
      .find((action) => action.name === "explore-further") as {
      onClick?: (props: { closePopover: () => void }) => void;
    };

    await act(async () => {
      // Unjustified type cast. FIXME
      exploreAction?.onClick?.({ closePopover: jest.fn() } as any);
    });

    expect(sendToastMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: "Couldn't start a new exploration",
      }),
    );
  });

  it("creates a comment with highlighted context and closes on success", async () => {
    const onClose = jest.fn();
    const { result } = renderMode();
    const Popover = getAddCommentPopover(
      result.current.actionsForClick(makeClicked()),
    );
    if (!Popover) {
      throw new Error("expected add-comment popover");
    }

    render(
      // Unjustified type cast. FIXME
      <Popover {...({ onClose } as unknown as ClickActionPopoverProps)} />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Submit comment" }),
    );

    expect(createCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target_id: 42,
        child_target_id: "7",
        context: {
          highlighted: {
            cardId: 101,
            columnName: "count",
            dimensions: [{ columnName: "category", value: "Gadget" }],
          },
        },
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error toast when comment creation fails", async () => {
    createCommentMock.mockResolvedValue({ error: { status: 500 } });
    const onClose = jest.fn();
    const { result } = renderMode();
    const Popover = getAddCommentPopover(
      result.current.actionsForClick(makeClicked()),
    );
    if (!Popover) {
      throw new Error("expected add-comment popover");
    }

    render(
      // Unjustified type cast. FIXME
      <Popover {...({ onClose } as unknown as ClickActionPopoverProps)} />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Submit comment" }),
    );

    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to add comment" }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a stable mode identity when comment drafts change", () => {
    const { result, rerender } = renderMode();
    const initialMode = result.current;

    rerender({ commentDrafts: { "7": createMockDocumentContent() } });

    expect(result.current).toBe(initialMode);
  });
});
