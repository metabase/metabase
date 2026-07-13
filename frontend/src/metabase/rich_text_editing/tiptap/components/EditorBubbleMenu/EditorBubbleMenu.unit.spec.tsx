import userEvent from "@testing-library/user-event";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";

import { EditorBubbleMenu } from "./EditorBubbleMenu";

function setup() {
  let editor: Editor | null = null;

  function TestEditor() {
    const instance = useEditor({
      extensions: [StarterKit],
      content: "<p>Hello world</p>",
      immediatelyRender: true,
    });

    editor = instance;

    if (!instance) {
      return null;
    }

    return (
      <>
        <EditorContent editor={instance} />
        <EditorBubbleMenu editor={instance} disallowedNodes={[]} />
      </>
    );
  }

  renderWithProviders(<TestEditor />);

  return {
    selectText: () =>
      act(() => {
        editor?.commands.setTextSelection({ from: 1, to: 6 });
      }),
    deleteText: () =>
      act(() => {
        editor?.chain().selectAll().deleteSelection().run();
      }),
    restoreText: () =>
      act(() => {
        editor?.commands.setContent("<p>Hello world</p>");
      }),
  };
}

function findBoldButton() {
  return screen.findByRole(
    "button",
    { name: "text_bold icon" },
    { timeout: 2000 },
  );
}

describe("EditorBubbleMenu", () => {
  it("should not leave an orphaned tooltip in the DOM after the menu hides (metabase#76365)", async () => {
    const { selectText, deleteText } = setup();

    selectText();
    await userEvent.hover(await findBoldButton());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Bold");
    deleteText();

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("should still show the bubble menu again after it has been hidden", async () => {
    const { selectText, deleteText, restoreText } = setup();

    selectText();
    expect(await findBoldButton()).toBeInTheDocument();

    deleteText();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "text_bold icon" }),
      ).not.toBeInTheDocument();
    });

    restoreText();
    selectText();
    expect(await findBoldButton()).toBeInTheDocument();
  });
});
