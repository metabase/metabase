import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { ExplorationCommentEditor } from "./ExplorationCommentEditor";

const mockCommentContent = createMockDocumentContent({
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Draft comment" }],
    },
  ],
});

jest.mock("metabase/comments/components", () => ({
  CommentEditor: ({
    initialContent,
    placeholder,
    onChange,
    onSubmit,
  }: {
    initialContent?: unknown;
    placeholder?: string;
    onChange?: (content: unknown) => void;
    onSubmit?: (content: unknown) => void;
  }) => (
    <div>
      {placeholder && <span>{placeholder}</span>}
      <span data-testid="initial-content">
        {JSON.stringify(initialContent)}
      </span>
      <button type="button" onClick={() => onChange?.(mockCommentContent)}>
        Change draft
      </button>
      <button type="button" onClick={() => onSubmit?.(mockCommentContent)}>
        Submit comment
      </button>
    </div>
  ),
}));

describe("ExplorationCommentEditor", () => {
  it("persists drafts per page id", async () => {
    const setCommentDrafts = jest.fn();

    renderWithProviders(
      <ExplorationCommentEditor
        commentDrafts={{}}
        setCommentDrafts={setCommentDrafts}
        pageId="page-1"
        handleAddComment={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Change draft" }));

    expect(setCommentDrafts).toHaveBeenCalled();
    const updater = setCommentDrafts.mock.calls[0][0];
    expect(updater({})).toEqual({ "page-1": mockCommentContent });
  });

  it("restores the saved draft for the current page", () => {
    renderWithProviders(
      <ExplorationCommentEditor
        commentDrafts={{ "page-1": mockCommentContent }}
        setCommentDrafts={jest.fn()}
        pageId="page-1"
        handleAddComment={jest.fn()}
      />,
    );

    expect(screen.getByTestId("initial-content")).toHaveTextContent(
      /Draft comment/,
    );
  });

  it("forwards submit to handleAddComment and supports a custom placeholder", async () => {
    const handleAddComment = jest.fn();

    renderWithProviders(
      <ExplorationCommentEditor
        commentDrafts={{}}
        setCommentDrafts={jest.fn()}
        pageId="page-1"
        handleAddComment={handleAddComment}
        placeholder="Comment on this…"
      />,
    );

    expect(screen.getByText("Comment on this…")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Submit comment" }),
    );
    expect(handleAddComment).toHaveBeenCalledWith(mockCommentContent);
  });

  it("stops mouse and touch propagation so mention menus do not close the popover", () => {
    const parentMouseDown = jest.fn();
    const parentTouchStart = jest.fn();

    renderWithProviders(
      <div onMouseDown={parentMouseDown} onTouchStart={parentTouchStart}>
        <ExplorationCommentEditor
          commentDrafts={{}}
          setCommentDrafts={jest.fn()}
          pageId="page-1"
          handleAddComment={jest.fn()}
        />
      </div>,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Change draft" }), {
      bubbles: true,
    });
    fireEvent.touchStart(screen.getByRole("button", { name: "Change draft" }), {
      bubbles: true,
    });

    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentTouchStart).not.toHaveBeenCalled();
  });
});
