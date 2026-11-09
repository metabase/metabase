import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";

import { act, renderWithProviders, screen, within } from "__support__/ui";

import { CommentEditor } from "./CommentEditor";

const CONTENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello world" }],
    },
  ],
};

function getEditor(): Editor {
  // tiptap keeps the editor instance on its root element
  const element = within(screen.getByTestId("comment-editor")).getByRole(
    "textbox",
  );
  if ("editor" in element && element.editor instanceof Editor) {
    return element.editor;
  }
  throw new Error("Comment editor instance not found");
}

function setup() {
  renderWithProviders(
    <CommentEditor data-testid="comment-editor" initialContent={CONTENT} />,
  );

  return {
    selectHello: () =>
      act(() => {
        getEditor().commands.setTextSelection({ from: 1, to: 6 });
      }),
  };
}

function findFormattingButton(name: string) {
  return screen.findByRole(
    "button",
    { name: `${name} icon` },
    { timeout: 2000 },
  );
}

describe("CommentEditor", () => {
  it("shows only the bold, italic, strikethrough and code buttons in the formatting menu, and applies bold", async () => {
    const { selectHello } = setup();

    selectHello();

    const boldButton = await findFormattingButton("text_bold");
    expect(await findFormattingButton("text_italic")).toBeInTheDocument();
    expect(await findFormattingButton("text_strike")).toBeInTheDocument();
    expect(await findFormattingButton("format_code")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /H1/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^list/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ordered_list/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(boldButton);

    const editorContent = screen.getByTestId("comment-editor");
    expect(
      within(editorContent).getByText("Hello", { selector: "strong" }),
    ).toBeInTheDocument();
  });
});
