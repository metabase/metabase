import userEvent from "@testing-library/user-event";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { CustomStarterKit } from "metabase/rich_text_editing/tiptap/extensions/CustomStarterKit/CustomStarterKit";

import { EditorBubbleMenu } from "./EditorBubbleMenu";

function setup() {
  let editor: Editor | null = null;

  function TestEditor() {
    const instance = useEditor({
      extensions: [CustomStarterKit],
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
    // Block nodes carry generated `_id` attributes, and the trailing-node
    // extension appends an empty paragraph after them.
    getHTML: () =>
      editor
        ?.getHTML()
        .replace(/ _id="[^"]*"/g, "")
        .replace(/<p><\/p>$/, ""),
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

  it.each([
    {
      buttonName: "text_bold icon",
      formatted: "<p><strong>Hello</strong> world</p>",
    },
    {
      buttonName: "text_italic icon",
      formatted: "<p><em>Hello</em> world</p>",
    },
    { buttonName: "text_strike icon", formatted: "<p><s>Hello</s> world</p>" },
    {
      buttonName: "format_code icon",
      formatted: "<p><code>Hello</code> world</p>",
    },
    { buttonName: "H1", formatted: "<h1>Hello world</h1>" },
    { buttonName: "H2", formatted: "<h2>Hello world</h2>" },
    {
      buttonName: "list icon",
      formatted: "<ul><li><p>Hello world</p></li></ul>",
    },
    {
      buttonName: "ordered_list icon",
      formatted: "<ol><li><p>Hello world</p></li></ol>",
    },
    {
      buttonName: "quote icon",
      formatted: "<blockquote><p>Hello world</p></blockquote>",
    },
  ])(
    "should toggle formatting on and off with the $buttonName button",
    async ({ buttonName, formatted }) => {
      const { getHTML, selectText } = setup();

      selectText();
      const button = await screen.findByRole(
        "button",
        { name: buttonName },
        { timeout: 2000 },
      );

      await userEvent.click(button);
      await waitFor(() => expect(getHTML()).toBe(formatted));

      await userEvent.click(button);
      await waitFor(() => expect(getHTML()).toBe("<p>Hello world</p>"));
    },
  );

  // The document editor hides the menu inside a code block, so the button
  // only applies a code block.
  it("should apply a code block with the code_block button", async () => {
    const { getHTML, selectText } = setup();

    selectText();
    await userEvent.click(
      await screen.findByRole(
        "button",
        { name: "code_block icon" },
        { timeout: 2000 },
      ),
    );

    await waitFor(() =>
      expect(getHTML()).toBe("<pre><code>Hello world</code></pre>"),
    );
  });
});
