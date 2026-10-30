import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { diagnoseAndCompile } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { FormulaBarSlotProvider, FormulaBarSlotTarget } from "../FormulaBar";

import { SummaryWells } from "./SummaryWells";
import type { SummaryBase, SummaryDefinition } from "./types";
import {
  addCountValue,
  addExpressionValue,
  buildSummaryQuery,
  getItemLabels,
  getSummaryBase,
} from "./utils";

// the real editor, since Tab is handled by its own key handling, which the shared mock doesn't have
jest.unmock("@uiw/react-codemirror");

function createBase(): SummaryBase {
  return getSummaryBase(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  );
}

function addFormulaValue(
  base: SummaryBase,
  definition: SummaryDefinition,
  name: string,
  source: string,
): SummaryDefinition {
  const { query, stageIndex } = base;
  const { expressionClause } = diagnoseAndCompile({
    source,
    expressionMode: "aggregation",
    query,
    stageIndex,
    database: SAMPLE_DATABASE,
    availableColumns: Lib.aggregableColumns(query, stageIndex),
  });
  if (expressionClause == null) {
    throw new Error(`Could not compile ${source}`);
  }
  return addExpressionValue(definition, { name, clause: expressionClause });
}

type SummaryWellsHarnessProps = {
  base: SummaryBase;
  initialDefinition: SummaryDefinition;
};

function SummaryWellsHarness({
  base,
  initialDefinition,
}: SummaryWellsHarnessProps) {
  const [definition, setDefinition] = useState(initialDefinition);
  const summaryQuery = buildSummaryQuery(base, definition);
  return (
    <FormulaBarSlotProvider>
      <FormulaBarSlotTarget />
      <SummaryWells
        base={base}
        definition={definition}
        summaryQuery={summaryQuery}
        itemLabels={getItemLabels(base, definition, summaryQuery)}
        draggedItem={null}
        onChange={setDefinition}
      />
    </FormulaBarSlotProvider>
  );
}

type SetupOpts = {
  /** Formula values after the starting count, as `[name, source]`. */
  formulas?: [string, string][];
};

function setup({ formulas = [] }: SetupOpts = {}) {
  setupDatabaseEndpoints(createSampleDatabase());
  const base = createBase();
  const definition = formulas.reduce(
    (definition, [name, source]) =>
      addFormulaValue(base, definition, name, source),
    addCountValue({ rows: [], columns: [], values: [] }),
  );
  renderWithProviders(
    <SummaryWellsHarness base={base} initialDefinition={definition} />,
  );
}

const getValuesField = () => screen.getByTestId("summary-well-input-values");

const getFormulaChip = (name: string) =>
  screen.getByRole("button", { name: `Edit the formula of ${name}` });

function getFormulaView(): EditorView {
  const view = EditorView.findFromDOM(
    screen.getByTestId("summary-formula-bar"),
  );
  if (view == null) {
    throw new Error("The formula bar has no editor");
  }
  return view;
}

/** The formula in the bar, with `|` where the caret is. */
function getFormula(): string {
  const { doc, selection } = getFormulaView().state;
  const head = selection.main.head;
  return `${doc.sliceString(0, head)}|${doc.sliceString(head)}`;
}

// jsdom can't type into the editor's contenteditable, so this makes the edit typing would
async function typeInFormula(text: string) {
  const view = getFormulaView();
  const end = view.state.doc.length;
  await act(async () => {
    view.dispatch({
      changes: { from: end, insert: text },
      selection: { anchor: end + text.length },
      userEvent: "input.type",
    });
  });
}

async function clearFormula() {
  const view = getFormulaView();
  await act(async () => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length },
      userEvent: "delete",
    });
  });
}

async function waitForFormula(formula: string) {
  await waitFor(() => expect(getFormula()).toBe(formula));
  expect(getFormulaView().hasFocus).toBe(true);
}

async function waitForFormulaBarToClose() {
  await waitFor(() =>
    expect(screen.queryByTestId("summary-formula-bar")).not.toBeInTheDocument(),
  );
}

describe("SummaryWells", () => {
  it("opens with the first well's field ready to type into", async () => {
    setup();

    await waitFor(() => expect(getValuesField()).toHaveFocus());
  });

  describe("focus after a formula closes", () => {
    it("goes back to the well's field once a new formula is added", async () => {
      setup();
      await userEvent.type(getValuesField(), "=");
      await waitForFormula("|");
      await typeInFormula("Count()");

      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(getFormulaChip("Count()")).toBeInTheDocument();
      expect(getValuesField()).toHaveFocus();
      await waitForFormulaBarToClose();
      expect(getValuesField()).toHaveFocus();
    });

    it("goes back to the well's field on Tab in a new formula that's still empty, like Esc", async () => {
      setup();
      await userEvent.type(getValuesField(), "=");
      await waitForFormula("|");

      await userEvent.tab();

      expect(getValuesField()).toHaveFocus();
      await waitForFormulaBarToClose();
      expect(
        screen.queryByTestId("summary-well-placeholder"),
      ).not.toBeInTheDocument();
    });

    it("goes back to the well's field on Tab in a formula that was emptied, leaving the item as it was", async () => {
      setup({ formulas: [["Revenue", "Sum([Total])"]] });
      await userEvent.click(getValuesField());
      await userEvent.tab({ shift: true });
      await waitForFormula("Sum([Total])|");
      await clearFormula();

      await userEvent.tab({ shift: true });

      expect(getValuesField()).toHaveFocus();
      await waitForFormulaBarToClose();
      expect(getFormulaChip("Revenue")).toBeInTheDocument();
    });

    it("goes back to the well's field once a new formula is cancelled", async () => {
      setup();
      await userEvent.type(getValuesField(), "=");
      await waitForFormula("|");

      await userEvent.click(
        screen.getByRole("button", { name: "Cancel formula" }),
      );

      await waitForFormulaBarToClose();
      expect(getValuesField()).toHaveFocus();
    });
  });

  describe("tabbing through formulas", () => {
    const formulas: [string, string][] = [
      ["Revenue", "Sum([Total])"],
      ["Average order", "Average([Total])"],
    ];

    it("opens a well's last formula in the formula bar on Shift+Tab from its field, with the caret at the end", async () => {
      setup({ formulas });
      await userEvent.click(getValuesField());

      await userEvent.tab({ shift: true });

      await waitFor(() => expect(getFormula()).toBe("Average([Total])|"));
      expect(getFormulaView().hasFocus).toBe(true);
    });

    it("steps through a well's formulas from the formula bar, then back to its field", async () => {
      setup({ formulas });
      await userEvent.click(getValuesField());
      await userEvent.tab({ shift: true });
      await waitForFormula("Average([Total])|");

      await userEvent.tab({ shift: true });
      await waitForFormula("Sum([Total])|");

      await userEvent.tab();
      await waitForFormula("Average([Total])|");

      await userEvent.tab();
      expect(getValuesField()).toHaveFocus();
      await waitForFormulaBarToClose();
    });

    it("steps back to values that aren't custom formulas, like the starting count", async () => {
      setup({ formulas });
      await userEvent.click(getValuesField());
      await userEvent.tab({ shift: true });
      await waitForFormula("Average([Total])|");
      await userEvent.tab({ shift: true });
      await waitForFormula("Sum([Total])|");

      await userEvent.tab({ shift: true });

      await waitFor(() => expect(getFormula()).toBe("Count()|"));
      expect(getFormulaView().hasFocus).toBe(true);
    });

    it("commits a changed formula before moving on", async () => {
      setup({ formulas });
      await userEvent.click(getValuesField());
      await userEvent.tab({ shift: true });
      await waitForFormula("Average([Total])|");
      await typeInFormula(" * 2");

      await userEvent.tab();

      expect(getValuesField()).toHaveFocus();
      expect(getFormulaChip("Average(Total) * 2")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Edit the formula of Average order",
        }),
      ).not.toBeInTheDocument();
    });

    it("stays on a changed formula that doesn't compile, showing why", async () => {
      setup({ formulas });
      await userEvent.click(getValuesField());
      await userEvent.tab({ shift: true });
      await waitForFormula("Average([Total])|");
      await typeInFormula(" +");

      await userEvent.tab();

      expect(getFormula()).toBe("Average([Total]) +|");
      expect(getFormulaView().hasFocus).toBe(true);
      expect(screen.getByTestId("summary-formula-error")).toBeInTheDocument();
      expect(getFormulaChip("Average order")).toBeInTheDocument();
    });

    it("leaves Shift+Tab to the browser in a well with nothing to open in the formula bar", async () => {
      setup();
      const groupByField = screen.getByTestId("summary-well-input-columns");
      await userEvent.click(groupByField);

      await userEvent.tab({ shift: true });

      expect(groupByField).not.toHaveFocus();
      expect(
        screen.queryByTestId("summary-formula-bar"),
      ).not.toBeInTheDocument();
    });
  });
});
