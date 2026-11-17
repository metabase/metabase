import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { inlinePrompt, openInlinePromptAtEnd } from "./inline-prompt";

type SetupOpts = {
  doc: string;
};

function setup({ doc }: SetupOpts) {
  const container = document.createElement("span");
  const onChange = jest.fn();
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [inlinePrompt({ container, onChange })],
    }),
  });

  // Mirrors how CodeMirror handles typed text: input handlers first.
  const type = (text: string) => {
    const { from, to } = view.state.selection.main;
    const handlers = view.state.facet(EditorView.inputHandler);
    if (
      !handlers.some((handler) =>
        handler(view, from, to, text, () => view.state.update({})),
      )
    ) {
      view.dispatch(view.state.replaceSelection(text));
    }
  };

  // The line that holds the prompt: its own, or the line of code.
  const promptLineText = () => container.parentElement?.textContent ?? "";

  return { view, container, onChange, type, promptLineText };
}

describe("inlinePrompt", () => {
  it("opens on a line of its own under the code from the button, leaving the code as it is", () => {
    const { view, container, onChange, promptLineText } = setup({
      doc: "[Total] + [Subtotal]",
    });

    openInlinePromptAtEnd(view);

    expect(view.state.doc.toString()).toBe("[Total] + [Subtotal]");
    expect(view.contentDOM).toContainElement(container);
    expect(promptLineText()).toBe("");
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("opens inline where ? is typed", () => {
    const { view, container, type, promptLineText } = setup({
      doc: "[Total] + ",
    });

    type("?");

    expect(view.contentDOM).toContainElement(container);
    expect(promptLineText()).toContain("[Total]");
  });

  it("opens inline in an empty editor from the button", () => {
    const { view, container, promptLineText } = setup({ doc: "" });

    openInlinePromptAtEnd(view);

    expect(view.contentDOM).toContainElement(container);
    expect(container.parentElement?.parentElement).toBe(view.contentDOM);
    expect(promptLineText()).toBe("");
  });
});
