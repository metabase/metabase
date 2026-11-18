import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { setNativeEditorSelectedRange } from "../actions";
import { getIsRunning, getQuestion } from "../store/selectors";

import {
  TEST_DB,
  TEST_NATIVE_CARD,
  setup,
  triggerMetadataChange,
  triggerNativeQueryChange,
  waitForNativeQueryEditorReady,
  waitForSaveChangesToBeEnabled,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

const getQueryRunCount = () =>
  fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" }).length +
  fetchMock.callHistory.calls(`path:/api/card/${TEST_NATIVE_CARD.id}/query`, {
    method: "POST",
  }).length;

const submitSaveModal = async ({ name }: { name?: string } = {}) => {
  await waitForSaveToBeEnabled();
  await userEvent.click(screen.getByText("Save"));
  const modal = await screen.findByTestId("save-question-modal");
  if (name) {
    await userEvent.type(within(modal).getByLabelText("Name"), name);
  }
  await userEvent.click(within(modal).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByTestId("save-question-modal")).not.toBeInTheDocument(),
  );
};

describe("QueryBuilder > native questions", () => {
  it("runs only the selected text and keeps the full query (metabase#16886)", async () => {
    const card = {
      ...TEST_NATIVE_CARD,
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "select 1 from orders",
      }),
    };
    setupListNotificationEndpoints({ card_id: card.id }, []);
    const { store } = await setup({ card });
    await waitFor(() => expect(getQueryRunCount()).toBe(1));

    act(() => {
      store.dispatch(
        setNativeEditorSelectedRange([
          { start: { row: 0, column: 0 }, end: { row: 0, column: 8 } },
        ]),
      );
    });
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    const runCall = await waitFor(() =>
      checkNotNull(
        fetchMock.callHistory.lastCall("path:/api/dataset", { method: "POST" }),
      ),
    );
    const runBody: unknown = JSON.parse(String(runCall.options.body));
    expect(runBody).toMatchObject({ stages: [{ native: "select 1" }] });
    expect(
      Lib.rawNativeQuery(checkNotNull(getQuestion(store.getState())).query()),
    ).toBe("select 1 from orders");
  });

  it("does not run a new native question when it is saved (metabase#30165)", async () => {
    setupCardCreateEndpoint();
    setupCardQueryMetadataEndpoint(
      createMockCard(),
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    await setup({ card: null, initialRoute: "/" });

    await userEvent.click(screen.getByText("New"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByText("SQL query"),
    );
    await waitForLoaderToBeRemoved();
    await triggerNativeQueryChange();

    await submitSaveModal({ name: "Q1" });

    expect(
      fetchMock.callHistory.calls("path:/api/card", { method: "POST" }),
    ).toHaveLength(1);
    expect(
      screen.getByText("Here's where your results will appear"),
    ).toBeInTheDocument();
    expect(getQueryRunCount()).toBe(0);
  });

  it("saves the template tags of a new native question as its parameters", async () => {
    setupCardCreateEndpoint();
    setupCardQueryMetadataEndpoint(
      createMockCard(),
      createMockCardQueryMetadata({ databases: [TEST_DB] }),
    );
    await setup({ card: null, initialRoute: "/" });
    await userEvent.click(screen.getByText("New"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByText("SQL query"),
    );
    await waitForLoaderToBeRemoved();
    await waitForNativeQueryEditorReady();

    await userEvent.click(
      within(screen.getByTestId("mock-native-query-editor")).getByRole(
        "textbox",
      ),
    );
    await userEvent.paste("select * from products where category = {{cat}}");
    await userEvent.tab();
    await submitSaveModal({ name: "SQL Products" });

    const saveCall = checkNotNull(
      fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" }),
    );
    const saveBody: unknown = JSON.parse(String(saveCall.options.body));
    expect(saveBody).toMatchObject({
      parameters: [
        {
          slug: "cat",
          target: ["variable", ["template-tag", "cat"]],
        },
      ],
    });
  });

  it("saves a native question whose results have no rows as a new question", async () => {
    setupListNotificationEndpoints({ card_id: TEST_NATIVE_CARD.id }, []);
    const { router } = await setup({ card: TEST_NATIVE_CARD });
    expect(await screen.findByText("No results")).toBeInTheDocument();

    await triggerNativeQueryChange();
    await waitForSaveToBeEnabled();
    await userEvent.click(screen.getByText("Save"));
    const modal = await screen.findByTestId("save-question-modal");
    await userEvent.click(within(modal).getByText("Save as new question"));
    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/card", { method: "POST" }),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(router.location.pathname).toMatch(/^\/question\/1-/),
    );
  });

  it("does not rerun a saved native question when its query changes are saved (metabase#30165)", async () => {
    setupListNotificationEndpoints({ card_id: TEST_NATIVE_CARD.id }, []);
    await setup({ card: TEST_NATIVE_CARD });
    await waitFor(() => expect(getQueryRunCount()).toBe(1));

    await triggerNativeQueryChange();
    await submitSaveModal();

    expect(
      fetchMock.callHistory.calls(`path:/api/card/${TEST_NATIVE_CARD.id}`, {
        method: "PUT",
      }),
    ).toHaveLength(1);
    expect(getQueryRunCount()).toBe(1);
  });
});

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
      query_type: "native",
      dataset_query: Lib.toJsQuery(modelQuery),
      visualization_settings: visualizationSettings,
      result_metadata: modelColumns,
    });
    setupListNotificationEndpoints({ card_id: card.id }, []);
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

  const openQueryDefinitionEditor = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "Move, trash, and more…" }),
    );
    await userEvent.click(
      within(await screen.findByRole("menu")).getByText(
        "Edit query definition",
      ),
    );
    await waitForNativeQueryEditorReady();
  };

  const expectEditorToRerunSavedModel = async (store: {
    getState: () => State;
  }) => {
    await waitFor(() => expect(getModelRunCalls()).toHaveLength(1));
    await waitFor(() => expect(getIsRunning(store.getState())).toBe(false));
  };

  const expectEditorToShowQueryAndBothColumns = async () => {
    expect(
      within(screen.getByTestId("mock-native-query-editor")).getByRole(
        "textbox",
      ),
    ).toHaveValue(MODEL_SQL);
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
