import {
  closeBrackets,
  completionStatus,
  currentCompletions,
  nextSnippetField,
} from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { functionArgumentPlaceholders } from "./function-arguments";
import { columnsForExpressionMode } from "./mode";
import { suggestions } from "./suggestions";
import type { ExpressionSuggestion } from "./suggestions/types";

type SetupOpts = {
  doc: string;
  cursor?: number;
};

function setup({ doc, cursor = doc.length }: SetupOpts) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const stageIndex = -1;
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [
        functionArgumentPlaceholders(),
        closeBrackets(),
        suggestions({
          query,
          stageIndex,
          expressionMode: "expression",
          database: createSampleDatabase(),
          availableColumns: columnsForExpressionMode({
            query,
            stageIndex,
            expressionMode: "expression",
          }),
        }),
      ],
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

  // The suggestions are worked out asynchronously.
  const waitForSuggestions = () =>
    new Promise((resolve) => setTimeout(resolve, 100));

  const suggestedColumns = () =>
    // The column source gives expression suggestions; CodeMirror's API
    // returns them as its own completion type.
    (currentCompletions(view.state) as readonly ExpressionSuggestion[])
      .map((option) => option.column)
      .filter((column) => column != null);

  return { view, type, selectedText, waitForSuggestions, suggestedColumns };
}

describe("functionArgumentPlaceholders", () => {
  it("adds the placeholders, selects the first and lists the columns that fit it", async () => {
    const { view, type, selectedText, waitForSuggestions, suggestedColumns } =
      setup({ doc: "length" });

    type("(");
    await waitForSuggestions();

    expect(view.state.doc.toString()).toBe("length(value)");
    expect(selectedText()).toBe("value");
    expect(completionStatus(view.state)).toBe("active");
    const columns = suggestedColumns();
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.every((column) => Lib.isStringOrStringLike(column))).toBe(
      true,
    );
  });

  it("lists the columns that fit the next placeholder after Tab", async () => {
    const { view, type, selectedText, waitForSuggestions, suggestedColumns } =
      setup({ doc: "datetimeAdd" });

    type("(");
    await waitForSuggestions();
    nextSnippetField(view);
    await waitForSuggestions();

    expect(selectedText()).toBe("amount");
    expect(completionStatus(view.state)).toBe("active");
    // The amount must be typed: it lists no columns, only a note saying so.
    expect(suggestedColumns()).toEqual([]);
    expect(
      currentCompletions(view.state).map((option) => option.displayLabel),
    ).toEqual(["This value can't be a column. Type it instead."]);
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
