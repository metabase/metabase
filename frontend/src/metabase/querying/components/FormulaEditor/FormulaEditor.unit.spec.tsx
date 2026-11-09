import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { format } from "metabase/querying/expressions";
import { defer } from "metabase/utils/promise";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";

import { FormulaEditor } from "./FormulaEditor";
import type { FormulaEditorProps, NamedExpression } from "./types";

jest.unmock("@uiw/react-codemirror");

type SetupOpts = Partial<
  Pick<
    FormulaEditorProps,
    "initialSource" | "initialName" | "initialClause" | "onEditorCreate"
  >
>;

async function setup({ onEditorCreate: onCreate, ...options }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const onSubmit = jest.fn<void, [NamedExpression]>();
  const onCancel = jest.fn<void, []>();
  const created = defer<EditorView>();
  renderWithProviders(
    <FormulaEditor
      query={query}
      stageIndex={-1}
      database={SAMPLE_DATABASE}
      expressionMode="expression"
      submitLabel="Add column"
      onSubmit={onSubmit}
      onCancel={onCancel}
      onEditorCreate={(view) => {
        onCreate?.(view);
        created.resolve(view);
      }}
      {...options}
    />,
  );
  const view = await created.promise;
  return { view, query, onSubmit, onCancel };
}

async function replaceFormula(view: EditorView, source: string) {
  await act(async () => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
      selection: { anchor: source.length },
      userEvent: "input.type",
    });
  });
}

async function openCompletion(
  view: EditorView,
  anchor = view.state.doc.length,
) {
  await act(async () => {
    view.dispatch({ selection: { anchor } });
    startCompletion(view);
  });
  await waitFor(() => expect(completionStatus(view.state)).toBe("active"));
  await act(async () => jest.advanceTimersByTime(100));
}

describe("FormulaEditor", () => {
  it("focuses the editor and disables committing an empty formula", async () => {
    const { view } = await setup();
    expect(view.hasFocus).toBe(true);
    expect(screen.getByRole("textbox", { name: "Formula" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
  });

  it("preserves an existing name after editing the formula", async () => {
    const { view, onSubmit } = await setup({
      initialName: "Adjusted total",
      initialClause: Lib.expressionClause("+", [1, 2]),
    });
    await waitFor(() => expect(view.state.doc.toString()).toBe("1 + 2"));
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    await replaceFormula(view, "1 + 3");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].name).toBe("Adjusted total");
  });

  it("keeps invalid formulas open and clears the error after an edit", async () => {
    const { view, onSubmit } = await setup({ initialSource: "1 +" });
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/.+/);
    expect(onSubmit).not.toHaveBeenCalled();
    await replaceFormula(view, "1 + 2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Formula" }));
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("preserves text entered before the initial formula finishes formatting", async () => {
    const initialClause = Lib.expressionClause("+", [1, 2]);
    const { view, query } = await setup({
      initialClause,
      onEditorCreate: (view) => {
        view.dispatch({
          changes: { from: 0, insert: "3 + 4" },
          selection: { anchor: 5 },
          userEvent: "input.type",
        });
      },
    });
    await act(async () => {
      await format(initialClause, {
        query,
        stageIndex: -1,
        availableColumns: Lib.expressionableColumns(query, -1),
      });
    });
    expect(view.state.doc.toString()).toBe("3 + 4");
    expect(view.state.selection.main.head).toBe(5);
  });

  it.each(["/", "{Tab}", "{Shift>}{Tab}{/Shift}"])(
    "cancels an emptied formula with %s",
    async (key) => {
      const { view, onCancel, onSubmit } = await setup({
        initialSource: "1 + 2",
      });
      await replaceFormula(view, "");
      await userEvent.keyboard(key);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it("moves focus to Cancel on Tab in a nonempty formula", async () => {
    const { view, onCancel, onSubmit } = await setup({
      initialSource: "1 + 2",
    });
    await userEvent.tab();
    expect(
      screen.getByRole("button", { name: "Cancel formula" }),
    ).toHaveFocus();
    expect(view.state.doc.toString()).toBe("1 + 2");
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an edit that adds a second logical line", async () => {
    const { view } = await setup({ initialSource: "1 + 2" });
    await replaceFormula(view, "1 +\n2");
    expect(view.state.doc.toString()).toBe("1 + 2");
  });

  describe("completion", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(async () => {
      await act(async () => jest.runOnlyPendingTimers());
      jest.useRealTimers();
    });

    it("uses Enter for completion before committing", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { view, onSubmit } = await setup({ initialSource: "abs" });
      await openCompletion(view);
      await user.keyboard("{Enter}");
      expect(view.state.doc.toString()).toContain("abs(");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("keeps Tab in the editor when accepting completion and moving between snippet fields", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { view, onCancel } = await setup({ initialSource: "concat" });
      await openCompletion(view);

      await user.tab();

      expect(view.state.doc.toString()).toContain("concat(");
      expect(view.hasFocus).toBe(true);

      await user.tab();

      expect(view.hasFocus).toBe(true);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("closes completion with Escape before cancelling", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { view, onCancel } = await setup({ initialSource: "abs" });
      await openCompletion(view);
      await user.keyboard("{Escape}");
      expect(completionStatus(view.state)).toBeNull();
      expect(onCancel).not.toHaveBeenCalled();
      await user.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("commits with Mod+Enter even while completing", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { view, onSubmit } = await setup({ initialSource: "[Total]" });
      await openCompletion(view, 3);
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
