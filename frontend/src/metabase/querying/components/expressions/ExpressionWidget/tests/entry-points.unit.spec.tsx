jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ExpressionStep } from "metabase/querying/notebook/components/ExpressionStep/ExpressionStep";
import { createMockNotebookStep } from "metabase/querying/notebook/test-utils";
import * as Lib from "metabase-lib";
import {
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  getCompletionLabels,
  getEditorValue,
  getEditorView,
  pressKey,
  typeText,
  waitForCompletions,
  waitForHelpTextExample,
  waitForValidationDebounce,
} from "./setup";

function createOrdersQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
}

type SetupOpts = {
  query?: Lib.Query;
  database?: Database;
};

function setupExpressionStep({
  query = createOrdersQuery(),
  database = createSampleDatabase(),
}: SetupOpts = {}) {
  const step = createMockNotebookStep({ type: "expression", query });
  setupDatabaseEndpoints(database);
  renderWithProviders(
    <ExpressionStep
      step={step}
      color="background_surface-brand-strong"
      stageIndex={step.stageIndex}
      query={step.query}
      updateQuery={jest.fn()}
      isLastOpened={false}
      reportTimezone="UTC"
    />,
  );
}

function setupFilterPicker({
  query = createOrdersQuery(),
  database = createSampleDatabase(),
}: SetupOpts = {}) {
  setupDatabaseEndpoints(database);
  renderWithProviders(
    <FilterPicker query={query} stageIndex={0} onSelect={jest.fn()} />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [database] }),
      }),
    },
  );
}

function setupAggregationPicker({
  query = createOrdersQuery(),
  database = createSampleDatabase(),
}: SetupOpts = {}) {
  setupDatabaseEndpoints(database);
  renderWithProviders(
    <AggregationPicker
      query={query}
      stageIndex={0}
      operators={Lib.availableAggregationOperators(query, 0)}
      allowCustomExpressions
      onQueryChange={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [database] }),
      }),
    },
  );
}

/** Resolves with the editor content once it has the focus. */
async function findFocusedEditor() {
  await screen.findByTestId("custom-expression-query-editor");
  const content = await waitFor(() => getEditorView().contentDOM);
  await waitFor(() => expect(content).toHaveFocus());
  return content;
}

describe("ExpressionWidget > entry points > focus (metabase#54722)", () => {
  it("should focus the editor when adding a custom column", async () => {
    setupExpressionStep();

    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    expect(await findFocusedEditor()).toHaveAttribute("role", "textbox");
  });

  it("should focus the editor when opening a custom filter", async () => {
    setupFilterPicker();

    await userEvent.click(await screen.findByText("Custom Expression"));

    expect(await findFocusedEditor()).toHaveAttribute("role", "textbox");
  });

  it("should focus the editor when opening a custom aggregation", async () => {
    setupAggregationPicker();

    await userEvent.click(await screen.findByText("Custom Expression"));

    expect(await findFocusedEditor()).toHaveAttribute("role", "textbox");
  });
});

describe("ExpressionWidget > entry points > metrics (metabase#55300)", () => {
  function createOrdersQueryWithMetric() {
    const metric = createMockCard({
      id: 1,
      name: "Count",
      type: "metric",
      description: "A metric",
      table_id: ORDERS_ID,
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
          },
        ],
      }),
    });
    const database = createSampleDatabase({
      tables: [
        createOrdersTable({ metrics: [metric] }),
        createPeopleTable(),
        createProductsTable(),
        createReviewsTable(),
      ],
    });
    const provider = createMetadataProvider({
      databaseId: database.id,
      metadata: createMockMetadata({
        databases: [database],
        questions: [metric],
      }),
    });
    const query = Lib.createTestQuery(provider, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    });
    return { query, database };
  }

  it("should tell a metric from an aggregation without arguments", async () => {
    const { query, database } = createOrdersQueryWithMetric();
    setupAggregationPicker({ query, database });

    await userEvent.click(await screen.findByText("Custom Expression"));
    await findFocusedEditor();

    await typeText("Count + Count()");
    await waitForValidationDebounce();

    await pressKey("ArrowLeft", { times: 5 });
    expect(
      await screen.findByTestId("expression-helper-popover-structure"),
    ).toHaveTextContent("Count()");
    await waitForHelpTextExample();

    await pressKey("Home");
    await waitForValidationDebounce();
    expect(
      screen.queryByTestId("expression-helper-popover-structure"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "Auto-format" }),
    );
    await waitFor(() => expect(getEditorValue()).toBe("[Count] + Count()"));
  });
});

describe("ExpressionWidget > entry points > offset", () => {
  // the sample database of the e2e tests supports offset(); without the
  // feature, no mode offers it and the negative assertions would prove nothing
  function createOffsetSetup() {
    const database = createSampleDatabase({
      features: [...COMMON_DATABASE_FEATURES, "window-functions/offset"],
    });
    const provider = createMetadataProvider({
      databaseId: database.id,
      metadata: createMockMetadata({ databases: [database] }),
    });
    const query = Lib.createTestQuery(provider, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    });
    return { query, database };
  }

  /** Types the start of offset() and resolves with the offered completions. */
  async function typeOffsetPrefix() {
    await findFocusedEditor();
    // the editor offers the functions that the database supports
    await act(() => fetchMock.callHistory.flush(true));
    await typeText("Off");
    return getCompletionLabels();
  }

  async function replaceFormula(formula: string) {
    await pressKey("Backspace", { times: getEditorValue().length });
    await typeText(formula);
    await pressKey("Tab");
    await waitForValidationDebounce();
  }

  it("should not suggest or accept offset() in a custom filter", async () => {
    setupFilterPicker(createOffsetSetup());
    await userEvent.click(await screen.findByText("Custom Expression"));

    expect(await typeOffsetPrefix()).not.toContain("Offset");

    await replaceFormula("Offset([Total], -1) > 0");
    expect(
      await screen.findByText("OFFSET is not supported in custom filters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("custom-expression-query-editor"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Custom Expression")).toBeInTheDocument();
  });

  it("should not suggest or accept offset() in a custom column", async () => {
    setupExpressionStep(createOffsetSetup());
    await userEvent.click(screen.getByRole("img", { name: "add icon" }));

    expect(await typeOffsetPrefix()).not.toContain("Offset");

    await replaceFormula("Offset([Total], -1)");
    expect(
      await screen.findByText("OFFSET is not supported in custom columns"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("custom-expression-query-editor"),
      ).not.toBeInTheDocument(),
    );
  });

  it("should suggest and accept offset() in a custom aggregation once it has a name", async () => {
    setupAggregationPicker(createOffsetSetup());
    await userEvent.click(await screen.findByText("Custom Expression"));

    await typeOffsetPrefix();
    expect(await waitForCompletions()).toContain("Offset");

    await replaceFormula("Offset(Sum([Total]), -1)");
    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeDisabled();
    expect(
      screen.queryByText(/OFFSET is not supported/),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByTestId("expression-name"),
      "My expression",
    );
    expect(doneButton).toBeEnabled();
  });
});
