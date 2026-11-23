import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupNativeQuerySnippetEndpoints } from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DatasetColumn,
  Field,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { getIsRunning } from "../store/selectors";

import {
  setup,
  triggerMetadataChange,
  waitForSaveChangesToBeEnabled,
} from "./test-utils";

// NativeQueryEditor is mocked globally in test/register-visualizations.js, and
// test/__support__/mocks.js replaces CodeMirror with a textarea. These tests
// assert the SQL that the real editor shows, so both are unmocked; jest hoists
// the unmocks above the imports.
jest.unmock("metabase/querying/components/NativeQueryEditor");
jest.unmock("@uiw/react-codemirror");

registerVisualizations();

const toResultMetadata = (columns: DatasetColumn[]) =>
  // The API returns dataset columns as the model metadata, which `Field` does not type.
  columns as unknown as Field[];

describe("QueryBuilder > model with empty or hidden table.columns (metabase#23421)", () => {
  const MODEL_SQL =
    'SELECT 1 AS "id", current_timestamp::timestamp AS "created_at"';
  const MODEL_ID = 23421;

  beforeEach(() => {
    // the data grid virtualizes its columns and renders none at zero size
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const ORPHANED_PIVOT_SETTINGS = {
    "table.pivot_column": "orphaned1",
    "table.cell_column": "orphaned2",
  };

  const EMPTY_COLUMNS_SETTINGS: VisualizationSettings = {
    "table.columns": [],
    ...ORPHANED_PIVOT_SETTINGS,
  };

  // Saved by an older version: each entry still has the legacy `key` and
  // `fieldRef` properties that `TableColumnOrderSetting` no longer declares.
  const LEGACY_HIDDEN_TABLE_COLUMNS = [
    {
      name: "id",
      key: '["name","id"]',
      enabled: false,
      fieldRef: ["field", "id", { "base-type": "type/Integer" }],
    },
    {
      name: "created_at",
      key: '["name","created_at"]',
      enabled: false,
      fieldRef: ["field", "created_at", { "base-type": "type/DateTime" }],
    },
  ];

  const HIDDEN_COLUMNS_SETTINGS: VisualizationSettings = {
    "table.columns": LEGACY_HIDDEN_TABLE_COLUMNS,
    ...ORPHANED_PIVOT_SETTINGS,
  };

  const modelQuery = Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
    query: MODEL_SQL,
  });

  const modelColumns = [
    createMockColumn({
      id: undefined,
      table_id: undefined,
      name: "id",
      display_name: "id",
      source: "native",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      field_ref: ["field", "id", { "base-type": "type/Integer" }],
    }),
    createMockColumn({
      id: undefined,
      table_id: undefined,
      name: "created_at",
      display_name: "created_at",
      source: "native",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
      field_ref: ["field", "created_at", { "base-type": "type/DateTime" }],
    }),
  ];

  const modelDataset = createMockDataset({
    data: {
      cols: modelColumns,
      rows: [[1, "2026-11-18T10:00:00"]],
    },
    database_id: SAMPLE_DB_ID,
    status: "completed",
    row_count: 1,
  });

  const setupModel = async (visualizationSettings: VisualizationSettings) => {
    const card = createMockCard({
      id: MODEL_ID,
      name: "Issue 23421",
      type: "model",
      display: "table",
      displayIsLocked: true,
      dataset_query: Lib.toJsQuery(modelQuery),
      visualization_settings: visualizationSettings,
      result_metadata: toResultMetadata(modelColumns),
    });
    setupListNotificationEndpoints({ card_id: card.id }, []);
    // the real native editor loads the snippets for autocomplete
    setupNativeQuerySnippetEndpoints();
    return setup({
      card,
      dataset: modelDataset,
      initialRoute: `/model/${card.id}`,
    });
  };

  const getModelRunCalls = () =>
    fetchMock.callHistory.calls(`path:/api/card/${MODEL_ID}/query`, {
      method: "POST",
    });

  const expectModelViewToRunAdHocQueryOnModel = () => {
    const viewRunCall = checkNotNull(
      fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
    );
    const viewRunBody: unknown = JSON.parse(String(viewRunCall.options.body));
    expect(viewRunBody).toMatchObject({
      stages: [{ "source-card": MODEL_ID }],
    });
    expect(getModelRunCalls()).toHaveLength(0);
  };

  const getNativeQueryEditor = () =>
    within(screen.getByTestId("native-query-editor-container")).getByRole(
      "textbox",
    );

  const openQueryDefinitionEditor = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "Move, trash, and more…" }),
    );
    await userEvent.click(
      within(await screen.findByRole("menu")).getByText(
        "Edit query definition",
      ),
    );
    expect(
      await screen.findByTestId("native-query-editor-container"),
    ).toBeInTheDocument();
  };

  const expectEditorToRerunSavedModel = async (store: {
    getState: () => State;
  }) => {
    await waitFor(() => expect(getModelRunCalls()).toHaveLength(1));
    await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
  };

  const expectEditorToShowQueryAndBothColumns = async () => {
    // The real editor shows the SQL saved on the model.
    await waitFor(() =>
      expect(getNativeQueryEditor()).toHaveTextContent(MODEL_SQL),
    );
    expect(
      await screen.findByRole("columnheader", { name: "id" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "created_at" }),
    ).toBeInTheDocument();
  };

  const expectSaveToBeEnabledAfterMetadataChange = async () => {
    await userEvent.click(screen.getByText("Columns"));
    await triggerMetadataChange();
    await waitForSaveChangesToBeEnabled();
  };

  it("shows every column in the editor when table.columns is empty", async () => {
    const { store } = await setupModel(EMPTY_COLUMNS_SETTINGS);
    expectModelViewToRunAdHocQueryOnModel();

    await openQueryDefinitionEditor();
    await expectEditorToRerunSavedModel(store);
    await expectEditorToShowQueryAndBothColumns();

    // Nothing has been edited yet: the query and the settings match the saved
    // card and there is no metadata diff, so `canSaveChanges` is false.
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await expectSaveToBeEnabledAfterMetadataChange();
  });

  it("shows every column in the editor and keeps save disabled when all table.columns are hidden", async () => {
    const { store } = await setupModel(HIDDEN_COLUMNS_SETTINGS);
    expectModelViewToRunAdHocQueryOnModel();

    await openQueryDefinitionEditor();
    await expectEditorToRerunSavedModel(store);
    await expectEditorToShowQueryAndBothColumns();

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await expectSaveToBeEnabledAfterMetadataChange();
  });
});
