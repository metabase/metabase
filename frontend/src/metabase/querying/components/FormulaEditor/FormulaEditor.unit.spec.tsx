import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import {
  act,
  createMockClipboardData,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { defer } from "metabase/utils/promise";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import type { DatabaseFeature } from "metabase-types/api";
import { COMMON_DATABASE_FEATURES } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FormulaEditor } from "./FormulaEditor";
import type { FormulaEditorProps, NamedExpression } from "./types";

jest.unmock("@uiw/react-codemirror");

type SetupOpts = Partial<
  Pick<
    FormulaEditorProps,
    | "initialSource"
    | "database"
    | "expressionMode"
    | "query"
    | "expressionIndex"
  >
>;

type FeatureCase = Required<Pick<SetupOpts, "expressionMode">> & {
  feature: DatabaseFeature;
  source: string;
  functionName: string;
};

const FEATURE_CASES: FeatureCase[] = [
  {
    expressionMode: "aggregation",
    feature: "percentile-aggregations",
    source: "Percentile([Total], 0.9)",
    functionName: "Percentile",
  },
  {
    expressionMode: "aggregation",
    feature: "percentile-aggregations",
    source: "Sum([Total]) / Median([Total])",
    functionName: "Median",
  },
  {
    expressionMode: "aggregation",
    feature: "standard-deviation-aggregations",
    source: "StandardDeviation([Total])",
    functionName: "StandardDeviation",
  },
  {
    expressionMode: "expression",
    feature: "regex",
    source: 'regexExtract([Product → Category], "^W")',
    functionName: "regexExtract",
  },
  {
    expressionMode: "expression",
    feature: "datetime-diff",
    source: 'datetimeDiff([Created At], [Product → Created At], "day") + 1',
    functionName: "datetimeDiff",
  },
];

function getFeaturesWithout(feature: DatabaseFeature) {
  return COMMON_DATABASE_FEATURES.filter((name) => name !== feature);
}

function createDatabaseWithout(feature: DatabaseFeature) {
  return createSampleDatabase({ features: getFeaturesWithout(feature) });
}

function createDatabaseWith(feature: DatabaseFeature) {
  return createSampleDatabase({
    features: [...getFeaturesWithout(feature), feature],
  });
}

async function setup(options: SetupOpts = {}) {
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
      triggerLocation="table"
      onSubmit={onSubmit}
      onCancel={onCancel}
      onEditorCreate={(view) => {
        created.resolve(view);
      }}
      {...options}
    />,
  );
  const view = await created.promise;
  return { view, onSubmit, onCancel };
}

function createDoubledTotalQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        expressions: [
          {
            name: "Doubled",
            value: {
              type: "operator",
              operator: "*",
              args: [
                { type: "column", name: "TOTAL" },
                { type: "literal", value: 2 },
              ],
            },
          },
        ],
      },
    ],
  });
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

  it("keeps invalid formulas open and clears the error after an edit", async () => {
    const { view, onSubmit } = await setup({ initialSource: "1 +" });
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/.+/);
    expect(onSubmit).not.toHaveBeenCalled();
    await replaceFormula(view, "1 + 2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("textbox", { name: "Formula" }));
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["total*2", "Total * 2"],
    ["([Total] + 1) + 2", "Total + 1 + 2"],
    ["[Total] * (2)", "Total * 2"],
    ["1e3 + [Total]", "1000 + Total"],
    ["[Product.Category]", "Product → Category"],
  ])("names the formula %s after its formatted text", async (source, name) => {
    const { onSubmit } = await setup({ initialSource: source });

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].name).toBe(name);
  });

  it("lets a new formula refer to an existing custom column", async () => {
    const { onSubmit } = await setup({
      query: createDoubledTotalQuery(),
      initialSource: "[Doubled] + 1",
    });

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("does not let the edited custom column refer to itself", async () => {
    const { onSubmit } = await setup({
      query: createDoubledTotalQuery(),
      expressionIndex: 0,
      initialSource: "[Doubled] + 1",
    });

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/.+/);
    expect(onSubmit).not.toHaveBeenCalled();
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

  it("normalizes multiline and linewise pastes and preserves undo", async () => {
    const { view, onSubmit } = await setup();
    await userEvent.paste("coalesce(\r\n[Total],\r0\n)");
    expect(view.state.doc.toString()).toBe("coalesce( [Total], 0 )");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("textbox", { name: "Formula" }));
    const source = view.state.doc.toString();
    const selection = view.state.selection;
    expect(selection.main.empty).toBe(true);
    const setData = jest.fn<void, [string, string]>();
    fireEvent.copy(view.contentDOM, {
      clipboardData: createMockClipboardData({
        clearData: jest.fn<void, []>(),
        setData,
      }),
    });
    expect(setData).toHaveBeenCalledWith("text/plain", source);
    await userEvent.paste(source);
    expect(view.state.doc.toString()).toBe(`${source} ${source}`);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.selection.eq(selection)).toBe(true);
  });

  describe("functions the database doesn't support", () => {
    it.each(FEATURE_CASES)(
      "flags $functionName in $source without $feature, and adds nothing",
      async ({ expressionMode, feature, source, functionName }) => {
        const { onSubmit } = await setup({
          initialSource: source,
          expressionMode,
          database: createDatabaseWithout(feature),
        });

        await userEvent.click(
          screen.getByRole("button", { name: "Add column" }),
        );

        expect(screen.getByRole("alert")).toHaveTextContent(
          `Unsupported function ${functionName}`,
        );
        expect(onSubmit).not.toHaveBeenCalled();
      },
    );

    it.each(FEATURE_CASES)(
      "adds $source when the database has $feature",
      async ({ expressionMode, feature, source }) => {
        const { onSubmit } = await setup({
          initialSource: source,
          expressionMode,
          database: createDatabaseWith(feature),
        });

        await userEvent.click(
          screen.getByRole("button", { name: "Add column" }),
        );

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(onSubmit).toHaveBeenCalledTimes(1);
      },
    );

    it("drops the flag once the function is replaced, and adds the formula", async () => {
      const { view, onSubmit } = await setup({
        initialSource: "Median([Total])",
        expressionMode: "aggregation",
        database: createDatabaseWithout("percentile-aggregations"),
      });
      await userEvent.click(screen.getByRole("button", { name: "Add column" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unsupported function Median",
      );

      await replaceFormula(view, "Average([Total])");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add column" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const [[{ name }]] = onSubmit.mock.calls;
      expect(name).toBe("Average(Total)");
    });
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
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    });
  });
});

function setupTracking() {
  return jest.spyOn(Analytics, "trackSimpleEvent").mockClear();
}

describe("FormulaEditor analytics", () => {
  it("tracks a function the database doesn't support", async () => {
    const trackSimpleEvent = setupTracking();
    const { onSubmit } = await setup({
      initialSource: "Median([Total])",
      expressionMode: "aggregation",
      database: createDatabaseWithout("percentile-aggregations"),
    });

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(trackSimpleEvent.mock.calls).toEqual([
      [
        {
          event: "formula_bar_submitted",
          triggered_from: "table",
          event_detail: "new",
          result: "unsupported_function",
        },
      ],
    ]);
  });

  it("tracks each try of an edited formula, invalid and then valid", async () => {
    const trackSimpleEvent = setupTracking();
    const { view, onSubmit } = await setup({
      query: createDoubledTotalQuery(),
      expressionIndex: 0,
      initialSource: "[Total] *",
    });

    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await replaceFormula(view, "[Total] * 3");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(trackSimpleEvent.mock.calls).toEqual([
      [
        {
          event: "formula_bar_submitted",
          triggered_from: "table",
          event_detail: "edit",
          result: "invalid",
        },
      ],
      [
        {
          event: "formula_bar_submitted",
          triggered_from: "table",
          event_detail: "edit",
          result: "success",
        },
      ],
    ]);
  });
});
