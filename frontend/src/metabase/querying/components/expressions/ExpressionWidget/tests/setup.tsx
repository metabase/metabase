/**
 * A harness that drives the real CodeMirror editor inside `ExpressionWidget`.
 *
 * The global Jest setup replaces `@uiw/react-codemirror` with a `<textarea>`,
 * so every spec that uses this harness must start with
 * `jest.unmock("@uiw/react-codemirror");`.
 *
 * jsdom has no layout, so typing through the DOM garbles the document.
 * Instead, text goes through CodeMirror's input handlers (the path a real
 * keystroke takes, including bracket closing and completion activation) and
 * keys go through its keymaps.
 */
import {
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { act, fireEvent } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DEBOUNCE_VALIDATION_MS } from "../../Editor/constants";
import { ExpressionWidget } from "../ExpressionWidget";

// CodeMirror ignores keys that accept a completion for this long after the
// completion list opens (`interactionDelay` in @codemirror/autocomplete).
const COMPLETION_INTERACTION_DELAY_MS = 75;

// Long enough for CodeMirror to query and render completions after a change.
const COMPLETION_SETTLE_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs an editor interaction inside `act` and lets the completion updates it
 * schedules on timers land inside the same `act`.
 */
async function interact(fn: () => void) {
  await act(async () => {
    fn();
    await sleep(COMPLETION_SETTLE_MS);
  });
  await waitFor(() =>
    expect(completionStatus(getEditorView().state)).not.toBe("pending"),
  );
}

export type SetupOpts = {
  query?: Lib.Query;
  stageIndex?: number;
  expressionMode?: Lib.ExpressionMode;
  expressionIndex?: number;
  clause?: Lib.Expressionable;
  name?: string;
  withName?: boolean;
  database?: Database;
};

export function createProductsQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
  });
}

/**
 * Renders `ExpressionWidget` the way the notebook does: custom columns get
 * `expressionableColumns`, aggregations get `aggregableColumns`. Resolves once
 * the editor accepts input and has focus.
 */
export async function setup({
  query = createProductsQuery(),
  stageIndex = -1,
  expressionMode = "expression",
  expressionIndex,
  clause,
  name,
  withName = true,
  database = createSampleDatabase(),
}: SetupOpts = {}) {
  const availableColumns =
    expressionMode === "aggregation"
      ? Lib.aggregableColumns(query, stageIndex, expressionIndex)
      : Lib.expressionableColumns(query, stageIndex, expressionIndex);
  const onChangeClause = jest.fn<void, [string, Lib.ExpressionClause]>();
  const onClose = jest.fn<void, []>();

  setupDatabaseEndpoints(database);

  renderWithProviders(
    <ExpressionWidget
      query={query}
      stageIndex={stageIndex}
      expressionMode={expressionMode}
      expressionIndex={expressionIndex}
      availableColumns={availableColumns}
      clause={clause}
      name={name}
      withName={withName}
      reportTimezone="UTC"
      onChangeClause={onChangeClause}
      onClose={onClose}
    />,
  );

  // The database features decide which functions the editor offers, so wait
  // for the database as the app does before anyone types.
  await waitFor(() =>
    expect(
      fetchMock.callHistory.called(`path:/api/database/${database.id}`),
    ).toBe(true),
  );
  await act(() => fetchMock.callHistory.flush(true));
  await waitFor(() =>
    expect(getEditorContent()).toHaveAttribute("contenteditable", "true"),
  );
  // Suggestions, help text and validation depend on the database features, so
  // let the database load before the test types anything.
  await act(async () => {
    await fetchMock.callHistory.flush(true);
  });
  await act(async () => getEditorView().focus());

  return { onChangeClause, onClose };
}

function getEditorContent(): HTMLElement {
  return checkNotNull(
    screen
      .getByTestId("expression-editor")
      .querySelector<HTMLElement>(".cm-content"),
  );
}

export function getEditorView(): EditorView {
  return checkNotNull(EditorView.findFromDOM(getEditorContent()));
}

export function getEditorValue(): string {
  return getEditorView().state.doc.toString();
}

/** Types each character as a keystroke would. */
export async function typeText(text: string) {
  const view = getEditorView();
  await interact(() => {
    for (const char of text) {
      const { from, to } = view.state.selection.main;
      const insert = () =>
        view.state.update({
          changes: { from, to, insert: char },
          selection: { anchor: from + char.length },
          userEvent: "input.type",
        });
      const handlers = view.state.facet(EditorView.inputHandler);
      const isHandled = handlers.some((handler) =>
        handler(view, from, to, char, insert),
      );
      if (!isHandled) {
        view.dispatch(insert());
      }
    }
  });
}

/**
 * Presses a key, e.g. `Enter`, `Tab` or `ArrowLeft`, in the editor. Resolves
 * with the result of the last keydown: `false` when the editor handled the key
 * and prevented its default action (for Tab, moving focus out of the editor).
 *
 * `modKey` holds CodeMirror's `Mod`, which is Ctrl outside macOS (jsdom).
 */
export async function pressKey(
  key: string,
  {
    shiftKey = false,
    modKey = false,
    times = 1,
  }: { shiftKey?: boolean; modKey?: boolean; times?: number } = {},
): Promise<boolean> {
  let isNotPrevented = true;
  for (let index = 0; index < times; index++) {
    await interact(() => {
      isNotPrevented = fireEvent.keyDown(getEditorContent(), {
        key,
        shiftKey,
        ctrlKey: modKey,
      });
    });
  }
  return isNotPrevented;
}

/** Replaces the selection with pasted text. */
export async function pasteText(text: string) {
  const view = getEditorView();
  await interact(() => {
    view.dispatch(view.state.replaceSelection(text), {
      userEvent: "input.paste",
    });
  });
}

export async function setCursorPosition(position: number) {
  const view = getEditorView();
  await interact(() => {
    view.dispatch({ selection: { anchor: position } });
  });
}

export async function selectRange(from: number, to: number) {
  const view = getEditorView();
  await interact(() => {
    view.dispatch({ selection: { anchor: from, head: to } });
  });
}

/**
 * Focuses the editor. CodeMirror reports focus changes on a timer, so this
 * waits for that update too.
 */
export async function focusEditor() {
  await interact(() => {
    getEditorView().focus();
  });
}

/** Moves focus out of the editor, as clicking elsewhere in the widget does. */
export async function blurEditor() {
  await interact(() => {
    getEditorView().contentDOM.blur();
  });
}

/**
 * Waits until the completion list is open, rendered and ready to accept a key.
 * Resolves with the labels of the offered options.
 */
export async function waitForCompletions(): Promise<string[]> {
  await waitFor(() =>
    expect(completionStatus(getEditorView().state)).toBe("active"),
  );
  await waitFor(() =>
    expect(
      screen.getByTestId("custom-expression-editor-suggestions"),
    ).toBeInTheDocument(),
  );
  await act(() => sleep(COMPLETION_INTERACTION_DELAY_MS));
  return getCompletionLabels();
}

/** Clicks the completion option with the given label in the suggestion list. */
export async function clickCompletion(label: string) {
  const option = within(
    screen.getByTestId("custom-expression-editor-suggestions"),
  )
    .getAllByRole("option")
    .find((element) => element.textContent === label);
  await interact(() => {
    fireEvent.mouseDown(checkNotNull(option));
  });
}

/** The labels of the completion options CodeMirror offers right now. */
export function getCompletionLabels(): string[] {
  return currentCompletions(getEditorView().state).map(
    (completion) => completion.displayLabel ?? completion.label,
  );
}

export function getSelectedCompletionLabel(): string | undefined {
  const state = getEditorView().state;
  const index = selectedCompletionIndex(state);
  if (index == null) {
    return undefined;
  }
  const completion = currentCompletions(state)[index];
  return completion?.displayLabel ?? completion?.label;
}

/** Waits for the help text example, which is highlighted asynchronously. */
export async function waitForHelpTextExample() {
  await waitFor(() =>
    expect(screen.getByTestId("helptext-example")).not.toBeEmptyDOMElement(),
  );
}

export function queryHelpText() {
  return screen.queryByTestId("expression-helper");
}

/**
 * Waits until the editor has validated the current source, so an error that
 * should not show would be on screen by now.
 */
export async function waitForValidationDebounce() {
  await act(() => sleep(DEBOUNCE_VALIDATION_MS + COMPLETION_SETTLE_MS));
}
