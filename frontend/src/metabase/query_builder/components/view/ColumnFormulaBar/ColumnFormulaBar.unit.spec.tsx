import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Mode } from "metabase/querying/click-actions/Mode";
import { getQueryMode } from "metabase/querying/click-actions/lib/modes";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNumericColumn,
  createMockSingleSeries,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FormulaBarSlotProvider, FormulaBarSlotTarget } from "../FormulaBar";

import { useColumnFormulaBar } from "./ColumnFormulaBar";

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

type HarnessProps = {
  question: Question;
  readOnly: boolean;
  isActive: boolean;
  withSlot: boolean;
  onQuestionChange: (question: Question) => void;
};

function Harness({
  question,
  readOnly,
  isActive,
  withSlot,
  onQuestionChange,
}: HarnessProps) {
  const { open, bar } = useColumnFormulaBar({
    question,
    readOnly,
    isActive,
    onQuestionChange,
  });
  const mode = new Mode(getQueryMode, { onAddColumn: open });
  const series = [
    createMockSingleSeries(question.card(), {
      data: {
        cols: [
          createMockNumericColumn({
            id: ORDERS.TOTAL,
            name: "TOTAL",
            display_name: "Total",
            field_ref: ["field", ORDERS.TOTAL, null],
          }),
        ],
        rows: [[10]],
      },
    }),
  ];
  return (
    <>
      {withSlot && <FormulaBarSlotTarget />}
      <Visualization rawSeries={series} mode={mode} width={600} height={400} />
      {bar}
    </>
  );
}

type SetupOpts = {
  question?: Question;
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
  question = defaultQuestion,
  readOnly = false,
  isActive = true,
  withSlot = true,
  withCompetingBar = false,
}: SetupOpts = {}) {
  setupDatabaseEndpoints(database);
  const onQuestionChange = jest.fn<void, [Question]>();
  const renderHarness = (active: boolean) => (
    <FormulaBarSlotProvider>
      <Harness
        question={question}
        readOnly={readOnly}
        isActive={active}
        withSlot={withSlot}
        onQuestionChange={onQuestionChange}
      />
      {withCompetingBar && (
        <CompetingFormulaBar onQuestionChange={onQuestionChange} />
      )}
    </FormulaBarSlotProvider>
  );
  const { rerender } = renderWithProviders(renderHarness(isActive));
  return {
    onQuestionChange,
    setActive: (active: boolean) => rerender(renderHarness(active)),
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

    expect(onQuestionChange).toHaveBeenCalledTimes(1);
    const [question] = onQuestionChange.mock.calls[0];
    const query = question.query();
    const expressions = Lib.expressions(query, -1);
    expect(expressions).toHaveLength(1);
    expect(Lib.displayInfo(query, -1, expressions[0]).displayName).toBe(
      "Total * 2",
    );
    expect(Lib.toLegacyQuery(query)).toMatchObject({
      query: {
        expressions: {
          "Total * 2": ["*", ["field", ORDERS.TOTAL, expect.anything()], 2],
        },
      },
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
              breakouts: [{ type: "column", name: "PRODUCT_ID" }],
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

    expect(onQuestionChange).toHaveBeenCalledTimes(1);
    const [nextQuestion] = onQuestionChange.mock.calls[0];
    expect(Lib.toLegacyQuery(nextQuestion.query())).toMatchObject({
      query: {
        expressions: {
          "Total * 2": ["+", 1, 2],
          "Total * 2 (1)": ["*", ["field", ORDERS.TOTAL, expect.anything()], 2],
        },
      },
    });
    await expectClosed();
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
