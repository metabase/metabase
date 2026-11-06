import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { diagnoseAndCompile, format } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import { ORDERS } from "metabase-types/api/mocks/presets";

import { FormulaEditor } from "./FormulaEditor";
import type { FormulaEditorProps, NamedExpression } from "./types";

jest.unmock("@uiw/react-codemirror");

type SetupOpts = Partial<
  Pick<
    FormulaEditorProps,
    | "initialSource"
    | "initialName"
    | "initialClause"
    | "onEditorCreate"
    | "onNavigate"
  >
>;

async function setup({ onEditorCreate: onCreate, ...options }: SetupOpts = {}) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const onSubmit = jest.fn<void, [NamedExpression]>();
  const onCancel = jest.fn<void, []>();
  let onEditorCreate = (_view: EditorView) => {};
  const created = new Promise<EditorView>((resolve) => {
    onEditorCreate = (view) => {
      onCreate?.(view);
      resolve(view);
    };
  });
  renderWithProviders(
    <FormulaEditor
      query={query}
      stageIndex={-1}
      database={SAMPLE_DATABASE}
      expressionMode="expression"
      submitLabel="Add column"
      onSubmit={onSubmit}
      onCancel={onCancel}
      onEditorCreate={onEditorCreate}
      {...options}
    />,
  );
  const view = await created;
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

describe("FormulaEditor", () => {
  it("focuses the editor and disables committing an empty formula", async () => {
    const { view } = await setup();
    expect(view.hasFocus).toBe(true);
    expect(screen.getByRole("textbox", { name: "Formula" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
  });

  it("commits a column formula with its source as its name", async () => {
    const { view, query, onSubmit } = await setup();
    await replaceFormula(view, "[Total] * 2");
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const expression = onSubmit.mock.calls[0]?.[0];
    expect(expression?.name).toBe("Total * 2");
    const nextQuery = expression
      ? Lib.expression(query, -1, expression.name, expression.clause)
      : query;
    expect(Lib.toLegacyQuery(nextQuery)).toMatchObject({
      query: {
        expressions: {
          "Total * 2": [
            "*",
            ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
            2,
          ],
        },
      },
    });
  });

  it("preserves an existing name after editing the formula", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const { expressionClause } = diagnoseAndCompile({
      source: "[Total] * 2",
      query,
      stageIndex: -1,
      expressionMode: "expression",
      database: SAMPLE_DATABASE,
      availableColumns: Lib.expressionableColumns(query, -1),
    });
    expect(expressionClause).not.toBeNull();
    const { view, onSubmit } = await setup({
      initialName: "Adjusted total",
      initialClause: expressionClause,
    });
    await waitFor(() => expect(view.state.doc.toString()).toBe("[Total] * 2"));
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    await replaceFormula(view, "[Total] * 3");
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
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
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

  it.each(["{Escape}", "/", "{Tab}", "{Shift>}{Tab}{/Shift}"])(
    "cancels an empty formula with %s",
    async (key) => {
      const { onCancel, onSubmit } = await setup();
      await userEvent.keyboard(key);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it("cancels with the Cancel button", async () => {
    const { onCancel } = await setup({ initialSource: "[Total] * 2" });
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel formula" }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Tab after clearing an existing formula", async () => {
    const { view, onCancel } = await setup({ initialSource: "[Total] * 2" });
    await replaceFormula(view, "");
    await userEvent.tab();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, () => false])(
    "moves focus to Cancel when Tab does not navigate to another formula",
    async (onNavigate) => {
      const { view, onCancel, onSubmit } = await setup({
        initialSource: "1 + 2",
        onNavigate,
      });

      await userEvent.tab();

      expect(
        screen.getByRole("button", { name: "Cancel formula" }),
      ).toHaveFocus();
      expect(view.state.doc.toString()).toBe("1 + 2");
      expect(onCancel).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

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
      await act(async () => {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        startCompletion(view);
      });
      await waitFor(() => expect(completionStatus(view.state)).toBe("active"));
      await act(async () => jest.advanceTimersByTime(100));
      await user.keyboard("{Enter}");
      expect(view.state.doc.toString()).toContain("abs(");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("keeps Tab in the editor when accepting completion and moving between snippet fields", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { view, onCancel } = await setup({ initialSource: "concat" });
      await act(async () => {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        startCompletion(view);
      });
      await waitFor(() => expect(completionStatus(view.state)).toBe("active"));
      await act(async () => jest.advanceTimersByTime(100));

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
      await act(async () => {
        view.dispatch({ selection: { anchor: view.state.doc.length } });
        startCompletion(view);
      });
      await waitFor(() => expect(completionStatus(view.state)).toBe("active"));
      await act(async () => jest.advanceTimersByTime(100));
      await user.keyboard("{Escape}");
      expect(completionStatus(view.state)).toBeNull();
      expect(onCancel).not.toHaveBeenCalled();
      await user.keyboard("{Escape}");
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("commits with Mod+Enter even while completing", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { view, onSubmit } = await setup({ initialSource: "[Total]" });
      await act(async () => {
        view.dispatch({ selection: { anchor: 3 } });
        startCompletion(view);
      });
      await waitFor(() => expect(completionStatus(view.state)).toBe("active"));
      await act(async () => jest.advanceTimersByTime(100));
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
