import { completionStatus, currentCompletions } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { columnsForExpressionMode } from "./mode";
import { suggestions } from "./suggestions";
import type { ExpressionSuggestion } from "./suggestions/types";
import { expressionTemplates, insertExpressionTemplate } from "./templates";

type SetupOpts = {
  doc?: string;
};

function setup({ doc = "" }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const stageIndex = -1;
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        expressionTemplates({ activeClassName: "active" }),
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
          popularFunctions: ["case", "coalesce", "concat"],
        }),
      ],
    }),
  });
  view.focus();

  // The suggestions are worked out asynchronously.
  const waitForSuggestions = () =>
    new Promise((resolve) => setTimeout(resolve, 100));

  const selectedText = () => {
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  };

  const suggestedColumns = () =>
    // The column source gives expression suggestions; CodeMirror's API
    // returns them as its own completion type.
    (currentCompletions(view.state) as readonly ExpressionSuggestion[])
      .map((option) => option.column)
      .filter((column) => column != null);

  return { view, waitForSuggestions, selectedText, suggestedColumns };
}

const HIGHER_OF_TWO = "case([Number 1] > [Number 2], [Number 1], [Number 2])";

describe("insertExpressionTemplate", () => {
  it("lists the columns for the first blank when the editor was empty and showed its suggestions", async () => {
    const { view, waitForSuggestions, selectedText, suggestedColumns } =
      setup();
    await waitForSuggestions();
    expect(completionStatus(view.state)).toBe("active");

    insertExpressionTemplate(view, HIGHER_OF_TWO);
    await waitForSuggestions();

    expect(view.state.doc.toString()).toBe(HIGHER_OF_TWO);
    expect(selectedText()).toBe("[Number 1]");
    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedColumns().length).toBeGreaterThan(0);
  });

  it("lists the columns for the first blank after other text", async () => {
    const { view, waitForSuggestions, selectedText, suggestedColumns } = setup({
      doc: "1 + ",
    });

    insertExpressionTemplate(view, "[Number 1] * [Number 2]");
    await waitForSuggestions();

    expect(selectedText()).toBe("[Number 1]");
    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedColumns().length).toBeGreaterThan(0);
  });

  it.each([
    ["[Text]", "length([Text])", Lib.isStringOrStringLike],
    ["[Number]", "abs([Number]) + 1", Lib.isNumeric],
    ["[Date 1]", "[Date 1] > [Date 2]", Lib.isTemporal],
  ])(
    "lists only the columns of the type that %s names",
    async (_blank, code, isOfType) => {
      const { view, waitForSuggestions, suggestedColumns } = setup();

      insertExpressionTemplate(view, code);
      await waitForSuggestions();

      const columns = suggestedColumns();
      expect(columns.length).toBeGreaterThan(0);
      expect(columns.every((column) => isOfType(column))).toBe(true);
    },
  );

  it("lists every column for [Column]", async () => {
    const { view, waitForSuggestions, suggestedColumns } = setup();

    insertExpressionTemplate(view, "notNull([Column])");
    await waitForSuggestions();

    const columns = suggestedColumns();
    expect(columns.some((column) => Lib.isTemporal(column))).toBe(true);
    expect(columns.some((column) => Lib.isStringOrStringLike(column))).toBe(
      true,
    );
  });
});
