import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
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
import { defer } from "metabase/utils/promise";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Database,
  SummaryGeneratedExpression,
  TestOperatorSpec,
  TestQuerySpec,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

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

function sumOf(name: string): TestOperatorSpec {
  return {
    type: "operator",
    operator: "sum",
    args: [{ type: "column", name }],
  };
}

type SetupOpts = {
  database?: Database;
  databaseResponse?: Promise<Database>;
  query?: Lib.Query;
  generatedExpressions?: SummaryGeneratedExpression[];
};

async function setup({
  database = createSampleDatabase(),
  databaseResponse,
  query: initialQuery = Lib.createTestQuery(
    SAMPLE_PROVIDER,
    DEFAULT_TEST_QUERY,
  ),
  generatedExpressions,
}: SetupOpts = {}) {
  if (databaseResponse) {
    fetchMock.get(`path:/api/database/${database.id}`, () => databaseResponse, {
      name: "pending-database",
    });
  } else {
    setupDatabaseEndpoints(database);
  }
  const onQueryChange = jest.fn<void, [Lib.Query]>();
  const metadata = createMockMetadata({ databases: [database] });
  let savedCard = createMockCard({
    dataset_query: Lib.toJsQuery(initialQuery),
    visualization_settings: {
      "summary.generated_expressions": generatedExpressions,
    },
  });
  function Harness({ initialCard }: { initialCard: Card }) {
    const [card, setCard] = useState(initialCard);
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
        <SummarySidebar
          query={query}
          stageIndex={-1}
          generatedExpressions={
            question.settings()["summary.generated_expressions"]
          }
          onQueryChange={(nextQuery, generatedExpressions) => {
            savedCard = question
              .setQuery(nextQuery)
              .updateSettings({
                "summary.generated_expressions": generatedExpressions,
              })
              .card();
            setCard(savedCard);
            onQueryChange(nextQuery);
          }}
        />
      </FormulaBarSlotProvider>
    );
  }
  const { store, rerender } = renderWithProviders(
    <Harness initialCard={savedCard} />,
  );
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
    reloadQuestion: () =>
      rerender(
        <Harness
          key={1}
          initialCard={deserializeCardFromUrl(serializeCardForUrl(savedCard))}
        />,
      ),
  };
}

function getInput(wellId: SummaryWellId) {
  return screen.getByRole("textbox", {
    name:
      wellId === "values" ? "Add a value by name" : "Add a grouping by name",
  });
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

describe("summary formula handoff", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("removes only custom columns created in the grouping well after loading the question again", async () => {
    const { onQueryChange, reloadQuestion } = await setup({
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
    reloadQuestion();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Total + 10" }),
    );
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
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onQueryChange).toHaveBeenCalledTimes(3);
    const [afterClear] = onQueryChange.mock.calls[2];
    expect(Lib.breakouts(afterClear, -1)).toHaveLength(0);
    expect(Lib.expressions(afterClear, -1)).toHaveLength(1);
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
        screen.queryByTestId("summary-well-placeholder"),
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
    const { onQueryChange } = await setup();
    const input = getInput("values");
    fireEvent.change(input, { target: { value: "=" } });
    const editor = await screen.findByRole("textbox", { name: "Formula" });
    const chip = within(screen.getByTestId("summary-well-values")).getByTestId(
      "summary-well-placeholder",
    );
    expect(chip).toHaveTextContent("New formula");
    expect(
      within(screen.getByTestId("summary-well-columns")).queryByTestId(
        "summary-well-placeholder",
      ),
    ).not.toBeInTheDocument();

    const view = getEditor();
    expect(view).not.toBeNull();
    if (view) {
      await act(async () => {
        view.dispatch({
          changes: { from: 0, insert: "Sum([Total])" },
          userEvent: "input.type",
        });
      });
    }
    expect(chip).toHaveTextContent("Sum(Total)");
    await userEvent.click(getInput("columns"));
    await userEvent.click(
      within(chip).getByRole("button", {
        name: "Edit the new formula in the formula bar",
      }),
    );
    expect(editor).toHaveFocus();
    expect(getEditor()?.state.doc.toString()).toBe("Sum([Total])");

    await userEvent.click(
      within(chip).getByRole("button", { name: "Cancel the new formula" }),
    );
    await expectClosed();
    expect(
      screen.queryByTestId("summary-well-placeholder"),
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

describe("editing a formula chip", () => {
  afterEach(() => {
    jest.useRealTimers();
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

  it("updates a Group by formula and keeps its grouping, name, and ownership", async () => {
    const { onQueryChange, reloadQuestion } = await setupFormulaQuery();
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

    reloadQuestion();
    expect(getFormulaChip("Order date: Year")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Order date: Year" }),
    );
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    const [afterRemoval] = onQueryChange.mock.calls[1];
    expect(Lib.expressions(afterRemoval, -1)).toHaveLength(0);
  });

  it("keeps both groupings when the edited formula is grouped twice", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
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
