import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Mode } from "metabase/querying/click-actions/Mode";
import { getQueryMode } from "metabase/querying/click-actions/lib/modes";
import { format } from "metabase/querying/expressions";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Database,
  DatasetColumn,
  RowValues,
  TestNamedExpressionSpec,
} from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockCategoryColumn,
  createMockColumn,
  createMockNumericColumn,
  createMockSingleSeries,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FormulaBarSlotProvider, FormulaBarSlotTarget } from "../FormulaBar";

import type { ColumnFormulaChange } from "./types";
import { useColumnFormulaBar } from "./use-column-formula-bar";

jest.unmock("@uiw/react-codemirror");

registerVisualizations();

beforeAll(async () => {
  mockGetBoundingClientRect();
  await loadVisualizationComponents(["table"]);
});

const database = createSampleDatabase();
const metadata = createMockMetadata({ databases: [database] });
const defaultQuestion = new Question(
  createMockUnsavedCard({
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    }),
  }),
  metadata,
);
const defaultColumns = [
  createMockNumericColumn({
    id: ORDERS.TOTAL,
    name: "TOTAL",
    display_name: "Total",
    field_ref: ["field", ORDERS.TOTAL, null],
  }),
];

type HarnessProps = {
  question: Question;
  columns: DatasetColumn[];
  rows: RowValues[];
  readOnly: boolean;
  isActive: boolean;
  withSlot: boolean;
  onQuestionChange: (question: Question, change: ColumnFormulaChange) => void;
  onEditSummaryFormula: (expression: Lib.ExpressionClause) => void;
};

function Harness({
  question,
  columns,
  rows,
  readOnly,
  isActive,
  withSlot,
  onQuestionChange,
  onEditSummaryFormula,
}: HarnessProps) {
  const { open, mapClickActions, bar } = useColumnFormulaBar({
    question,
    readOnly,
    isActive,
    onQuestionChange,
    onEditSummaryFormula,
  });
  const mode = new Mode(getQueryMode, {
    onAddColumn: open,
    mapActions: mapClickActions,
  });
  const series = [
    createMockSingleSeries(question.card(), {
      data: { cols: columns, rows },
    }),
  ];
  return (
    <>
      {withSlot && <FormulaBarSlotTarget />}
      <Visualization
        rawSeries={series}
        mode={mode}
        width={600}
        height={400}
        onChangeCardAndRun={jest.fn()}
      />
      {bar}
    </>
  );
}

type SetupOpts = {
  apiDatabase?: Database;
  question?: Question;
  columns?: DatasetColumn[];
  rows?: RowValues[];
  readOnly?: boolean;
  isActive?: boolean;
  withSlot?: boolean;
  withCompetingBar?: boolean;
};

function CompetingFormulaBar({
  onQuestionChange,
}: Pick<HarnessProps, "onQuestionChange">) {
  const { open, bar } = useColumnFormulaBar({
    question: defaultQuestion,
    onQuestionChange,
  });
  return (
    <>
      <button onClick={open}>Open another formula</button>
      {bar}
    </>
  );
}

function setup({
  apiDatabase = database,
  question = defaultQuestion,
  columns = defaultColumns,
  rows = [[10]],
  readOnly = false,
  isActive = true,
  withSlot = true,
  withCompetingBar = false,
}: SetupOpts = {}) {
  setupDatabaseEndpoints(apiDatabase);
  const onQuestionChange = jest.fn<void, [Question, ColumnFormulaChange]>();
  const onEditSummaryFormula = jest.fn<void, [Lib.ExpressionClause]>();
  const renderHarness = (active: boolean, currentQuestion = question) => (
    <FormulaBarSlotProvider>
      <Harness
        question={currentQuestion}
        columns={columns}
        rows={rows}
        readOnly={readOnly}
        isActive={active}
        withSlot={withSlot}
        onQuestionChange={onQuestionChange}
        onEditSummaryFormula={onEditSummaryFormula}
      />
      {withCompetingBar && (
        <CompetingFormulaBar onQuestionChange={onQuestionChange} />
      )}
    </FormulaBarSlotProvider>
  );
  const { rerender } = renderWithProviders(renderHarness(isActive), {
    storeInitialState: createMockState({
      entities: createMockEntitiesState({ databases: [database] }),
    }),
  });
  return {
    onQuestionChange,
    onEditSummaryFormula,
    setActive: (active: boolean) => rerender(renderHarness(active)),
    setQuestion: (nextQuestion: Question) =>
      rerender(renderHarness(isActive, nextQuestion)),
  };
}

async function openFormula(source = "") {
  await userEvent.click(screen.getByRole("button", { name: "Add column" }));
  const editor = await screen.findByTestId("formula-editor");
  const textbox = await within(editor).findByRole("textbox");
  const view = EditorView.findFromDOM(editor);
  expect(view).not.toBeNull();
  if (view) {
    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: source },
        selection: { anchor: source.length },
        userEvent: "input.type",
      });
    });
  }
  return { textbox, view };
}

async function expectClosed() {
  await waitFor(() => {
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
  });
}

describe("column formula bar", () => {
  it("opens from the table even without column shortcuts and adds a named custom column", async () => {
    const { onQuestionChange } = setup();
    const trigger = screen.getByRole("button", { name: "Add column" });
    const { textbox } = await openFormula("[Total] * 2");

    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onQuestionChange).toHaveBeenCalledTimes(1));
    const [question, change] = onQuestionChange.mock.calls[0];
    expect(change).toEqual({ isNewColumn: true });
    const query = question.query();
    const expressions = Lib.expressions(query, -1);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(query, -1, expressions[0]).displayName).toBe(
      "Total * 2",
    );
    expect(Lib.toJsQuery(query)).toMatchObject({
      stages: [
        {
          expressions: [
            [
              "*",
              expect.objectContaining({ "lib/expression-name": "Total * 2" }),
              ["field", expect.anything(), ORDERS.TOTAL],
              2,
            ],
          ],
        },
      ],
    });
    await expectClosed();
    expect(trigger).toHaveFocus();
  });

  it("adds the custom column after an aggregation stage", async () => {
    const question = new Question(
      createMockUnsavedCard({
        dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
            },
          ],
        }),
      }),
      metadata,
    );
    const { onQuestionChange } = setup({ question });
    await openFormula("[Count] + 1");
    await userEvent.click(
      within(screen.getByTestId("formula-editor")).getByRole("button", {
        name: "Add column",
      }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onQuestionChange).toHaveBeenCalledTimes(1);
    const [nextQuestion] = onQuestionChange.mock.calls[0];
    const query = nextQuestion.query();
    expect(Lib.stageCount(query)).toBe(2);
    expect(Lib.aggregations(query, 0)).toHaveLength(1);
    expect(Lib.expressions(query, 0)).toHaveLength(0);
    expect(Lib.expressions(query, -1)).toHaveLength(1);
    expect(
      Lib.returnedColumns(query, -1).map(
        (column) => Lib.displayInfo(query, -1, column).displayName,
      ),
    ).toEqual(["Count", "Count + 1"]);
    await expectClosed();
  });

  it("keeps the current draft on repeated clicks and resets it after Cancel", async () => {
    const { onQuestionChange } = setup();
    const trigger = screen.getByRole("button", { name: "Add column" });
    const { textbox, view } = await openFormula("1 + 2");
    await userEvent.click(trigger);
    expect(view?.state.doc.toString()).toBe("1 + 2");
    expect(textbox).toHaveFocus();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel formula" }),
    );
    await expectClosed();
    expect(onQuestionChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    const nextEditor = await openFormula();
    expect(nextEditor.view?.state.doc.toString()).toBe("");
    expect(nextEditor.textbox).toHaveFocus();
  });

  it("does not offer the formula bar for read-only queries", () => {
    setup({ readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Add column" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer the formula bar for native queries", () => {
    setup({
      question: new Question(
        createMockUnsavedCard({
          dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
            query: "select * from orders",
          }),
        }),
        metadata,
      ),
    });
    expect(
      screen.queryByRole("button", { name: "Add column" }),
    ).not.toBeInTheDocument();
  });

  it("keeps an existing expression when the new formula has the same name", async () => {
    const question = defaultQuestion.setQuery(
      Lib.expression(
        defaultQuestion.query(),
        -1,
        "Total * 2",
        Lib.expressionClause("+", [1, 2]),
      ),
    );
    const { onQuestionChange } = setup({ question });
    const { textbox } = await openFormula("[Total] * 2");
    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onQuestionChange).toHaveBeenCalledTimes(1));
    const [nextQuestion] = onQuestionChange.mock.calls[0];
    expect(Lib.toJsQuery(nextQuestion.query())).toMatchObject({
      stages: [
        {
          expressions: [
            [
              "+",
              expect.objectContaining({ "lib/expression-name": "Total * 2" }),
              1,
              2,
            ],
            [
              "*",
              expect.objectContaining({
                "lib/expression-name": "Total * 2 (1)",
              }),
              ["field", expect.anything(), ORDERS.TOTAL],
              2,
            ],
          ],
        },
      ],
    });
    await expectClosed();
  });

  it("flags a function the database doesn't support and keeps the draft open", async () => {
    const source = 'regexExtract([Product → Category], "^W")';
    const { onQuestionChange } = setup({
      apiDatabase: createSampleDatabase({
        features: COMMON_DATABASE_FEATURES.filter((name) => name !== "regex"),
      }),
    });
    const { textbox, view } = await openFormula(source);

    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unsupported function regexExtract",
    );
    expect(view?.state.doc.toString()).toBe(source);
    expect(onQuestionChange).not.toHaveBeenCalled();
  });

  it("discards the draft when the query builder leaves view mode", async () => {
    const { setActive, onQuestionChange } = setup();
    await openFormula("[Total] * 2");
    setActive(false);
    await expectClosed();
    expect(onQuestionChange).not.toHaveBeenCalled();

    setActive(true);
    const { view } = await openFormula();
    expect(view?.state.doc.toString()).toBe("");
  });

  it("discards the displaced draft when another caller opens the formula bar", async () => {
    const { onQuestionChange } = setup({ withCompetingBar: true });
    const columnTrigger = screen.getByRole("button", { name: "Add column" });
    const { textbox: firstTextbox } = await openFormula("[Total] * 2");

    await userEvent.click(
      screen.getByRole("button", { name: "Open another formula" }),
    );

    const secondTextbox = screen.getByRole("textbox", { name: "Formula" });
    expect(secondTextbox).toHaveFocus();
    expect(EditorView.findFromDOM(secondTextbox)?.state.doc.toString()).toBe(
      "",
    );
    await waitFor(() => expect(firstTextbox).not.toBeInTheDocument());

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel formula" }),
    );
    await expectClosed();

    await userEvent.click(
      screen.getByRole("button", { name: "Open another formula" }),
    );
    const nextTextbox = screen.getByRole("textbox", { name: "Formula" });
    await userEvent.click(columnTrigger);

    const reopenedTextbox = screen.getByRole("textbox", { name: "Formula" });
    expect(reopenedTextbox).toHaveFocus();
    expect(EditorView.findFromDOM(reopenedTextbox)?.state.doc.toString()).toBe(
      "",
    );
    await waitFor(() => expect(nextTextbox).not.toBeInTheDocument());
    expect(onQuestionChange).not.toHaveBeenCalled();
  });

  it("does not offer the formula bar for archived questions", () => {
    setup({
      question: new Question(
        createMockCard({
          dataset_query: defaultQuestion.datasetQuery(),
          archived: true,
        }),
        metadata,
      ),
    });
    expect(
      screen.queryByRole("button", { name: "Add column" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer the formula bar without a header slot", () => {
    setup({ withSlot: false });
    expect(
      screen.queryByRole("button", { name: "Add column" }),
    ).not.toBeInTheDocument();
  });
});

const CATEGORY_COLUMN = createMockCategoryColumn({
  id: PRODUCTS.CATEGORY,
  name: "CATEGORY",
  display_name: "Category",
  source: "fields",
  table_id: PRODUCTS_ID,
  field_ref: ["field", PRODUCTS.CATEGORY, null],
});
const GENERATED_NAME = 'concat(Category, "!")';

function getCustomColumnSpec(name: string): TestNamedExpressionSpec {
  return {
    name,
    value: {
      type: "operator",
      operator: "concat",
      args: [
        { type: "column", name: "CATEGORY" },
        { type: "literal", value: "!" },
      ],
    },
  };
}

function createCustomColumn(name: string, source: string) {
  return createMockColumn({
    id: undefined,
    table_id: undefined,
    name,
    display_name: name,
    source,
    base_type: "type/Text",
    effective_type: "type/Text",
    field_ref: ["expression", name],
  });
}

function setupCustomColumn({
  name = GENERATED_NAME,
  withCompetingBar = false,
}: {
  name?: string;
  withCompetingBar?: boolean;
} = {}) {
  const question = new Question(
    createMockUnsavedCard({
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: PRODUCTS_ID },
            expressions: [getCustomColumnSpec(name)],
          },
        ],
      }),
    }),
    metadata,
  );
  return {
    question,
    ...setup({
      question,
      columns: [CATEGORY_COLUMN, createCustomColumn(name, "fields")],
      rows: [["Gizmo", "Gizmo!"]],
      withCompetingBar,
    }),
  };
}

async function openHeaderActions(columnName: string) {
  const header = screen.getByRole("columnheader", { name: columnName });
  const clickTarget = within(header).getByTestId("cell-data");
  fireEvent.mouseDown(clickTarget, { clientX: 0, clientY: 0 });
  fireEvent.mouseUp(clickTarget, { clientX: 0, clientY: 0 });
  return screen.findByTestId("click-actions-view");
}

async function editFormulaFromHeader(columnName: string) {
  const actions = await openHeaderActions(columnName);
  await userEvent.click(within(actions).getByText("Edit formula"));
  const editor = await screen.findByTestId("formula-editor");
  const textbox = await within(editor).findByRole("textbox");
  return { textbox, view: EditorView.findFromDOM(editor) };
}

async function replaceFormula(view: EditorView | null, source: string) {
  expect(view).not.toBeNull();
  if (view) {
    await act(async () => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        selection: { anchor: source.length },
        userEvent: "input.type",
      });
    });
  }
}

describe("editing a custom column from its header", () => {
  it("offers Edit formula on a custom column", async () => {
    setupCustomColumn();
    const columnActions = await openHeaderActions("Category");
    expect(within(columnActions).getByText("Combine columns")).toBeVisible();
    expect(
      within(columnActions).queryByText("Edit formula"),
    ).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("click-actions-view"),
      ).not.toBeInTheDocument(),
    );

    const customColumnActions = await openHeaderActions(GENERATED_NAME);
    expect(within(customColumnActions).getByText("Edit formula")).toBeVisible();
    expect(
      within(customColumnActions).queryByText("Combine columns"),
    ).not.toBeInTheDocument();
  });

  it("opens the formula with the caret at its end and renames a generated name after the new formula", async () => {
    const { onQuestionChange } = setupCustomColumn();
    const { textbox, view } = await editFormulaFromHeader(GENERATED_NAME);

    expect(view?.state.doc.toString()).toBe('concat([Category], "!")');
    expect(view?.state.selection.main.head).toBe(view?.state.doc.length);
    expect(textbox).toHaveFocus();

    await replaceFormula(view, 'concat([Category], "?")');
    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onQuestionChange).toHaveBeenCalledTimes(1));
    const [nextQuestion, change] = onQuestionChange.mock.calls[0];
    expect(change).toEqual({ isNewColumn: false });
    expect(Lib.expressions(nextQuestion.query(), -1)).toHaveLength(1);
    expect(Lib.toJsQuery(nextQuestion.query())).toMatchObject({
      stages: [
        {
          expressions: [
            [
              "concat",
              expect.objectContaining({
                "lib/expression-name": 'concat(Category, "?")',
              }),
              ["field", expect.anything(), PRODUCTS.CATEGORY],
              "?",
            ],
          ],
        },
      ],
    });
    await expectClosed();
  });

  it("keeps a custom name when the formula changes", async () => {
    const { onQuestionChange } = setupCustomColumn({
      name: "Excited category",
    });
    const { textbox, view } = await editFormulaFromHeader("Excited category");

    await replaceFormula(view, 'concat([Category], "?")');
    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onQuestionChange).toHaveBeenCalledTimes(1));
    const [nextQuestion] = onQuestionChange.mock.calls[0];
    expect(Lib.toJsQuery(nextQuestion.query())).toMatchObject({
      stages: [
        {
          expressions: [
            [
              "concat",
              expect.objectContaining({
                "lib/expression-name": "Excited category",
              }),
              ["field", expect.anything(), PRODUCTS.CATEGORY],
              "?",
            ],
          ],
        },
      ],
    });
  });

  it("leaves the question unchanged when the formula is submitted as it was", async () => {
    const { onQuestionChange } = setupCustomColumn();
    const { textbox } = await editFormulaFromHeader(GENERATED_NAME);

    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    await expectClosed();
    expect(onQuestionChange).not.toHaveBeenCalled();
  });

  it("closes the bar when the edited custom column leaves the query", async () => {
    const { question, setQuestion, onQuestionChange } = setupCustomColumn();
    await editFormulaFromHeader(GENERATED_NAME);

    const [expression] = Lib.expressions(question.query(), -1);
    setQuestion(
      question.setQuery(Lib.removeClause(question.query(), -1, expression)),
    );
    await expectClosed();

    setQuestion(question);
    const actions = await openHeaderActions(GENERATED_NAME);
    expect(within(actions).getByText("Edit formula")).toBeVisible();
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
    expect(onQuestionChange).not.toHaveBeenCalled();
  });

  it("keeps a formula opened elsewhere while the edited formula loads", async () => {
    const { question } = setupCustomColumn({ withCompetingBar: true });
    const actions = await openHeaderActions(GENERATED_NAME);

    fireEvent.click(within(actions).getByText("Edit formula"));
    fireEvent.click(
      screen.getByRole("button", { name: "Open another formula" }),
    );
    // the edited formula finishes printing before this second print does
    const [expression] = Lib.expressions(question.query(), -1);
    await act(() =>
      format(expression, { query: question.query(), stageIndex: -1 }),
    );

    const textbox = screen.getByRole("textbox", { name: "Formula" });
    expect(textbox).toHaveFocus();
    expect(EditorView.findFromDOM(textbox)?.state.doc.toString()).toBe("");
    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();
  });

  it("offers Edit formula on a custom column with a long name", async () => {
    const name =
      "Category of the product with an exclamation mark added at its end";
    setupCustomColumn({ name });

    const actions = await openHeaderActions(name);
    expect(within(actions).getByText("Edit formula")).toBeVisible();
  });

  it("keeps the usual header actions of a summary column", async () => {
    const question = new Question(
      createMockUnsavedCard({
        dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: ORDERS_ID },
              aggregations: [{ type: "operator", operator: "count" }],
            },
          ],
        }),
      }),
      metadata,
    );
    setup({
      question,
      columns: [
        createMockNumericColumn({
          id: undefined,
          table_id: undefined,
          name: "count",
          display_name: "Count",
          source: "aggregation",
          field_ref: ["aggregation", 0],
        }),
      ],
      rows: [[18760]],
    });

    const actions = await openHeaderActions("Count");
    expect(within(actions).getByText("Filter by this column")).toBeVisible();
    expect(within(actions).queryByText("Edit formula")).not.toBeInTheDocument();
  });

  it("offers Edit formula on a Group by formula and asks to open it in the summary", async () => {
    const question = new Question(
      createMockUnsavedCard({
        dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
          stages: [
            {
              source: { type: "table", id: PRODUCTS_ID },
              expressions: [getCustomColumnSpec(GENERATED_NAME)],
              aggregations: [{ type: "operator", operator: "count" }],
              breakouts: [{ type: "column", name: GENERATED_NAME }],
            },
          ],
        }),
      }),
      metadata,
    );
    const { onEditSummaryFormula } = setup({
      question,
      columns: [createCustomColumn(GENERATED_NAME, "breakout")],
      rows: [["Gizmo!"]],
    });

    const actions = await openHeaderActions(GENERATED_NAME);
    expect(
      within(actions).queryByText("Combine columns"),
    ).not.toBeInTheDocument();
    await userEvent.click(within(actions).getByText("Edit formula"));

    const [expression] = Lib.expressions(question.query(), -1);
    expect(onEditSummaryFormula).toHaveBeenCalledTimes(1);
    const [clause] = onEditSummaryFormula.mock.calls[0];
    expect(Lib.isSameClause(clause, expression)).toBe(true);
  });
});

function setupTracking() {
  return jest.spyOn(Analytics, "trackSimpleEvent").mockClear();
}

describe("column formula bar analytics", () => {
  it("tracks a new column, from the Add column button to adding it", async () => {
    const trackSimpleEvent = setupTracking();
    const { onQuestionChange } = setup();
    const trigger = screen.getByRole("button", { name: "Add column" });
    const { textbox } = await openFormula("[Total] * 2");
    await userEvent.click(trigger);

    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(onQuestionChange).toHaveBeenCalledTimes(1));

    expect(trackSimpleEvent.mock.calls).toEqual([
      [
        {
          event: "formula_bar_opened",
          triggered_from: "table",
          event_detail: "add_column_button",
        },
      ],
      [
        {
          event: "formula_bar_submitted",
          triggered_from: "table",
          event_detail: "new",
          result: "success",
        },
      ],
    ]);
  });

  it("tracks a formula edited from its column header", async () => {
    const trackSimpleEvent = setupTracking();
    const { onQuestionChange } = setupCustomColumn();
    const { textbox, view } = await editFormulaFromHeader(GENERATED_NAME);

    await replaceFormula(view, 'concat([Category], "?")');
    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(onQuestionChange).toHaveBeenCalledTimes(1));

    expect(trackSimpleEvent.mock.calls).toEqual([
      [
        {
          event: "formula_bar_opened",
          triggered_from: "table",
          event_detail: "column_header",
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
