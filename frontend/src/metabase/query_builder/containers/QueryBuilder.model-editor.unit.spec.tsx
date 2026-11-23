import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";
import type * as ReactModule from "react";

import { createMockMetadata } from "__support__/metadata";
import {
  setupAdhocQueryEndpoint,
  setupCardQueryMetadataEndpoint,
  setupModelActionsEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupRevisionsEndpoints,
} from "__support__/server-mocks";
import { act, cleanup, screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  Field,
  RowValue,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockResultsMetadata,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersTableDatasetColumns,
  createOrdersTotalDatasetColumn,
  createProductsTableDatasetColumns,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import { EDITOR_TAB_INDEXES } from "../components/DatasetEditor/constants";

import { setup, waitForSaveChangesToBeEnabled } from "./test-utils";

registerVisualizations();

const toResultMetadata = (columns: DatasetColumn[]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  columns as unknown as Field[];

const fromResultMetadata = (metadata: Card["result_metadata"]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  metadata as unknown as DatasetColumn[] | null;

// The global mock of NativeQueryEditor has no run button. The real editor
// runs here, and only CodeMirror, which needs a layout, is a plain textarea.
jest.unmock("metabase/querying/components/NativeQueryEditor");
jest.mock("metabase/common/components/CodeMirror", () => {
  const { forwardRef } = jest.requireActual<typeof ReactModule>("react");
  return {
    ...jest.requireActual("metabase/common/components/CodeMirror"),
    CodeMirror: forwardRef(function MockCodeMirror(
      props: { value?: string; onChange?: (value: string) => void },
      _ref,
    ) {
      return (
        <textarea
          data-testid="mock-code-mirror"
          value={props.value}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    }),
  };
});

const ORDERS_COLUMNS: DatasetColumn[] = createOrdersTableDatasetColumns().map(
  (column) => ({
    ...column,
    description: `${column.display_name} description`,
    semantic_type: ["SUBTOTAL", "TAX", "TOTAL"].includes(column.name)
      ? null
      : column.semantic_type,
  }),
);

const ORDERS_ROWS: RowValue[][] = [
  [1, 1, 14, 37.65, 2.07, 39.72, null, "2025-02-11T21:40:27.892Z", 2],
  [2, 1, 123, 110.93, 6.1, 117.03, null, "2024-05-15T08:04:04.580Z", 3],
  [3, 1, 105, 52.72, 2.9, 49.21, 6.42, "2025-12-06T22:22:48.544Z", 2],
  [4, 1, 94, 109.22, 6.01, 115.23, null, "2026-08-22T16:30:42.392Z", 6],
  [5, 1, 132, 127.88, 7.03, 134.91, null, "2025-05-23T10:46:03.625Z", 5],
];

const COUNT_COLUMN = createMockColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  field_ref: ["aggregation", 0],
});

function createOrdersDataset(rows = ORDERS_ROWS, cols = ORDERS_COLUMNS) {
  return createMockDataset({
    data: { rows, cols },
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: rows.length,
  });
}

const GUI_MODEL: Card = createMockCard({
  id: 10,
  name: "GUI Model",
  type: "model",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID }, limit: 5 }],
    }),
  ),
  result_metadata: toResultMetadata(ORDERS_COLUMNS),
});

const ORDERS_MODEL: Card = createMockCard({
  id: 11,
  name: "Orders Model",
  type: "model",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    }),
  ),
  result_metadata: toResultMetadata(ORDERS_COLUMNS),
});

const NATIVE_ORDERS_COLUMNS: DatasetColumn[] = ORDERS_COLUMNS.map((column) =>
  createMockColumn({
    name: column.name,
    display_name: column.name,
    base_type: column.base_type,
    effective_type: column.effective_type,
    source: "native",
    field_ref: [
      "field",
      column.name,
      { "base-type": checkNotNull(column.base_type) },
    ],
  }),
);

function createNativeModel(opts: { id: number; name: string; query: string }) {
  return createMockCard({
    id: opts.id,
    name: opts.name,
    type: "model",
    display: "table",
    dataset_query: Lib.toJsQuery(
      Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query: opts.query }),
    ),
  });
}

const SYNTAX_ERROR =
  'Syntax error in SQL statement "SELECT 1 FROM[*]"; expected "identifier"';

/** A tiny stand-in for the QP on the Orders rows, for native queries */
function runNativeOrdersQuery(query: unknown): Dataset {
  const sql = getNativeQuery(query) ?? "";
  const limit = sql.match(/^SELECT \* FROM orders limit (\d+)$/i)?.[1];
  if (limit != null) {
    return createOrdersDataset(
      ORDERS_ROWS.slice(0, Number(limit)),
      NATIVE_ORDERS_COLUMNS,
    );
  }
  if (sql === "SELECT 1") {
    return createMockDataset({
      data: {
        cols: [
          createMockColumn({
            name: "1",
            display_name: "1",
            source: "native",
            base_type: "type/Integer",
            field_ref: ["field", "1", { "base-type": "type/Integer" }],
          }),
        ],
        rows: [[1]],
      },
      row_count: 1,
    });
  }
  return createMockDataset({
    status: "failed",
    error: SYNTAX_ERROR,
    error_type: "invalid-query",
    data: { rows: [], cols: [] },
  });
}

type QueryRunner = (query: unknown) => Dataset;

function getFirstStage(query: unknown): Record<string, unknown> {
  const stages = isObject(query) ? query.stages : undefined;
  const [stage] = Array.isArray(stages) ? stages : [];
  return isObject(stage) ? stage : {};
}

function getNativeQuery(query: unknown): string | undefined {
  const { native } = getFirstStage(query);
  return typeof native === "string" ? native : undefined;
}

function parseBody(call: CallLog): unknown {
  return JSON.parse(String(call.options.body));
}

/** As the backend does, a model's own metadata wins over the query's */
function withModelMetadata(
  dataset: Dataset,
  modelMetadata: DatasetColumn[] | null,
): Dataset {
  const cols = dataset.data.cols.map((column) => ({
    ...column,
    ...modelMetadata?.find((field) => field.name === column.name),
  }));
  return {
    ...dataset,
    data: {
      ...dataset.data,
      cols,
      results_metadata: createMockResultsMetadata(toResultMetadata(cols)),
    },
  };
}

/**
 * Keeps the rows that match the `=` filters of an outer query on a model, as
 * an object detail lookup does. A filter on a column the result doesn't have
 * matches no rows.
 */
function applyEqualsFilters(dataset: Dataset, filters: unknown): Dataset {
  if (!Array.isArray(filters) || filters.length === 0) {
    return dataset;
  }
  const { cols, rows } = dataset.data;
  const matchers = filters.map((filter) => {
    const [operator, , column, value] = Array.isArray(filter) ? filter : [];
    const [, , columnKey] = Array.isArray(column) ? column : [];
    const columnIndex = cols.findIndex(
      (col) => col.name === columnKey || col.id === columnKey,
    );
    return (row: RowValue[]) =>
      operator === "=" && columnIndex >= 0 && row[columnIndex] === value;
  });
  const matchingRows = rows.filter((row) =>
    matchers.every((matches) => matches(row)),
  );
  return {
    ...dataset,
    row_count: matchingRows.length,
    data: { ...dataset.data, rows: matchingRows },
  };
}

/**
 * Stands in for the backend of one saved model: PUT stores the card, and both
 * the card query and an ad-hoc query on top of the model (`source-card`) run
 * the query of the card as it is stored at that moment.
 */
function setupModelServer({
  card,
  runQuery,
  isNew = false,
}: {
  card: Card;
  runQuery: QueryRunner;
  /** the model is created in the test, and gets the id of `card` */
  isNew?: boolean;
}) {
  let savedCard = card;
  setupNativeQuerySnippetEndpoints();
  if (isNew) {
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [createSampleDatabase()] }),
    );
    fetchMock.post("path:/api/card", (call) => {
      const created = parseBody(call);
      savedCard = { ...card, ...(isObject(created) ? created : {}) };
      return savedCard;
    });
  }
  fetchMock.get(`path:/api/card/${card.id}`, () => savedCard);
  fetchMock.put(`path:/api/card/${card.id}`, (call) => {
    const changes = parseBody(call);
    savedCard = { ...savedCard, ...(isObject(changes) ? changes : {}) };
    return savedCard;
  });
  const runSavedQuery = () =>
    withModelMetadata(
      runQuery(savedCard.dataset_query),
      fromResultMetadata(savedCard.result_metadata),
    );
  fetchMock.post(`path:/api/card/${card.id}/query`, runSavedQuery);
  setupAdhocQueryEndpoint((call) => {
    const query = parseBody(call);
    const stage = getFirstStage(query);
    const isQueryOnModel = stage["source-card"] === card.id;
    return isQueryOnModel
      ? applyEqualsFilters(runSavedQuery(), stage.filters)
      : runQuery(query);
  });
}

function getCardPostBodies() {
  return fetchMock.callHistory
    .calls("path:/api/card", { method: "POST" })
    .map(parseBody);
}

function getCardPutBodies(card: Card) {
  return fetchMock.callHistory
    .calls(`path:/api/card/${card.id}`, { method: "PUT" })
    .map(parseBody);
}

function getAdhocQueryBodies() {
  return fetchMock.callHistory
    .calls("path:/api/dataset", { method: "POST" })
    .map(parseBody);
}

function getCardDatasetQuery(body: unknown): unknown {
  return isObject(body) ? body.dataset_query : undefined;
}

/** A tiny stand-in for the QP on the Orders rows, for structured queries */
function runOrdersQuery(query: unknown): Dataset {
  const stage = getFirstStage(query);
  const aggregations = stage.aggregation;
  if (Array.isArray(aggregations) && aggregations.length > 0) {
    return createMockDataset({
      data: { cols: [COUNT_COLUMN], rows: [[18760]] },
      row_count: 1,
    });
  }
  const limit = typeof stage.limit === "number" ? stage.limit : undefined;
  return createOrdersDataset(ORDERS_ROWS.slice(0, limit));
}

function getHeaderNames() {
  return screen
    .getAllByTestId("header-cell")
    .map((cell) => cell.textContent ?? "");
}

async function waitForHeaderCell(name: string) {
  await waitFor(() => expect(getHeaderNames()).toContain(name));
}

async function waitForCell(text: string) {
  await waitFor(() =>
    expect(
      screen.getAllByTestId("cell-data").map((cell) => cell.textContent ?? ""),
    ).toContain(text),
  );
}

function getHeaderCell(name: string) {
  const cell = screen
    .getAllByTestId("header-cell")
    .find((cell) => cell.textContent === name);
  if (!cell) {
    throw new Error(`No header cell "${name}" in ${getHeaderNames()}`);
  }
  return cell;
}

const MAX_HEADER_CLICK_ATTEMPTS = 3;

/**
 * Selects a column on the columns tab. The table can replace its header cells
 * while a click is under way, and a click on a replaced cell reaches nothing,
 * so the click is repeated until the column is selected.
 */
async function clickHeader(name: string) {
  await waitForHeaderCell(name);
  const isSelected = () => {
    const input = screen.queryByLabelText("Display name");
    return input instanceof HTMLInputElement && input.value === name;
  };
  for (
    let attempt = 0;
    attempt < MAX_HEADER_CLICK_ATTEMPTS && !isSelected();
    attempt++
  ) {
    await userEvent.click(within(getHeaderCell(name)).getByText(name));
  }
  await waitFor(() =>
    expect(screen.getByLabelText("Display name")).toHaveValue(name),
  );
}

async function renameColumn(oldName: string, newName: string) {
  const input = await screen.findByLabelText("Display name");
  await waitFor(() => expect(input).toHaveValue(oldName));
  await userEvent.clear(input);
  await userEvent.type(input, newName);
  await userEvent.tab();
  await waitFor(() => expect(getHeaderNames()).toContain(newName));
}

async function setColumnType(oldType: string, newType: string) {
  const sidebar = screen.getByTestId("sidebar-right");
  const input = within(sidebar).getByLabelText("Column type");
  expect(input).toHaveValue(oldType);
  await userEvent.click(input);
  const listbox = await screen.findByRole("listbox");
  await userEvent.click(within(listbox).getByText(newType));
  await waitFor(() => expect(input).toHaveValue(newType));
}

async function setRowLimit(limit: string) {
  await userEvent.click(await screen.findByText("Row limit"));
  const input = await screen.findByPlaceholderText("Enter a limit");
  await userEvent.type(input, limit);
  await userEvent.tab();
}

/** Lets the responses of the requests under way arrive and render */
async function waitForResponses() {
  await act(() => fetchMock.callHistory.flush(true));
}

function getQueryRunCount() {
  return fetchMock.callHistory
    .calls()
    .filter((call) =>
      /\/api\/(dataset|card\/\d+\/query)$/.test(new URL(call.url).pathname),
    ).length;
}

/** Waits for a query run that starts after `previousCount` runs, and its result */
async function waitForNextQueryRun(previousCount: number) {
  await waitFor(() =>
    expect(getQueryRunCount()).toBeGreaterThan(previousCount),
  );
  await waitForResponses();
}

async function openEditor(action: "Edit metadata" | "Edit query definition") {
  await openQuestionActions();
  await userEvent.click(screen.getByText(action));
  await waitForResponses();
}

async function clickGetAnswer() {
  const runCount = getQueryRunCount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Get Answer" }),
  );
  await waitForNextQueryRun(runCount);
}

async function clickSaveChanges() {
  const runCount = getQueryRunCount();
  await userEvent.click(
    within(screen.getByTestId("dataset-edit-bar")).getByRole("button", {
      name: "Save changes",
    }),
  );
  await waitForNextQueryRun(runCount);
}

async function cancelAndDiscardChanges() {
  await userEvent.click(
    within(screen.getByTestId("dataset-edit-bar")).getByRole("button", {
      name: "Cancel",
    }),
  );
  await userEvent.click(
    within(await screen.findByTestId("leave-confirmation")).getByRole(
      "button",
      { name: "Discard changes" },
    ),
  );
  await waitForResponses();
}

function getNativeEditorInput() {
  return screen.getByTestId("mock-code-mirror");
}

async function runNativeQuery() {
  // while a query runs, the run button cancels it
  await waitForResponses();
  const runCount = getQueryRunCount();
  await userEvent.click(
    within(screen.getByTestId("native-query-editor-container")).getByTestId(
      "run-button",
    ),
  );
  await waitForNextQueryRun(runCount);
}

function createExpressionColumn(name: string, baseType: string) {
  return createMockColumn({
    name,
    display_name: name,
    source: "fields",
    base_type: baseType,
    effective_type: baseType,
    description: null,
    field_ref: ["expression", name, { "base-type": baseType }],
  });
}

async function assertColumnSelected(index: number, name: string) {
  await waitFor(() =>
    expect(screen.getByLabelText("Display name")).toHaveValue(name),
  );
  const cells = screen.getAllByTestId("header-cell");
  expect(cells[index]).toHaveTextContent(name);
  // the selected column is the one the Tab order starts from
  const selectedIndexes = cells.flatMap((cell, cellIndex) =>
    within(cell).queryByTestId("model-column-header-content")?.tabIndex ===
    EDITOR_TAB_INDEXES.FOCUSED_FIELD
      ? [cellIndex]
      : [],
  );
  expect(selectedIndexes).toEqual([index]);
}

async function setColumnName(oldName: string, newName: string) {
  await clickHeader(oldName);
  await renameColumn(oldName, newName);
}

async function verifyColumnName(name: string) {
  await clickHeader(name);
  await waitFor(() =>
    expect(screen.getByLabelText("Display name")).toHaveValue(name),
  );
}

function getNotebookStep(type: string) {
  return screen.getByTestId(`step-${type}-0-0`);
}

/** Goes where the "Use the notebook editor" option of a new model leads */
function startNewModel(router: { navigate: (to: string) => unknown }) {
  const url = Urls.newQuestion({
    metadata: createMockMetadata({ databases: [createSampleDatabase()] }),
    cardType: "model",
    mode: "query",
    creationType: "custom_question",
  });
  act(() => {
    router.navigate(url);
  });
}

async function openQuestionActions() {
  await userEvent.click(
    within(screen.getByTestId("qb-header-action-panel")).getByLabelText(
      "Move, trash, and more…",
    ),
  );
}

describe("QueryBuilder - model editor", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;
  mockGetBoundingClientRect({ width: 3000, height: 1000 });

  beforeEach(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    jest.resetAllMocks();
    setupJestCanvasMock();
  });

  it("discards metadata changes on cancel", async () => {
    const { router } = await setup({
      card: GUI_MODEL,
      dataset: createOrdersDataset(),
      initialRoute: `/model/${GUI_MODEL.id}`,
    });

    await openQuestionActions();
    expect(await screen.findByText("89%")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Edit metadata"));
    await waitForResponses();
    await waitFor(() => expect(router.location.pathname).toMatch(/\/columns$/));

    await clickHeader("Subtotal");
    await renameColumn("Subtotal", "Pre-tax");
    await setColumnType("No semantic type", "Currency");

    await userEvent.click(
      within(screen.getByTestId("dataset-edit-bar")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await userEvent.click(
      within(screen.getByTestId("leave-confirmation")).getByRole("button", {
        name: "Discard changes",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("dataset-edit-bar")).not.toBeInTheDocument(),
    );
    await waitForHeaderCell("Subtotal");
    expect(getHeaderNames()).not.toContain("Pre-tax ($)");
    expect(getHeaderNames()).not.toContain("Pre-tax");
  });

  describe("query tab", () => {
    it("does not add a query hash when rerunning a model (metabase#20045)", async () => {
      setupModelServer({ card: ORDERS_MODEL, runQuery: runOrdersQuery });
      const { router } = await setup({
        card: ORDERS_MODEL,
        initialRoute: `/model/${ORDERS_MODEL.id}`,
      });
      expect(router.location.pathname).toBe("/model/11-orders-model");
      expect(router.location.hash).toBe("");
      const queryCount = getAdhocQueryBodies().length;

      await userEvent.click(
        within(screen.getByTestId("qb-header-action-panel")).getByLabelText(
          "Refresh",
        ),
      );

      await waitFor(() =>
        expect(getAdhocQueryBodies()).toHaveLength(queryCount + 1),
      );
      expect(router.location.pathname).toBe("/model/11-orders-model");
      expect(router.location.hash).toBe("");
    });

    it("discards query changes on cancel", async () => {
      setupModelServer({ card: ORDERS_MODEL, runQuery: runOrdersQuery });
      const { router } = await setup({
        card: ORDERS_MODEL,
        initialRoute: `/model/${ORDERS_MODEL.id}`,
      });
      expect(await screen.findByText("109.22")).toBeInTheDocument();

      await openEditor("Edit query definition");
      await setRowLimit("2");
      await clickGetAnswer();

      await waitFor(() =>
        expect(getFirstStage(getAdhocQueryBodies().at(-1)).limit).toBe(2),
      );
      expect(await screen.findByText("37.65")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText("109.22")).not.toBeInTheDocument(),
      );

      const queryCount = getAdhocQueryBodies().length;
      await cancelAndDiscardChanges();

      await waitFor(() =>
        expect(getAdhocQueryBodies()).toHaveLength(queryCount + 1),
      );
      expect(getFirstStage(getAdhocQueryBodies().at(-1))).toEqual(
        expect.objectContaining({ "source-card": ORDERS_MODEL.id }),
      );
      expect(router.location.pathname).toBe("/model/11-orders-model");
      expect(router.location.hash).toBe("");
      expect(await screen.findByText("109.22")).toBeInTheDocument();
      expect(screen.getByText("37.65")).toBeInTheDocument();
    });

    it("locks the display of a model to a table", async () => {
      setupModelServer({ card: ORDERS_MODEL, runQuery: runOrdersQuery });
      await setup({
        card: ORDERS_MODEL,
        initialRoute: `/model/${ORDERS_MODEL.id}/query`,
      });

      await userEvent.click(await screen.findByText("Summarize"));
      await userEvent.click(await screen.findByText("Count of rows"));
      await clickGetAnswer();

      await waitFor(() =>
        expect(getFirstStage(getAdhocQueryBodies().at(-1)).aggregation).toEqual(
          [expect.arrayContaining(["count"])],
        ),
      );
      await waitForHeaderCell("Count");
      expect(screen.getByTestId("table-root")).toHaveTextContent("18,760");
      expect(screen.queryByTestId("scalar-value")).not.toBeInTheDocument();

      await cancelAndDiscardChanges();
      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("native model query tab", () => {
    it("edits a native model query, cancels the changes, and saves them", async () => {
      const model = createNativeModel({
        id: 20,
        name: "Native Model",
        query: "SELECT * FROM orders limit 5",
      });
      setupModelServer({ card: model, runQuery: runNativeOrdersQuery });
      const { router } = await setup({
        card: model,
        initialRoute: `/model/${model.id}`,
      });
      expect(await screen.findByText("109.22")).toBeInTheDocument();
      expect(screen.getByText("37.65")).toBeInTheDocument();

      await openEditor("Edit query definition");
      await waitFor(() => expect(router.location.pathname).toMatch(/\/query$/));
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();

      await userEvent.type(getNativeEditorInput(), "{backspace}2");
      await runNativeQuery();
      await waitFor(() =>
        expect(getNativeQuery(getAdhocQueryBodies().at(-1))).toBe(
          "SELECT * FROM orders limit 2",
        ),
      );
      await waitFor(() =>
        expect(screen.queryByText("109.22")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("37.65")).toBeInTheDocument();

      await cancelAndDiscardChanges();
      expect(await screen.findByText("109.22")).toBeInTheDocument();
      expect(screen.getByText("37.65")).toBeInTheDocument();
      expect(getCardPutBodies(model)).toHaveLength(0);

      await openEditor("Edit query definition");
      await waitFor(() => expect(router.location.pathname).toMatch(/\/query$/));
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
      expect(getNativeEditorInput()).toHaveValue(
        "SELECT * FROM orders limit 5",
      );

      await userEvent.type(getNativeEditorInput(), "{backspace}2");
      await runNativeQuery();
      await waitFor(() =>
        expect(screen.queryByText("109.22")).not.toBeInTheDocument(),
      );
      await clickSaveChanges();

      await waitFor(() => expect(getCardPutBodies(model)).toHaveLength(1));
      expect(
        getNativeQuery(getCardDatasetQuery(getCardPutBodies(model)[0])),
      ).toBe("SELECT * FROM orders limit 2");
      await waitFor(() =>
        expect(router.location.pathname).not.toMatch(/\/query$/),
      );
      expect(await screen.findByText("Showing 2 rows")).toBeInTheDocument();
      expect(screen.getByText("37.65")).toBeInTheDocument();
      expect(screen.queryByText("109.22")).not.toBeInTheDocument();
    });

    it("shows a failing query on both tabs until the query is fixed", async () => {
      const model = createNativeModel({
        id: 21,
        name: "Erroring Model",
        query: "SELECT 1 FROM",
      });
      setupModelServer({ card: model, runQuery: runNativeOrdersQuery });
      await setup({ card: model, initialRoute: `/model/${model.id}` });

      await openEditor("Edit metadata");
      expect(
        await screen.findByText(/Syntax error in SQL/),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("editor-tabs-query-name"));
      expect(
        await screen.findByText(/Syntax error in SQL/),
      ).toBeInTheDocument();

      await userEvent.type(getNativeEditorInput(), "{backspace}".repeat(5));
      await runNativeQuery();
      await waitFor(() =>
        expect(getNativeQuery(getAdhocQueryBodies().at(-1))).toBe("SELECT 1"),
      );
      await waitForCell("1");
      expect(screen.queryByText(/Syntax error in SQL/)).not.toBeInTheDocument();

      await clickSaveChanges();
      await waitFor(() => expect(getCardPutBodies(model)).toHaveLength(1));
      expect(
        getNativeQuery(getCardDatasetQuery(getCardPutBodies(model)[0])),
      ).toBe("SELECT 1");
      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      // The saved model first shows its own query's result as a table, and
      // then the result of its view-mode query, a 1x1 result, as a number
      expect(
        await within(
          screen.getByTestId("query-visualization-root"),
        ).findAllByText("1"),
      ).not.toHaveLength(0);
      expect(screen.queryByText(/Syntax error in SQL/)).not.toBeInTheDocument();
    });
  });

  describe("metadata tab", () => {
    const ID_DESCRIPTION =
      "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.";

    it("selects the clicked column in a reordered model and shows its own description (metabase#29943, metabase#39993, metabase#25884, metabase#34349)", async () => {
      const cols = [
        createOrdersIdDatasetColumn({ description: ID_DESCRIPTION }),
        createOrdersTotalDatasetColumn({ description: "The total" }),
        createExpressionColumn("Custom", "type/Integer"),
        createExpressionColumn("Country", "type/Text"),
      ];
      const model = createMockCard({
        id: 30,
        name: "Reordered model",
        type: "model",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                expressions: [
                  {
                    name: "Custom",
                    value: {
                      type: "operator",
                      operator: "+",
                      args: [
                        { type: "literal", value: 1 },
                        { type: "literal", value: 1 },
                      ],
                    },
                  },
                  {
                    name: "Country",
                    value: { type: "literal", value: "United States" },
                  },
                ],
                fields: [
                  { type: "column", name: "ID" },
                  { type: "column", name: "TOTAL" },
                ],
                limit: 5,
              },
            ],
          }),
        ),
        result_metadata: toResultMetadata(cols),
        // the order the model was saved with after moving Custom before Total
        visualization_settings: {
          "table.columns": ["ID", "Custom", "TOTAL", "Country"].map((name) =>
            createMockTableColumnOrderSetting({ name, enabled: true }),
          ),
        },
      });
      const rows = [[1, 39.72, 2, "United States"]];
      setupModelServer({
        card: model,
        runQuery: () => createMockDataset({ data: { cols, rows } }),
      });
      await setup({ card: model, initialRoute: `/model/${model.id}` });

      await openEditor("Edit metadata");
      await assertColumnSelected(0, "ID");
      expect(screen.getByLabelText("Description")).toHaveValue(ID_DESCRIPTION);

      await clickHeader("Country");
      await assertColumnSelected(3, "Country");
      expect(screen.getByLabelText("Description")).toHaveValue("");
      await clickHeader("ID");
      expect(screen.getByLabelText("Description")).toHaveValue(ID_DESCRIPTION);

      await clickHeader("Custom");
      await assertColumnSelected(1, "Custom");
      await clickHeader("Total");
      await assertColumnSelected(2, "Total");
      await clickHeader("ID");
      await assertColumnSelected(0, "ID");
    });

    it("keeps the description of each column separate (metabase#39749)", async () => {
      const cols = [
        createOrdersCreatedAtDatasetColumn({
          display_name: "Created At: Year",
          unit: "year",
          source: "breakout",
          description: null,
        }),
        createMockColumn({
          name: "count",
          display_name: "Count",
          source: "aggregation",
          base_type: "type/BigInteger",
          field_ref: ["aggregation", 0],
        }),
        createMockColumn({
          name: "sum",
          display_name: "Sum of Total",
          source: "aggregation",
          base_type: "type/Float",
          field_ref: ["aggregation", 1],
        }),
      ];
      const model = createMockCard({
        id: 31,
        name: "Aggregated model",
        type: "model",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                  {
                    type: "operator",
                    operator: "sum",
                    args: [{ type: "column", name: "TOTAL" }],
                  },
                ],
                breakouts: [
                  { type: "column", name: "CREATED_AT", unit: "year" },
                ],
              },
            ],
          }),
        ),
        result_metadata: toResultMetadata(cols),
      });
      const rows = [
        ["2022-01-01T00:00:00Z", 744, 42156.87],
        ["2023-01-01T00:00:00Z", 5834, 365417.29],
      ];
      setupModelServer({
        card: model,
        runQuery: () => createMockDataset({ data: { cols, rows } }),
      });
      await setup({ card: model, initialRoute: `/model/${model.id}` });

      await openEditor("Edit metadata");
      await clickHeader("Count");
      await userEvent.type(await screen.findByLabelText("Description"), "A");
      await clickHeader("Sum of Total");
      expect(screen.getByLabelText("Description")).toHaveValue("");
      await userEvent.type(screen.getByLabelText("Description"), "B");
      // the description is stored after a debounce
      await clickHeader("Count");
      await waitFor(() =>
        expect(screen.getByLabelText("Description")).toHaveValue("A"),
      );
      await clickHeader("Sum of Total");
      await waitFor(() =>
        expect(screen.getByLabelText("Description")).toHaveValue("B"),
      );

      await waitForSaveChangesToBeEnabled();
      await clickSaveChanges();
      await waitFor(() => expect(getCardPutBodies(model)).toHaveLength(1));
      expect(getCardPutBodies(model)[0]).toMatchObject({
        result_metadata: [
          { name: "CREATED_AT", description: null },
          { name: "count", description: "A" },
          { name: "sum", description: "B" },
        ],
      });

      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      await openEditor("Edit metadata");
      await clickHeader("Count");
      await waitFor(() =>
        expect(screen.getByLabelText("Description")).toHaveValue("A"),
      );
      await clickHeader("Sum of Total");
      expect(screen.getByLabelText("Description")).toHaveValue("B");
    });

    it("edits the metadata of self-joined columns separately (metabase#25885)", async () => {
      const cols = [
        createOrdersIdDatasetColumn(),
        createOrdersIdDatasetColumn({
          name: "ID_2",
          display_name: "Orders → ID",
          source: "joins",
          field_ref: [
            "field",
            ORDERS.ID,
            { "base-type": "type/BigInteger", "join-alias": "Orders" },
          ],
        }),
        createOrdersIdDatasetColumn({
          name: "ID_3",
          display_name: "Orders_2 → ID",
          source: "joins",
          field_ref: [
            "field",
            ORDERS.ID,
            { "base-type": "type/BigInteger", "join-alias": "Orders_2" },
          ],
        }),
      ];
      const selfJoin = (alias: string) => ({
        source: { type: "table" as const, id: ORDERS_ID },
        strategy: "left-join" as const,
        alias,
        conditions: [
          {
            operator: "=" as const,
            left: { type: "column" as const, name: "ID" },
            right: { type: "column" as const, name: "ID" },
          },
        ],
      });
      const model = createMockCard({
        id: 32,
        name: "Self join model",
        type: "model",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                joins: [selfJoin("Orders"), selfJoin("Orders_2")],
              },
            ],
          }),
        ),
        result_metadata: toResultMetadata(cols),
      });
      setupModelServer({
        card: model,
        runQuery: () =>
          createMockDataset({ data: { cols, rows: [[1, 1, 1]] } }),
      });
      await setup({ card: model, initialRoute: `/model/${model.id}` });

      await openEditor("Edit metadata");
      await setColumnName("ID", "ID1");
      await setColumnName("Orders → ID", "ID2");
      await setColumnName("Orders_2 → ID", "ID3");
      await verifyColumnName("ID1");
      await verifyColumnName("ID2");
      await verifyColumnName("ID3");
      expect(getHeaderNames()).toEqual(["ID1", "ID2", "ID3"]);
    });

    it("shows columns with details-only visibility on the columns tab (metabase#22521)", async () => {
      const cols = createProductsTableDatasetColumns().map((column) =>
        column.name === "VENDOR"
          ? { ...column, visibility_type: "details-only" as const }
          : column,
      );
      const model = createMockCard({
        id: 33,
        name: "22521",
        type: "model",
        display: "table",
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [{ source: { type: "table", id: PRODUCTS_ID }, limit: 5 }],
          }),
        ),
        result_metadata: toResultMetadata(cols),
      });
      const rows = [
        [
          1,
          "1018947080336",
          "Rustic Paper Wallet",
          "Gizmo",
          "Swaniawski, Casper and Hilll",
          29.46,
          4.6,
          "2023-07-19T19:44:56.582Z",
        ],
      ];
      setupModelServer({
        card: model,
        runQuery: () => createMockDataset({ data: { cols, rows } }),
      });
      await setup({ card: model, initialRoute: `/model/${model.id}` });
      await waitForHeaderCell("Title");
      expect(getHeaderNames()).not.toContain("Vendor");

      await openEditor("Edit metadata");
      await waitForHeaderCell("Vendor");
    });
  });

  describe("new model", () => {
    it("allows browser history navigation between tabs (metabase#34514, metabase#45787)", async () => {
      setupAdhocQueryEndpoint((call) => runOrdersQuery(parseBody(call)));
      const { router } = await setup({ card: null, initialRoute: "/" });
      // navigate through the UI, so the history has the entries to go back to
      startNewModel(router);

      const miniPicker = await screen.findByTestId("mini-picker");
      await userEvent.click(
        await within(miniPicker).findByText("Sample Database"),
      );
      await userEvent.click(await within(miniPicker).findByText("Orders"));
      await clickGetAnswer();
      await assertQueryTabState();
      expect(getAdhocQueryBodies()).toHaveLength(1);

      await userEvent.click(screen.getByTestId("editor-tabs-columns-name"));
      expect(await screen.findByLabelText("Description")).toHaveValue(
        "ID description",
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
      expect(getAdhocQueryBodies()).toHaveLength(1);

      act(() => router.back());
      await assertQueryTabState();
      expect(getAdhocQueryBodies()).toHaveLength(1);

      act(() => router.back());
      expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();
      expect(screen.getByTestId("editor-tabs-columns")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(
        within(getNotebookStep("data")).getByPlaceholderText(
          "Search for tables and more...",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("table-root")).not.toBeInTheDocument();
      const visualization = screen.getByTestId("query-visualization-root");
      expect(
        within(visualization).queryByText("We're experiencing server issues"),
      ).not.toBeInTheDocument();
      expect(
        within(visualization).getByText(
          "Here's where your results will appear",
        ),
      ).toBeInTheDocument();
      expect(getAdhocQueryBodies()).toHaveLength(1);

      async function assertQueryTabState() {
        await waitForCell("39.72");
        expect(
          screen.queryByTestId("entity-picker-modal"),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        expect(
          within(getNotebookStep("data")).getByText("Orders"),
        ).toBeInTheDocument();
      }
    });
  });

  describe("new model URL", () => {
    it("keeps the URL of a new model on reload (metabase#34517)", async () => {
      const { router } = await setup({ card: null, initialRoute: "/" });
      startNewModel(router);
      expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();
      expect(router.location.pathname).toBe("/model/query");

      const { pathname, search, hash } = router.location;
      cleanup();
      fetchMock.removeRoutes();
      const { router: reloadedRouter } = await setup({
        card: null,
        initialRoute: `${pathname}${search}${hash}`,
      });

      expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();
      expect(reloadedRouter.location.pathname).toBe("/model/query");
    });
  });

  describe("model description", () => {
    it("renders a markdown model description after editing it (metabase#34574)", async () => {
      const model = createMockCard({
        ...ORDERS_MODEL,
        id: 40,
        name: "34574",
        description: null,
      });
      setupModelServer({ card: model, runQuery: runOrdersQuery });
      setupRevisionsEndpoints([]);
      await setup({ card: model, initialRoute: `/model/${model.id}` });

      await userEvent.click(screen.getByTestId("qb-header-info-button"));
      const sidesheet = await screen.findByTestId("sidesheet");
      await userEvent.click(
        within(sidesheet).getByPlaceholderText("Add description"),
      );
      await userEvent.type(
        within(sidesheet).getByPlaceholderText("Add description"),
        "# Hello{enter}## World{enter}This is an **important** description!",
      );
      await userEvent.tab();

      await waitFor(() => expect(getCardPutBodies(model)).toHaveLength(1));
      await waitForResponses();
      expect(getCardPutBodies(model)[0]).toMatchObject({
        description: "# Hello\n## World\nThis is an **important** description!",
      });
      const description = within(sidesheet).getByTestId("editable-text");
      await waitFor(() =>
        expect(
          within(description).queryByRole("textbox"),
        ).not.toBeInTheDocument(),
      );
      expect(
        within(description).getByRole("heading", { level: 1, name: "Hello" }),
      ).toBeInTheDocument();
      expect(
        within(description).getByRole("heading", { level: 2, name: "World" }),
      ).toBeInTheDocument();
      expect(within(description).getByText("important").tagName).toBe("STRONG");

      await userEvent.click(within(sidesheet).getByLabelText("Close"));
      await waitFor(() =>
        expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument(),
      );
      // the collection list then shows the description in a tooltip, which
      // the BaseItemsTable spec covers
      expect(
        within(screen.getByTestId("head-crumbs-container")).getByRole("link", {
          name: /Our analytics/,
        }),
      ).toHaveAttribute("href", "/collection/root");
    });
  });

  describe("columns visible only in detail views", () => {
    beforeEach(() => {
      // v65 object detail loads the foreign keys of the model's virtual table
      fetchMock.get(/\/api\/table\/card__\d+\/fks$/, []);
    });

    async function setVisibility(columnName: string, visibility: string) {
      await clickHeader(columnName);
      await userEvent.click(screen.getByLabelText(visibility));
      await waitFor(() =>
        expect(screen.getByLabelText(visibility)).toBeChecked(),
      );
    }

    function getSavedIdVisibility(body: unknown) {
      const metadata = isObject(body) ? body.result_metadata : undefined;
      const idColumn = Array.isArray(metadata)
        ? metadata.find((column) => isObject(column) && column.name === "ID")
        : undefined;
      return isObject(idColumn) ? idColumn.visibility_type : undefined;
    }

    async function assertIdHiddenInTableButInObjectDetail(model: Card) {
      setupModelActionsEndpoints([], model.id);
      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      await waitForHeaderCell("User ID");
      expect(getHeaderNames()).not.toContain("ID");

      const [, secondRow] = screen.getAllByTestId("row-id-cell");
      await userEvent.click(within(secondRow).getByTestId("detail-shortcut"));
      const objectDetail = await screen.findByRole("dialog");
      expect(within(objectDetail).getByText("Quantity")).toBeInTheDocument();
      // the second row, whose PK is 2, and not the row at index 1
      expect(
        within(objectDetail).getByRole("heading", { name: "2" }),
      ).toBeInTheDocument();
      expect(
        within(objectDetail).getByRole("link", { name: "Open in full page" }),
      ).toHaveAttribute("href", expect.stringMatching(/\/2$/));
      await userEvent.click(within(objectDetail).getByLabelText("Close"));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    }

    async function makeIdVisibleInTable(model: Card) {
      await openEditor("Edit metadata");
      await clickHeader("ID");
      await waitFor(() =>
        expect(screen.getByLabelText("Detail views only")).toBeChecked(),
      );
      await setVisibility("ID", "Table and details views");
      const putCount = getCardPutBodies(model).length;
      await clickSaveChanges();
      await waitFor(() =>
        expect(getCardPutBodies(model)).toHaveLength(putCount + 1),
      );
      expect(getSavedIdVisibility(getCardPutBodies(model).at(-1))).toBe(
        "normal",
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      await waitForHeaderCell("ID");
    }

    it("shows a hidden PK in the metadata editor and object detail of a new model (metabase#33844)", async () => {
      const model = createMockCard({ ...ORDERS_MODEL, id: 50, name: "Orders" });
      setupModelServer({ card: model, runQuery: runOrdersQuery, isNew: true });
      const { router } = await setup({ card: null, initialRoute: "/" });
      startNewModel(router);
      const miniPicker = await screen.findByTestId("mini-picker");
      await userEvent.click(
        await within(miniPicker).findByText("Sample Database"),
      );
      await userEvent.click(await within(miniPicker).findByText("Orders"));
      await clickGetAnswer();
      await waitForCell("39.72");
      await userEvent.click(
        within(screen.getByTestId("dataset-edit-bar")).getByText("Columns"),
      );

      await waitForHeaderCell("ID");
      expect(screen.queryByTestId("detail-shortcut")).not.toBeInTheDocument();
      await setVisibility("ID", "Detail views only");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      const runCount = getQueryRunCount();
      await userEvent.click(
        within(await screen.findByTestId("save-question-modal")).getByRole(
          "button",
          { name: "Save" },
        ),
      );
      await waitForNextQueryRun(runCount);
      await waitFor(() => expect(getCardPostBodies()).toHaveLength(1));
      expect(getSavedIdVisibility(getCardPostBodies()[0])).toBe("details-only");

      await assertIdHiddenInTableButInObjectDetail(model);
      await makeIdVisibleInTable(model);
    });

    it("shows a hidden PK in the metadata editor and object detail of an updated model (metabase#33844)", async () => {
      setupModelServer({ card: ORDERS_MODEL, runQuery: runOrdersQuery });
      await setup({
        card: ORDERS_MODEL,
        initialRoute: `/model/${ORDERS_MODEL.id}`,
      });
      await openEditor("Edit metadata");

      await waitForHeaderCell("ID");
      expect(screen.queryByTestId("detail-shortcut")).not.toBeInTheDocument();
      await setVisibility("ID", "Detail views only");
      await clickSaveChanges();
      await waitFor(() =>
        expect(getCardPutBodies(ORDERS_MODEL)).toHaveLength(1),
      );
      expect(getSavedIdVisibility(getCardPutBodies(ORDERS_MODEL)[0])).toBe(
        "details-only",
      );

      await assertIdHiddenInTableButInObjectDetail(ORDERS_MODEL);
      await makeIdVisibleInTable(ORDERS_MODEL);
    });

    it("preserves model metadata when the query is re-run (metabase#45924)", async () => {
      setupModelServer({ card: ORDERS_MODEL, runQuery: runOrdersQuery });
      await setup({
        card: ORDERS_MODEL,
        initialRoute: `/model/${ORDERS_MODEL.id}`,
      });
      await openEditor("Edit metadata");
      await clickHeader("ID");
      await userEvent.clear(screen.getByLabelText("Display name"));
      await userEvent.type(screen.getByLabelText("Display name"), "ID1");

      await userEvent.click(
        within(screen.getByTestId("dataset-edit-bar")).getByText("Query"),
      );
      await userEvent.click(
        within(await screen.findByTestId("action-buttons")).getByRole(
          "button",
          { name: "Sort" },
        ),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByText("ID"),
      );
      await clickGetAnswer();
      await waitFor(() =>
        expect(getFirstStage(getAdhocQueryBodies().at(-1))["order-by"]).toEqual(
          [expect.arrayContaining(["asc"])],
        ),
      );
      await waitForCell("39.72");

      await userEvent.click(
        within(screen.getByTestId("dataset-edit-bar")).getByText("Columns"),
      );
      await clickHeader("ID1");
      expect(screen.getByLabelText("Display name")).toHaveValue("ID1");
      await clickSaveChanges();

      await waitFor(() =>
        expect(getCardPutBodies(ORDERS_MODEL)).toHaveLength(1),
      );
      const [body] = getCardPutBodies(ORDERS_MODEL);
      expect(body).toMatchObject({
        result_metadata: expect.arrayContaining([
          expect.objectContaining({ name: "ID", display_name: "ID1" }),
        ]),
      });
      expect(getFirstStage(getCardDatasetQuery(body))["order-by"]).toHaveLength(
        1,
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("dataset-edit-bar"),
        ).not.toBeInTheDocument(),
      );
      await waitForHeaderCell("ID1");
    });
  });
});
