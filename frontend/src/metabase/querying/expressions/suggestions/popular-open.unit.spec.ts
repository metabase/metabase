import { completionStatus, currentCompletions } from "@codemirror/autocomplete";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { columnsForExpressionMode } from "../mode";

import { suggestions } from "./suggest";

type SetupOpts = {
  isReadOnly?: boolean;
  /** False: the editor opens before the database has loaded. */
  hasDatabase?: boolean;
};

function setup({ isReadOnly = false, hasDatabase = true }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const stageIndex = -1;
  const getSuggestions = (database: Database | undefined) =>
    suggestions({
      query,
      stageIndex,
      expressionMode: "expression",
      database,
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
      }),
      popularFunctions: ["case", "coalesce", "concat"],
    });

  const readOnly = new Compartment();
  const suggestionsCompartment = new Compartment();
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: "",
      extensions: [
        readOnly.of(EditorState.readOnly.of(isReadOnly)),
        suggestionsCompartment.of(
          getSuggestions(hasDatabase ? createSampleDatabase() : undefined),
        ),
      ],
    }),
  });

  const makeEditable = () =>
    view.dispatch({
      effects: readOnly.reconfigure(EditorState.readOnly.of(false)),
    });

  // Like the editor, which recreates its extensions once the database loads.
  const loadDatabase = () =>
    view.dispatch({
      effects: suggestionsCompartment.reconfigure(
        getSuggestions(createSampleDatabase()),
      ),
    });

  // The list opens after the update that triggers it, and fills in after
  // that.
  const waitForSuggestions = () =>
    new Promise((resolve) => setTimeout(resolve, 100));

  const suggestedNames = () =>
    currentCompletions(view.state).map((option) => option.displayLabel);

  return {
    view,
    makeEditable,
    loadDatabase,
    waitForSuggestions,
    suggestedNames,
  };
}

describe("popular functions in an empty editor", () => {
  it("shows them as soon as the editor has focus", async () => {
    const { view, waitForSuggestions, suggestedNames } = setup();

    view.focus();
    await waitForSuggestions();

    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedNames()).toEqual(["case", "coalesce", "concat"]);
  });

  it("shows them once an editor that got focus while read-only can be edited", async () => {
    const { view, makeEditable, waitForSuggestions, suggestedNames } = setup({
      isReadOnly: true,
    });

    view.focus();
    await waitForSuggestions();
    makeEditable();
    await waitForSuggestions();

    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedNames()).toEqual(["case", "coalesce", "concat"]);
  });

  it("shows them once the database loads, when the editor got focus before", async () => {
    const { view, loadDatabase, waitForSuggestions, suggestedNames } = setup({
      hasDatabase: false,
    });

    view.focus();
    await waitForSuggestions();
    loadDatabase();
    await waitForSuggestions();

    expect(completionStatus(view.state)).toBe("active");
    expect(suggestedNames()).toEqual(["case", "coalesce", "concat"]);
  });
});
