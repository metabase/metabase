import {
  closeBrackets,
  completionStatus,
  currentCompletions,
  hasNextSnippetField,
  hasPrevSnippetField,
} from "@codemirror/autocomplete";
import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { expressionEditing, straightenQuotes } from "./editing";
import { functionArgumentPlaceholders } from "./function-arguments";
import { columnsForExpressionMode } from "./mode";
import { suggestions } from "./suggestions";
import type { ExpressionSuggestion } from "./suggestions/types";

type SetupOpts = {
  doc?: string;
  cursor?: number;
};

function setup({ doc = "", cursor = doc.length }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const stageIndex = -1;
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [
        history(),
        expressionEditing(),
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
    for (const char of text) {
      const { from, to } = view.state.selection.main;
      const handlers = view.state.facet(EditorView.inputHandler);
      const isHandled = handlers.some((handler) =>
        handler(view, from, to, char, () => view.state.update({})),
      );
      if (!isHandled) {
        view.dispatch(
          view.state.update(view.state.replaceSelection(char), {
            userEvent: "input.type",
          }),
        );
      }
    }
  };

  const press = (key: string) =>
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );

  const selectedText = () => {
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  };

  const text = () => view.state.doc.toString();

  // The suggestions are worked out asynchronously, and CodeMirror ignores a
  // pick right after the list changes, like a person who reads it first.
  const waitForSuggestions = () =>
    new Promise((resolve) => setTimeout(resolve, 300));

  const suggestedLabels = () =>
    currentCompletions(view.state).map((option) => option.label);

  const suggestedColumns = () =>
    // The column source gives expression suggestions; CodeMirror's API
    // returns them as its own completion type.
    (currentCompletions(view.state) as readonly ExpressionSuggestion[])
      .map((option) => option.column)
      .filter((column) => column != null);

  const isSnippetActive = () =>
    hasNextSnippetField(view.state) || hasPrevSnippetField(view.state);

  return {
    view,
    type,
    press,
    text,
    selectedText,
    waitForSuggestions,
    suggestedLabels,
    suggestedColumns,
    isSnippetActive,
  };
}

describe("placeholders", () => {
  it("leaves out optional values", () => {
    const { type, text } = setup({ doc: "week" });
    type("(");
    expect(text()).toBe("week(column)");
  });

  it("moves through the values with Tab and Enter, picking the highlighted column, then past the parenthesis", async () => {
    const { type, press, text, selectedText, waitForSuggestions, ...rest } =
      setup({ doc: "datetimeDiff" });

    type("(");
    await waitForSuggestions();
    expect(selectedText()).toBe("datetime1");
    expect(rest.suggestedColumns().every((c) => Lib.isTemporal(c))).toBe(true);

    press("Tab");
    await waitForSuggestions();
    expect(text()).toMatch(/^datetimeDiff\(\[[^\]]+\], datetime2, unit\)$/);
    expect(selectedText()).toBe("datetime2");

    press("Enter");
    await waitForSuggestions();
    expect(selectedText()).toBe("unit");
    expect(rest.suggestedLabels()).toContain('"day"');
    expect(rest.suggestedColumns()).toEqual([]);

    // Pick "day" and go past the closing parenthesis.
    const dayIndex = rest.suggestedLabels().indexOf('"day"');
    for (let i = 0; i < dayIndex; i++) {
      press("ArrowDown");
    }
    await waitForSuggestions();
    press("Enter");
    expect(text()).toMatch(/, "day"\)$/);
    expect(rest.view.state.selection.main.head).toBe(text().length);
    expect(rest.isSnippetActive()).toBe(false);
  });

  it("moves on with Tab when the list is closed, keeping the placeholder", () => {
    const { view, type, press, selectedText } = setup({ doc: "datetimeDiff" });
    type("(");
    expect(completionStatus(view.state)).not.toBe("active");
    press("Tab");
    expect(selectedText()).toBe("datetime2");
  });

  it("moves to the next value on a comma", () => {
    const { type, text, selectedText } = setup({ doc: "datetimeDiff" });
    type("(");
    type(",");
    expect(text()).toBe("datetimeDiff(datetime1, datetime2, unit)");
    expect(selectedText()).toBe("datetime2");
  });

  it("adds a value on a comma after the last value of a function that takes more", () => {
    const { type, text, selectedText } = setup({ doc: "concat" });
    type("(");
    type(",");
    type(",");
    expect(text()).toBe("concat(value1, value2, value3)");
    expect(selectedText()).toBe("value3");
  });

  it("adds the optional value back on a comma", async () => {
    const { type, text, selectedText, waitForSuggestions, suggestedLabels } =
      setup({ doc: "week([Created At])", cursor: 17 });
    type(",");
    expect(text()).toBe("week([Created At], mode)");
    expect(selectedText()).toBe("mode");
    await waitForSuggestions();
    expect(suggestedLabels()).toEqual(['"iso"', '"us"', '"instance"']);
  });

  it("adds the case option of contains() on a comma", () => {
    const { type, text, selectedText } = setup({ doc: "contains" });
    type("(");
    type(",");
    type(",");
    expect(text()).toBe('contains(string1, string2, "case-insensitive")');
    expect(selectedText()).toBe('"case-insensitive"');
  });

  it("types a plain comma after the last value of a function that takes no more", () => {
    const { type, text } = setup({ doc: "length([Total])", cursor: 14 });
    type(",");
    expect(text()).toBe("length([Total],)");
  });

  it("makes inserting the placeholders its own undo step", () => {
    const { view, type, text } = setup();
    type("length");
    type("(");
    undo(view);
    expect(text()).toBe("length");
  });
});

describe("allowed text values", () => {
  it("offers the units while typing one", async () => {
    const { type, waitForSuggestions, suggestedLabels } = setup({
      doc: "datetimeDiff([Created At], [Created At], ",
    });
    type('"mo');
    await waitForSuggestions();
    expect(suggestedLabels()).toContain('"month"');
  });
});

describe("typing over closing characters", () => {
  it.each([
    ["a parenthesis", "length([Total])", 14, ")"],
    ["a column's bracket", "length([Total])", 13, "]"],
    ["a text value's quote", 'concat("Done")', 12, '"'],
  ])("moves past %s", (_description, doc, cursor, char) => {
    const { view, type, text } = setup({ doc, cursor });
    type(char);
    expect(text()).toBe(doc);
    expect(view.state.selection.main.head).toBe(cursor + 1);
  });

  it("adds a parenthesis that's missing", () => {
    const { type, text } = setup({ doc: "round(abs([Total])", cursor: 17 });
    type(")");
    expect(text()).toBe("round(abs([Total]))");
  });
});

describe("quotes", () => {
  it("types a straight quote for a curly one", () => {
    const { type, text } = setup({ doc: "concat(" });
    type("“");
    expect(text()).toBe('concat(""');
  });

  it.each([
    ["“Done”", '"Done"'],
    ["‘Done’", '"Done"'],
    ["“Don’t”", '"Don’t"'],
  ])("straightens pasted %s", (pasted, expected) => {
    expect(straightenQuotes(pasted)).toBe(expected);
  });
});
