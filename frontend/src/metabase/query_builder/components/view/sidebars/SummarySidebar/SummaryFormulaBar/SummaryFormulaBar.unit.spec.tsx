import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabaseEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { databaseApi } from "metabase/api";
import {
  deserializeCardFromUrl,
  serializeCardForUrl,
} from "metabase/common/utils/card";
import { format } from "metabase/querying/expressions";
import * as formatter from "metabase/querying/expressions/formatter/formatter";
import { useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import type {
  QueryBuilderMode,
  SummaryGeneratedExpression,
} from "metabase/redux/store";
import { defer } from "metabase/utils/promise";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  ColumnNameColumnSplitSetting,
  Database,
  TestOperatorSpec,
  TestQuerySpec,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { resetUIControls } from "../../../../../store/actions";
import { getQueryBuilderMode } from "../../../../../store/selectors";
import { makeSummaryFormula } from "../../../../../utils/summary-formulas";
import {
  FormulaBarSlotProvider,
  FormulaBarSlotTarget,
} from "../../../FormulaBar";
import { SummarySidebar } from "../SummarySidebar";
import type { SummaryWellId } from "../types";
import { getDimensionItems, getValueItems } from "../utils";

jest.unmock("@uiw/react-codemirror");

const FORMULA_QUERY_SPEC: TestQuerySpec = {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      expressions: [
        {
          name: "Order date",
          value: {
            type: "operator",
            operator: "datetime-add",
            args: [
              { type: "column", name: "CREATED_AT" },
              { type: "literal", value: 1 },
              { type: "literal", value: "day" },
            ],
          },
        },
      ],
      aggregations: [
        {
          name: "Sum total",
          value: {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", name: "TOTAL" }],
          },
        },
      ],
      breakouts: [{ type: "column", name: "Order date", unit: "year" }],
    },
  ],
};

const FORMULA_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, FORMULA_QUERY_SPEC);

const TWICE_GROUPED_FORMULA_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      ...FORMULA_QUERY_SPEC.stages[0],
      breakouts: [
        { type: "column", name: "Order date", unit: "year" },
        { type: "column", name: "Order date", unit: "month" },
      ],
    },
  ],
});

function sumOf(name: string): TestOperatorSpec {
  return {
    type: "operator",
    operator: "sum",
    args: [{ type: "column", name }],
  };
}

type SetupOpts = {
  stageIndex?: number;
  database?: Database;
  databaseResponse?: Promise<Database>;
  query?: Lib.Query;
  generatedExpressions?: SummaryGeneratedExpression[];
  pivotColumnSplit?: ColumnNameColumnSplitSetting;
};

async function setup({
  database = createSampleDatabase(),
  databaseResponse,
  stageIndex = -1,
  query: initialQuery = Lib.createTestQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  ),
  generatedExpressions,
  pivotColumnSplit: initialPivotColumnSplit,
}: SetupOpts = {}) {
  if (databaseResponse) {
    fetchMock.get(`path:/api/database/${database.id}`, () => databaseResponse, {
      name: "pending-database",
    });
  } else {
    setupDatabaseEndpoints(database);
  }
  setupUserMetabotPermissionsEndpoint();
  const onQueryChange = jest.fn<void, [Lib.Query]>();
  const metadata = createMockMetadata({ databases: [database] });
  let savedCard = createMockCard({
    dataset_query: Lib.toJsQuery(initialQuery),
  });
  function Harness({ initialCard }: { initialCard: Card }) {
    const [card, setCard] = useState(initialCard);
    const [pivotColumnSplit, setPivotColumnSplit] = useState(
      initialPivotColumnSplit,
    );
    const mode = useSelector(getQueryBuilderMode);
    const question = new Question(card, metadata);
    const query = question.query();
    return (
      <FormulaBarSlotProvider>
        <FormulaBarSlotTarget />
        <button
          onClick={() => {
            const [breakout] = Lib.breakouts(query, -1);
            if (breakout) {
              setCard(
                question.setQuery(Lib.removeClause(query, -1, breakout)).card(),
              );
            }
          }}
        >
          Remove grouping outside sidebar
        </button>
        {mode === "view" && (
          <SummarySidebar
            query={query}
            stageIndex={stageIndex}
            pivotColumnSplit={pivotColumnSplit}
            onQueryChange={(nextQuery, pivotChange) => {
              savedCard = question.setQuery(nextQuery).card();
              setCard(savedCard);
              if (pivotChange?.type === "show") {
                setPivotColumnSplit(pivotChange.columnSplit);
              }
              if (pivotChange?.type === "hide") {
                setPivotColumnSplit(undefined);
              }
              onQueryChange(nextQuery);
            }}
          />
        )}
      </FormulaBarSlotProvider>
    );
  }
  const { store, rerender } = renderWithProviders(
    <Harness initialCard={savedCard} />,
  );
  if (generatedExpressions) {
    act(() => {
      store.dispatch(
        setUIControls({ summaryGeneratedExpressions: generatedExpressions }),
      );
    });
  }
  if (!databaseResponse) {
    await act(async () => {
      await store
        .dispatch(
          databaseApi.endpoints.getDatabase.initiate({ id: database.id }),
        )
        .unwrap();
    });
  }
  return {
    onQueryChange,
    store,
    setMode: (queryBuilderMode: QueryBuilderMode) =>
      act(() => {
        store.dispatch(setUIControls({ queryBuilderMode }));
      }),
    reloadQuestion: () => {
      act(() => {
        store.dispatch(resetUIControls());
      });
      rerender(
        <Harness
          key={1}
          initialCard={deserializeCardFromUrl(serializeCardForUrl(savedCard))}
        />,
      );
    },
  };
}

const INPUT_NAMES: Record<SummaryWellId, string> = {
  values: "Add a value by name",
  columns: "Add a grouping by name",
  rows: "Add a row by name",
};

function getInput(wellId: SummaryWellId) {
  return screen.getByRole("textbox", { name: INPUT_NAMES[wellId] });
}

function getChipLabels(wellId: SummaryWellId) {
  return within(screen.getByTestId(`summary-well-${wellId}`))
    .queryAllByTestId("summary-well-item")
    .map((chip) => chip.textContent);
}

function getEditor() {
  return EditorView.findFromDOM(screen.getByTestId("formula-editor"));
}

async function expectClosed() {
  await waitFor(() =>
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument(),
  );
}

function setupFormulaQuery() {
  return setup({
    query: FORMULA_QUERY,
    generatedExpressions: [
      makeSummaryFormula(FORMULA_QUERY, -1, "Order date"),
    ].filter(isNotNull),
  });
}

function getFormulaChip(label: string) {
  return screen.getByRole("button", { name: `Edit the formula of ${label}` });
}

async function expectFormula(source: string) {
  await waitFor(() => expect(getEditor()?.state.doc.toString()).toBe(source));
}

async function changeFormula(source: string, from = 0) {
  const view = getEditor();
  expect(view).not.toBeNull();
  if (view) {
    await act(async () => {
      view.dispatch({
        changes: { from, to: view.state.doc.length, insert: source },
        userEvent: "input.type",
      });
    });
  }
}

async function addFormula(wellId: SummaryWellId, source: string) {
  fireEvent.change(getInput(wellId), { target: { value: `=${source}` } });
  await screen.findByRole("textbox", { name: "Formula" });
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  await expectClosed();
}

async function openFormula(label: string) {
  await userEvent.click(getFormulaChip(label));
  await screen.findByTestId("formula-editor");
  await waitFor(() => expect(getEditor()?.state.doc.length).toBeGreaterThan(0));
}

describe("summary formula handoff", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("cleans up well-created columns after an Editor round trip, keeping manual columns", async () => {
    const { onQueryChange, setMode } = await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            expressions: [
              { name: "Manual", value: { type: "column", name: "TOTAL" } },
            ],
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [{ type: "column", name: "Manual" }],
          },
        ],
      }),
    });
    fireEvent.change(getInput("columns"), {
      target: { value: "=[Total] + 10" },
    });
    await screen.findByRole("textbox", { name: "Formula" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();
    setMode("notebook");
    expect(screen.queryByTestId("summary-sidebar")).not.toBeInTheDocument();
    setMode("view");
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    const [afterFormulaRemoval] = onQueryChange.mock.calls[1];
    expect(Lib.expressions(afterFormulaRemoval, -1)).toHaveLength(1);
    expect(
      Lib.displayInfo(
        afterFormulaRemoval,
        -1,
        Lib.expressions(afterFormulaRemoval, -1)[0],
      ).displayName,
    ).toBe("Manual");
    expect(Lib.breakouts(afterFormulaRemoval, -1)).toHaveLength(0);
    expect(Lib.aggregations(afterFormulaRemoval, -1)).toHaveLength(0);
  });
  it("keeps custom columns after loading the question again", async () => {
    const { onQueryChange, reloadQuestion } = await setup();
    fireEvent.change(getInput("columns"), {
      target: { value: "=[Total] + 10" },
    });
    await screen.findByRole("textbox", { name: "Formula" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();
    reloadQuestion();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Total + 10" }),
    );
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    const [query] = onQueryChange.mock.calls[1];
    expect(Lib.breakouts(query, -1)).toHaveLength(0);
    expect(Lib.expressions(query, -1)).toHaveLength(1);
  });

  it("keeps owning a grouping formula after it is renamed", async () => {
    const { onQueryChange } = await setup();
    fireEvent.change(getInput("columns"), {
      target: { value: "=[Total] + 10" },
    });
    await screen.findByRole("textbox", { name: "Formula" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();
    await userEvent.dblClick(
      within(screen.getByTestId("summary-well-columns")).getByText(
        "Total + 10",
      ),
    );
    const input = screen.getByRole("textbox", { name: "Rename Total + 10" });
    await userEvent.clear(input);
    await userEvent.type(input, "Bonus{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Remove Bonus" }));
    expect(onQueryChange).toHaveBeenCalledTimes(3);
    const [query] = onQueryChange.mock.calls[2];
    expect(Lib.breakouts(query, -1)).toHaveLength(0);
    expect(Lib.expressions(query, -1)).toHaveLength(0);
  });

  it("renames a grouping formula after the question is loaded again", async () => {
    const { onQueryChange, reloadQuestion } = await setup();
    fireEvent.change(getInput("columns"), {
      target: { value: "=[Total] + 10" },
    });
    await screen.findByRole("textbox", { name: "Formula" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();
    reloadQuestion();
    await userEvent.dblClick(
      within(screen.getByTestId("summary-well-columns")).getByText(
        "Total + 10",
      ),
    );
    const input = screen.getByRole("textbox", { name: "Rename Total + 10" });
    await userEvent.clear(input);
    await userEvent.type(input, "Bonus{Enter}");
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    const [query] = onQueryChange.mock.calls[1];
    expect(getDimensionItems(query, -1).map((item) => item.label)).toEqual([
      "Bonus",
    ]);
  });

  it("removes a chip whose name is being edited on the first Remove click", async () => {
    const { onQueryChange } = await setup();
    fireEvent.change(getInput("columns"), {
      target: { value: "=[Total] + 10" },
    });
    await screen.findByRole("textbox", { name: "Formula" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();
    await userEvent.dblClick(
      within(screen.getByTestId("summary-well-columns")).getByText(
        "Total + 10",
      ),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Rename Total + 10" }),
      "Bonus",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Total + 10" }),
    );
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    const [query] = onQueryChange.mock.calls[1];
    expect(Lib.breakouts(query, -1)).toHaveLength(0);
    expect(Lib.expressions(query, -1)).toHaveLength(0);
  });

  it("keeps a formula regrouped after its grouping was removed outside the sidebar", async () => {
    const { onQueryChange } = await setup();
    fireEvent.change(getInput("columns"), {
      target: { value: "=[Total] + 10" },
    });
    await screen.findByRole("textbox", { name: "Formula" });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove grouping outside sidebar" }),
    );
    await userEvent.type(getInput("columns"), "Total + 10");
    await userEvent.click(
      await screen.findByRole("option", { name: "Total + 10" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Total + 10" }),
    );
    expect(onQueryChange).toHaveBeenCalledTimes(3);
    const [query] = onQueryChange.mock.calls[2];
    expect(Lib.breakouts(query, -1)).toHaveLength(0);
    expect(Lib.expressions(query, -1)).toHaveLength(1);
  });

  it.each([
    {
      wellId: "values",
      source: "Sum([Total]) / Count()",
      values: ["Sum(Total) / Count()"],
      dimensions: [],
      expressionCount: 0,
    },
    {
      wellId: "columns",
      source: 'concat([User → Name], "!")',
      values: ["Count"],
      dimensions: ['concat(User → Name, "!")'],
      expressionCount: 1,
    },
  ] satisfies {
    wellId: SummaryWellId;
    source: string;
    values: string[];
    dimensions: string[];
    expressionCount: number;
  }[])(
    "adds a pasted formula to $wellId",
    async ({ wellId, source, values, dimensions, expressionCount }) => {
      const { onQueryChange } = await setup();
      const input = getInput(wellId);
      fireEvent.change(input, { target: { value: `=${source}` } });
      await screen.findByRole("textbox", { name: "Formula" });
      expect(getEditor()?.state.doc.toString()).toBe(source);
      expect(getEditor()?.state.selection.main.head).toBe(source.length);

      await userEvent.click(screen.getByRole("button", { name: "Add" }));
      await expectClosed();
      expect(
        screen.queryByTestId("summary-well-draft-formula"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: `Remove ${[...dimensions, ...values][0]}`,
        }),
      ).toBeInTheDocument();
      expect(onQueryChange).toHaveBeenCalledTimes(1);
      const [query] = onQueryChange.mock.calls[0];
      expect(getValueItems(query, -1).map((item) => item.label)).toEqual(
        values,
      );
      expect(getDimensionItems(query, -1).map((item) => item.label)).toEqual(
        dimensions,
      );
      expect(Lib.expressions(query, -1)).toHaveLength(expressionCount);
      expect(input).toHaveValue("");
      expect(input).toHaveFocus();
    },
  );

  it("shows the live draft in its well and lets the chip focus or cancel the editor", async () => {
    const source = "Sum([Total]) + 100 + 100 + 100 + 100 + 100 + 100";
    const { onQueryChange } = await setup();
    const input = getInput("values");
    fireEvent.change(input, { target: { value: "=" } });
    const editor = await screen.findByRole("textbox", { name: "Formula" });
    const chip = within(screen.getByTestId("summary-well-values")).getByTestId(
      "summary-well-draft-formula",
    );
    expect(chip).toHaveTextContent("New formula");
    expect(
      within(screen.getByTestId("summary-well-columns")).queryByTestId(
        "summary-well-draft-formula",
      ),
    ).not.toBeInTheDocument();

    const view = getEditor();
    expect(view).not.toBeNull();
    if (view) {
      await act(async () => {
        view.dispatch({
          changes: { from: 0, insert: source },
          userEvent: "input.type",
        });
      });
    }
    expect(chip).toHaveTextContent(/Sum\(Total\).*…$/);
    const label = within(chip).getByText(/^Sum\(Total\)/);
    await userEvent.hover(label);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(source);
    if (view) {
      await act(async () => {
        view.dispatch({
          changes: { from: view.state.doc.length, insert: " + 1" },
          userEvent: "input.type",
        });
      });
    }
    expect(screen.getByRole("tooltip")).toHaveTextContent(`${source} + 1`);
    await userEvent.unhover(label);
    await userEvent.click(getInput("columns"));
    await userEvent.click(
      within(chip).getByRole("button", {
        name: "Edit the new formula in the formula bar",
      }),
    );
    expect(editor).toHaveFocus();
    expect(getEditor()?.state.doc.toString()).toBe(`${source} + 1`);

    await userEvent.click(
      within(chip).getByRole("button", { name: "Cancel the new formula" }),
    );
    await expectClosed();
    expect(
      screen.queryByTestId("summary-well-draft-formula"),
    ).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("keeps text entered before the formula editor takes focus", async () => {
    await setup();
    const input = getInput("values");
    const setValue:
      | ((this: HTMLInputElement, value: string) => void)
      | undefined = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(setValue).toBeDefined();
    if (!(input instanceof HTMLInputElement) || !setValue) {
      return;
    }
    act(() => {
      for (const value of [
        "=",
        "=S",
        "=Su",
        "=Sum([Total]) +",
        "=Sum([Total])",
      ]) {
        setValue.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await screen.findByRole("textbox", { name: "Formula" });
    expect(getEditor()?.state.doc.toString()).toBe("Sum([Total])");
    expect(input).toHaveValue("");
  });

  it.each(["values", "columns"] as const)(
    "cancels back to the %s input",
    async (wellId) => {
      const { onQueryChange } = await setup();
      const input = getInput(wellId);
      fireEvent.change(input, { target: { value: "=" } });
      await screen.findByRole("textbox", { name: "Formula" });
      await userEvent.keyboard("{Escape}");
      await expectClosed();
      expect(onQueryChange).not.toHaveBeenCalled();
      expect(input).toHaveFocus();
      expect(input).toHaveValue("");
    },
  );

  it("opens an early formula once database features finish loading", async () => {
    jest.useFakeTimers();
    const database = createSampleDatabase();
    const response = defer<Database>();
    const { store } = await setup({
      database,
      databaseResponse: response.promise,
    });
    const input = getInput("values");
    fireEvent.change(input, { target: { value: "=Sum([Total])" } });
    expect(input).toHaveValue("=Sum([Total])");
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();

    await act(async () => {
      response.resolve(database);
      await store
        .dispatch(
          databaseApi.endpoints.getDatabase.initiate({ id: database.id }),
        )
        .unwrap();
    });
    await act(async () => jest.runOnlyPendingTimers());
    expect(
      await screen.findByRole("textbox", { name: "Formula" }),
    ).toHaveFocus();
    expect(getEditor()?.state.doc.toString()).toBe("Sum([Total])");
    expect(input).toHaveValue("");
  });

  it("does not move focus back to an early formula after the user leaves its input", async () => {
    const database = createSampleDatabase();
    const response = defer<Database>();
    const { store } = await setup({
      database,
      databaseResponse: response.promise,
    });
    const input = getInput("values");
    await userEvent.type(input, "=Count()");
    const nextInput = getInput("columns");
    await userEvent.click(nextInput);

    await act(async () => {
      response.resolve(database);
      await store
        .dispatch(
          databaseApi.endpoints.getDatabase.initiate({ id: database.id }),
        )
        .unwrap();
    });
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
    expect(nextInput).toHaveFocus();
    expect(input).toHaveValue("=Count()");
  });

  it("keeps equals text in the typeahead when formulas are unsupported", async () => {
    const { onQueryChange } = await setup({
      database: createSampleDatabase({ features: [] }),
    });
    const input = getInput("columns");
    await userEvent.type(input, "=test");
    expect(input).toHaveValue("=test");
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
    expect(onQueryChange).not.toHaveBeenCalled();
  });
});

describe("formulas in Rows", () => {
  it("adds a formula that is written in the Rows typeahead to Rows", async () => {
    await setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Pivot into rows and columns" }),
    );

    fireEvent.change(getInput("rows"), { target: { value: "=" } });
    await screen.findByRole("textbox", { name: "Formula" });
    expect(
      within(screen.getByTestId("summary-well-rows")).getByTestId(
        "summary-well-draft-formula",
      ),
    ).toBeInTheDocument();
    await changeFormula("[Total] * 2");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await expectClosed();

    expect(getChipLabels("rows")).toEqual(["Total * 2"]);
    expect(getChipLabels("columns")).toEqual([]);
    expect(getInput("rows")).toHaveFocus();
  });

  it("closes a formula that is written in the Rows typeahead when the pivot mode ends", async () => {
    const { onQueryChange } = await setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Pivot into rows and columns" }),
    );
    fireEvent.change(getInput("rows"), { target: { value: "=" } });
    await screen.findByRole("textbox", { name: "Formula" });
    await changeFormula("[Total] * 2");

    await userEvent.click(
      screen.getByRole("button", { name: "Back to breakouts" }),
    );

    await expectClosed();
    expect(screen.queryByTestId("summary-well-rows")).not.toBeInTheDocument();
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("updates the formula of a Rows chip and keeps the chip in Rows", async () => {
    const { onQueryChange } = await setup({
      query: FORMULA_QUERY,
      generatedExpressions: [
        makeSummaryFormula(FORMULA_QUERY, -1, "Order date"),
      ].filter(isNotNull),
      pivotColumnSplit: {
        rows: ["Order date"],
        columns: [],
        values: ["Sum total"],
      },
    });
    expect(getChipLabels("rows")).toEqual(["Order date: Year"]);

    await userEvent.click(getFormulaChip("Order date: Year"));
    await expectFormula('datetimeAdd([Created At], 1, "day")');
    await changeFormula('datetimeAdd([Created At], 2, "day")');
    await userEvent.keyboard("{Enter}");
    await expectClosed();

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [query] = onQueryChange.mock.calls[0];
    const [expression] = Lib.expressions(query, -1);
    expect(await format(expression, { query, stageIndex: -1 })).toBe(
      'datetimeAdd([Created At], 2, "day")',
    );
    expect(getChipLabels("rows")).toEqual(["Order date: Year"]);
    expect(getChipLabels("columns")).toEqual([]);
  });
});

describe("editing a formula chip", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("keeps the saved formula when it fails to load into the bar", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    const loading = defer<string>();
    jest.spyOn(formatter, "format").mockReturnValueOnce(loading.promise);
    await userEvent.click(getFormulaChip("Sum total"));
    await screen.findByRole("textbox", { name: "Formula" });
    await changeFormula("Count()");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();

    await act(async () => loading.reject(new Error("Failed to load")));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load this formula",
    );
    await userEvent.keyboard("{Enter}");
    expect(onQueryChange).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await expectClosed();
    await openFormula("Sum total");
    await expectFormula("Sum([Total])");
  });

  it("opens the formula of a Summarize by chip and updates it under its name", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    await userEvent.click(getFormulaChip("Sum total"));
    expect(
      await screen.findByRole("textbox", { name: "Formula" }),
    ).toHaveFocus();
    await expectFormula("Sum([Total])");
    expect(getEditor()?.state.selection.main.head).toBe("Sum([Total])".length);
    expect(
      screen.queryByTestId("summary-well-placeholder"),
    ).not.toBeInTheDocument();

    await changeFormula("Sum([Total]) / Count()");
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [query] = onQueryChange.mock.calls[0];
    const [aggregation] = Lib.aggregations(query, -1);
    expect(Lib.displayInfo(query, -1, aggregation).displayName).toBe(
      "Sum total",
    );
    expect(await format(aggregation, { query, stageIndex: -1 })).toBe(
      "Sum([Total]) / Count()",
    );
    expect(getInput("values")).toHaveFocus();
  });

  it("opens a Group by formula that a column header asked for, once", async () => {
    const { store } = await setupFormulaQuery();
    const [expression] = Lib.expressions(FORMULA_QUERY, -1);
    act(() => {
      store.dispatch(setUIControls({ summaryFormulaToEdit: expression }));
    });

    await expectFormula('datetimeAdd([Created At], 1, "day")');
    expect(getFormulaChip("Order date: Year")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel formula" }),
    );
    await expectClosed();
  });

  it("updates a Group by formula and keeps its grouping, name, and ownership", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    await userEvent.click(getFormulaChip("Order date: Year"));
    await expectFormula('datetimeAdd([Created At], 1, "day")');
    await changeFormula('datetimeAdd([Created At], 2, "day")');
    await userEvent.keyboard("{Enter}");
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [query] = onQueryChange.mock.calls[0];
    const [expression] = Lib.expressions(query, -1);
    expect(Lib.displayInfo(query, -1, expression).displayName).toBe(
      "Order date",
    );
    expect(await format(expression, { query, stageIndex: -1 })).toBe(
      'datetimeAdd([Created At], 2, "day")',
    );
    expect(getDimensionItems(query, -1).map((item) => item.label)).toEqual([
      "Order date: Year",
    ]);
    expect(getInput("columns")).toHaveFocus();

    expect(getFormulaChip("Order date: Year")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Order date: Year" }),
    );
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    const [afterRemoval] = onQueryChange.mock.calls[1];
    expect(Lib.expressions(afterRemoval, -1)).toHaveLength(0);
  });

  it("keeps both groupings when the edited formula is grouped twice", async () => {
    const query = TWICE_GROUPED_FORMULA_QUERY;
    const { onQueryChange } = await setup({
      query,
      generatedExpressions: [
        makeSummaryFormula(query, -1, "Order date"),
      ].filter(isNotNull),
    });
    await userEvent.click(getFormulaChip("Order date: Month"));
    await expectFormula('datetimeAdd([Created At], 1, "day")');
    await changeFormula('datetimeAdd([Created At], 2, "day")');
    await userEvent.keyboard("{Enter}");
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [nextQuery] = onQueryChange.mock.calls[0];
    expect(getDimensionItems(nextQuery, -1).map((item) => item.label)).toEqual([
      "Order date: Year",
      "Order date: Month",
    ]);
    expect(Lib.expressions(nextQuery, -1)).toHaveLength(1);
    expect(getFormulaChip("Order date: Year")).toBeInTheDocument();
    expect(getFormulaChip("Order date: Month")).toBeInTheDocument();
  });

  it("closes the bar when the removed chip's column name passes to another formula", async () => {
    const { onQueryChange } = await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              { name: "Formula", value: sumOf("TOTAL") },
              {
                name: "Formula",
                value: { type: "operator", operator: "count" },
              },
            ],
          },
        ],
      }),
    });
    const [firstChip] = screen.getAllByRole("button", {
      name: "Edit the formula of Formula",
    });
    await userEvent.click(firstChip);
    await expectFormula("Sum([Total])");
    const [removeFirst] = screen.getAllByRole("button", {
      name: "Remove Formula",
    });
    await userEvent.click(removeFirst);
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [nextQuery] = onQueryChange.mock.calls[0];
    const [aggregation] = Lib.aggregations(nextQuery, -1);
    expect(Lib.aggregations(nextQuery, -1)).toHaveLength(1);
    expect(
      await format(aggregation, { query: nextQuery, stageIndex: -1 }),
    ).toBe("Count()");
  });

  it("closes the bar when the edited chip is removed, even if another chip has the same formula", async () => {
    const { onQueryChange } = await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [
              { name: "Formula", value: sumOf("TOTAL") },
              { name: "Formula", value: sumOf("TOTAL") },
            ],
          },
        ],
      }),
    });
    const [firstChip, secondChip] = screen.getAllByRole("button", {
      name: "Edit the formula of Formula",
    });
    await userEvent.click(firstChip);
    await expectFormula("Sum([Total])");
    expect(secondChip).toHaveAttribute("aria-expanded", "false");

    const [removeFirst] = screen.getAllByRole("button", {
      name: "Remove Formula",
    });
    await userEvent.click(removeFirst);
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Edit the formula of Formula" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("applies the default bucket when the edited formula drops the old one", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    await userEvent.click(getFormulaChip("Order date: Year"));
    await expectFormula('datetimeAdd([Created At], 1, "day")');
    await changeFormula("[Total] * 2");
    await userEvent.keyboard("{Enter}");
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [query] = onQueryChange.mock.calls[0];
    expect(getDimensionItems(query, -1).map((item) => item.label)).toEqual([
      "Order date",
    ]);
    expect(getFormulaChip("Order date")).toBeInTheDocument();
  });

  it.each([
    {
      wellId: "columns",
      source: "[Total]*2",
      label: "Total * 2",
      nextSource: "[Total] * 3",
      nextLabel: "Total * 3",
    },
    {
      wellId: "columns",
      source: "([Total] + 1) + 2",
      label: "Total + 1 + 2",
      nextSource: "[Total] * 3",
      nextLabel: "Total * 3",
    },
    {
      wellId: "values",
      source: "Sum([Total])*2",
      label: "Sum(Total) * 2",
      nextSource: "Sum([Total]) * 3",
      nextLabel: "Sum(Total) * 3",
    },
    {
      wellId: "values",
      source: "1e3 + Sum([Total])",
      label: "1000 + Sum(Total)",
      nextSource: "Sum([Total]) * 3",
      nextLabel: "Sum(Total) * 3",
    },
  ] satisfies {
    wellId: SummaryWellId;
    source: string;
    label: string;
    nextSource: string;
    nextLabel: string;
  }[])(
    "names an edited formula of $wellId after its new source when its name came from the source",
    async ({ wellId, source, label, nextSource, nextLabel }) => {
      const { onQueryChange } = await setup();
      await addFormula(wellId, source);

      await openFormula(label);
      await userEvent.click(screen.getByRole("button", { name: "Update" }));
      await expectClosed();
      expect(onQueryChange).toHaveBeenCalledTimes(1);

      await openFormula(label);
      await changeFormula(nextSource);
      await userEvent.keyboard("{Enter}");
      await expectClosed();
      expect(onQueryChange).toHaveBeenCalledTimes(2);
      expect(getFormulaChip(nextLabel)).toBeInTheDocument();
      const [query] = onQueryChange.mock.calls[1];
      const clauses =
        wellId === "values"
          ? Lib.aggregations(query, -1)
          : Lib.expressions(query, -1);
      expect(clauses).toHaveLength(1);
      expect(Lib.displayInfo(query, -1, clauses[0]).displayName).toBe(
        nextLabel,
      );
    },
  );

  it.each([1, 2])(
    "keeps a later-stage filter on a grouping when its formula is updated with a %i-day offset",
    async (days) => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          FORMULA_QUERY_SPEC.stages[0],
          {
            filters: [
              {
                type: "operator",
                operator: "<",
                args: [
                  { type: "column", name: "Order date" },
                  { type: "literal", value: "2026-03-15" },
                ],
              },
            ],
          },
        ],
      });
      const { onQueryChange } = await setup({ query, stageIndex: 0 });
      await openFormula("Order date: Year");
      await changeFormula(`datetimeAdd([Created At], ${days}, "day")`);
      await userEvent.click(screen.getByRole("button", { name: "Update" }));
      await expectClosed();

      const isChanged = days !== 1;
      expect(onQueryChange).toHaveBeenCalledTimes(isChanged ? 1 : 0);
      const [nextQuery] = onQueryChange.mock.calls[0] ?? [query];
      expect(Lib.toJsQuery(nextQuery)).toMatchObject({
        stages: [
          expect.anything(),
          {
            filters: [
              [
                "<",
                expect.anything(),
                ["field", { "inherited-temporal-unit": "year" }, "Order date"],
                "2026-03-15",
              ],
            ],
          },
        ],
      });
      expect(
        await format(Lib.expressions(nextQuery, 0)[0], {
          query: nextQuery,
          stageIndex: 0,
        }),
      ).toBe(`datetimeAdd([Created At], ${days}, "day")`);
    },
  );

  it("keeps an unbucketed date grouping unbucketed when its formula is updated", async () => {
    const { onQueryChange } = await setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            ...FORMULA_QUERY_SPEC.stages[0],
            breakouts: [{ type: "column", name: "Order date" }],
          },
        ],
      }),
    });
    await openFormula("Order date");
    await changeFormula('datetimeAdd([Created At], 2, "day")');
    await userEvent.keyboard("{Enter}");
    await expectClosed();

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [nextQuery] = onQueryChange.mock.calls[0];
    expect(Lib.temporalBucket(Lib.breakouts(nextQuery, -1)[0])).toBeNull();
  });

  it("groups by month and keeps a later-stage filter when a number formula becomes a date", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          ...FORMULA_QUERY_SPEC.stages[0],
          expressions: [
            { name: "Custom", value: { type: "column", name: "TOTAL" } },
          ],
          breakouts: [{ type: "column", name: "Custom" }],
        },
        {
          filters: [
            {
              type: "operator",
              operator: "not-null",
              args: [{ type: "column", name: "Custom" }],
            },
          ],
        },
      ],
    });
    const { onQueryChange } = await setup({ query, stageIndex: 0 });
    await openFormula("Custom");
    await changeFormula('datetimeAdd([Created At], 2, "day")');
    await userEvent.keyboard("{Enter}");
    await expectClosed();

    expect(onQueryChange).toHaveBeenCalledTimes(1);
    const [nextQuery] = onQueryChange.mock.calls[0];
    expect(Lib.toJsQuery(nextQuery)).toMatchObject({
      stages: [
        { breakout: [["expression", { "temporal-unit": "month" }, "Custom"]] },
        {
          filters: [
            [
              "not-null",
              expect.anything(),
              ["field", { "inherited-temporal-unit": "month" }, "Custom"],
            ],
          ],
        },
      ],
    });
  });

  it("leaves the query alone when a formula is updated without changes", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    await userEvent.click(getFormulaChip("Sum total"));
    await expectFormula("Sum([Total])");
    await userEvent.click(screen.getByRole("button", { name: "Update" }));
    await expectClosed();
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("closes the bar when the edited chip is removed", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    await userEvent.click(getFormulaChip("Sum total"));
    await expectFormula("Sum([Total])");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Sum total" }),
    );
    await expectClosed();
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(getInput("values")).toHaveFocus();
  });

  it("refocuses the open formula from its chip and switches to another chip's formula", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    await userEvent.click(getFormulaChip("Sum total"));
    await expectFormula("Sum([Total])");
    await changeFormula(" + 1", "Sum([Total])".length);
    await userEvent.click(getInput("columns"));
    await userEvent.click(getFormulaChip("Sum total"));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Formula" })).toHaveFocus(),
    );
    expect(getEditor()?.state.doc.toString()).toBe("Sum([Total]) + 1");

    await userEvent.click(getFormulaChip("Order date: Year"));
    await expectFormula('datetimeAdd([Created At], 1, "day")');
    expect(screen.getByRole("textbox", { name: "Formula" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expectClosed();
    expect(onQueryChange).not.toHaveBeenCalled();
    expect(getInput("columns")).toHaveFocus();
  });

  it("opens the bar only after the double-click time has passed", async () => {
    await setupFormulaQuery();

    await userEvent.click(getFormulaChip("Sum total"));
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();

    await expectFormula("Sum([Total])");
  });

  it("opens the bar at once from the keyboard", async () => {
    await setupFormulaQuery();
    getFormulaChip("Sum total").focus();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByTestId("formula-editor")).toBeInTheDocument();
    await expectFormula("Sum([Total])");
  });

  it("closes the bar it opened when a slow double-click renames the chip", async () => {
    const { onQueryChange } = await setupFormulaQuery();
    const label = getFormulaChip("Sum total");
    fireEvent.click(label, { detail: 1 });
    await expectFormula("Sum([Total])");

    fireEvent.click(label, { detail: 2 });
    fireEvent.dblClick(label);
    await expectClosed();
    expect(
      screen.getByRole("textbox", { name: "Rename Sum total" }),
    ).toHaveFocus();
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("offers no rename for the chip whose formula is open, and keeps it for the others", async () => {
    // A rename replaces the formula's clause with a new one, and the bar follows the clause it opened,
    // so a rename while the bar is open would close the bar and lose the edit in progress.
    await setupFormulaQuery();
    await openFormula("Sum total");

    fireEvent.keyDown(getFormulaChip("Sum total"), { key: "F2" });
    fireEvent.dblClick(getFormulaChip("Sum total"));
    expect(
      screen.queryByRole("textbox", { name: /^Rename/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("formula-editor")).toBeInTheDocument();

    fireEvent.keyDown(getFormulaChip("Order date: Year"), { key: "F2" });
    expect(
      screen.getByRole("textbox", { name: "Rename Order date" }),
    ).toBeInTheDocument();
  });

  it("shows every grouping of the open custom column as open, and offers none of them a rename", async () => {
    // Renaming any of these groupings replaces the custom column they share, which the bar follows,
    // so it would close the bar.
    await setup({ query: TWICE_GROUPED_FORMULA_QUERY });
    await openFormula("Order date: Year");
    expect(getFormulaChip("Order date: Year")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(getFormulaChip("Order date: Month")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.keyDown(getFormulaChip("Order date: Month"), { key: "F2" });
    fireEvent.dblClick(getFormulaChip("Order date: Month"));
    expect(
      screen.queryByRole("textbox", { name: /^Rename/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("formula-editor")).toBeInTheDocument();
  });

  it.each([
    { label: "Sum total", source: "[Sum total] * 2" },
    {
      label: "Order date: Year",
      source: 'datetimeAdd([Order date], 1, "day")',
    },
  ])(
    "does not let the formula of $label refer to itself",
    async ({ label, source }) => {
      const { onQueryChange } = await setupFormulaQuery();
      await userEvent.click(getFormulaChip(label));
      await screen.findByTestId("formula-editor");
      await waitFor(() =>
        expect(getEditor()?.state.doc.length).toBeGreaterThan(0),
      );
      await changeFormula(source);
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      expect(await screen.findByTestId("formula-error")).toBeInTheDocument();
      expect(screen.getByTestId("formula-editor")).toBeInTheDocument();
      expect(onQueryChange).not.toHaveBeenCalled();
    },
  );

  it("opens the bucket menu when the grouping's bucket is clicked", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupFormulaQuery();

    await user.click(screen.getByText("Year"));
    act(() => jest.advanceTimersByTime(500));

    expect(
      await screen.findByRole("menuitem", { name: "Month" }),
    ).toBeInTheDocument();
    // The formula bar should not open up as a side-effect
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
  });

  it("marks a formula chip as expanded while its formula is open in the bar", async () => {
    await setupFormulaQuery();
    const chip = getFormulaChip("Sum total");
    expect(chip).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(chip);
    await expectFormula("Sum([Total])");
    expect(chip).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");
    await expectClosed();
    expect(chip).toHaveAttribute("aria-expanded", "false");
  });

  it("renames on a double-click without opening the bar", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await setupFormulaQuery();

    await user.dblClick(getFormulaChip("Sum total"));
    act(() => jest.advanceTimersByTime(500));

    expect(
      screen.getByRole("textbox", { name: "Rename Sum total" }),
    ).toHaveFocus();
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
  });
});
