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

const HIGHER_OF_TWO = "case([Digital] > [Analog], [Digital], [Analog])";

describe("insertExpressionTemplate", () => {
  it("lists the columns for the first blank when the editor was empty and showed its suggestions", async () => {
    const { view, waitForSuggestions, selectedText, suggestedColumns } =
      setup();
    await waitForSuggestions();
    expect(completionStatus(view.state)).toBe("active");

    insertExpressionTemplate(view, HIGHER_OF_TWO);
    await waitForSuggestions();

    expect(view.state.doc.toString()).toBe(HIGHER_OF_TWO);
    expect(selectedText()).toBe("[Digital]");
    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedColumns().length).toBeGreaterThan(0);
  });

  it("lists the columns for the first blank after other text", async () => {
    const { view, waitForSuggestions, selectedText, suggestedColumns } = setup({
      doc: "1 + ",
    });

    insertExpressionTemplate(view, "[Price] * [Quantity]");
    await waitForSuggestions();

    expect(selectedText()).toBe("[Price]");
    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedColumns().length).toBeGreaterThan(0);
  });
});
