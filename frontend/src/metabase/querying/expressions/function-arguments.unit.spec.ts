import { closeBrackets } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { functionArgumentPlaceholders } from "./function-arguments";

type SetupOpts = {
  doc: string;
  cursor?: number;
};

function setup({ doc, cursor = doc.length }: SetupOpts) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [functionArgumentPlaceholders(), closeBrackets()],
    }),
  });

  // Mirrors how CodeMirror handles typed text: input handlers in order of
  // precedence, then a plain insert if none of them took it.
  const type = (text: string) => {
    const { from, to } = view.state.selection.main;
    const handlers = view.state.facet(EditorView.inputHandler);
    const isHandled = handlers.some((handler) =>
      handler(view, from, to, text, () => view.state.update({})),
    );
    if (!isHandled) {
      view.dispatch(view.state.replaceSelection(text));
    }
  };

  const selectedText = () => {
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  };

  return { view, type, selectedText };
}

describe("functionArgumentPlaceholders", () => {
  it("adds the argument placeholders after a function name", () => {
    const { view, type, selectedText } = setup({ doc: "case" });
    type("(");
    expect(view.state.doc.toString()).toBe("case(condition, output)");
    expect(selectedText()).toBe("condition");
  });

  it("uses the function's own spelling", () => {
    const { view, type } = setup({ doc: "1 + coalesce" });
    type("(");
    expect(view.state.doc.toString()).toBe("1 + coalesce(value1, value2)");
  });

  it("works before a closing parenthesis or comma", () => {
    const { view, type } = setup({ doc: "concat(upper, [B])", cursor: 12 });
    type("(");
    expect(view.state.doc.toString()).toBe("concat(upper(value), [B])");
  });

  it("puts the cursor after the parentheses of a function without arguments", () => {
    const { view, type } = setup({ doc: "now" });
    type("(");
    expect(view.state.doc.toString()).toBe("now()");
    expect(view.state.selection.main.head).toBe(5);
  });

  it.each([
    ["an unknown name", "foo", "foo()"],
    ["NOT, which is an operator", "NOT ", "NOT ()"],
    ["text in quotes", '"case', '"case()'],
  ])("only closes the bracket after %s", (_description, doc, expected) => {
    const { view, type } = setup({ doc });
    type("(");
    expect(view.state.doc.toString()).toBe(expected);
  });

  it("leaves the text alone when a column follows the cursor", () => {
    const { view, type } = setup({ doc: "upper[Name]", cursor: 5 });
    type("(");
    expect(view.state.doc.toString()).toBe("upper([Name]");
  });
});
