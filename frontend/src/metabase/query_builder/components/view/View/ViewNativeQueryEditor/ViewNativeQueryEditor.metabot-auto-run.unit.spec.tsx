// The native editor toggle and its text field are part of the tested flow.
jest.unmock("metabase/querying/components/NativeQueryEditor");

import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import { setupCardEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockLocation, createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, waitFor } from "__support__/ui";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import type { KnownDataPart } from "metabase/api/ai-streaming/schemas";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import { MetabotProvider } from "metabase/metabot";
import {
  getMetabotSqlModeEntry,
  sendAgentRequest,
} from "metabase/metabot/state";
import {
  conversationIdForAgent,
  createTestMetabotState,
} from "metabase/metabot/tests/utils";
import type * as Router from "metabase/router";
import { navigate } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type { CardDisplayType, DatasetQuery } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { initializeQB } from "../../../../actions/core/initializeQB";
import { getQuestion } from "../../../../store/selectors";

import {
  QueryBuilderEditor,
  TEST_DB,
  codeEditPart,
  createChatContext,
  getQueryBuilderSql,
  getRunSql,
  getTestIdText,
  metabotNativeCardPart,
  mockAgentTurns,
  mockRunQuestionQuery,
  setupQueryBuilderMetabotEndpoints,
} from "./ViewNativeQueryEditor.metabot.setup.spec";

jest.mock("metabase/api/ai-streaming", () => ({
  aiStreamingQuery: jest.fn(),
  findMatchingInflightAiStreamingRequests: jest.fn(() => []),
}));

jest.mock("metabase/router", () => ({
  ...jest.requireActual<typeof Router>("metabase/router"),
  navigate: jest.fn(),
}));

// The line breaks and the trailing spaces must survive every step from the
// stream to the query builder, or the next Metabot edit falls back to a diff.
const FIRST_SQL = "SELECT CREATED_AT\nFROM ORDERS  ";
const SMOOTHED_SQL =
  "SELECT CREATED_AT,\n  AVG(TOTAL) OVER (ROWS 3 PRECEDING)\nFROM ORDERS\n";
const LAST_TWO_YEARS_SQL = `${SMOOTHED_SQL}WHERE CREATED_AT > NOW() - INTERVAL '2' YEAR`;

const metadata = createMockMetadata({ databases: [TEST_DB] });
const metadataProvider = createMetadataProvider({
  databaseId: TEST_DB.id,
  metadata,
});

/** A native query with the template tags of `sql`, as Metabot builds it. */
const mbqlNativeQuery = (sql: string): DatasetQuery =>
  Lib.toJsQuery(
    Lib.withNativeQuery(
      Lib.createTestNativeQuery(metadataProvider, { query: "SELECT 1" }),
      sql,
    ),
  );

const ORDERS_MODEL = createMockCard({
  id: 5,
  name: "Orders model",
  type: "model",
  dataset_query: createMockNativeDatasetQuery({ database: TEST_DB.id }),
});
const MODEL_SQL = "SELECT CREATED_AT, TOTAL\nFROM {{#5}} AS m";

const mbqlOrdersQuery = createMockStructuredDatasetQuery({
  database: TEST_DB.id,
  query: { "source-table": ORDERS_ID },
});

/**
 * A stream that sends `parts`, then stops as the Stop button does, fails, or
 * ends with an `error` chunk from the server.
 */
const mockInterruptedTurn = (
  parts: KnownDataPart[],
  ending: "aborted" | "failed" | "streamed-error",
) => {
  jest
    .mocked(aiStreamingQuery)
    .mockImplementation(async (_request, callbacks) => {
      parts.forEach((part) => callbacks?.onDataPart?.(part));
      if (ending === "failed") {
        throw new Error("The network connection was lost");
      }
      if (ending === "streamed-error") {
        callbacks?.onError?.({ errorText: "The provider is overloaded" });
        return { aborted: false, toolCalls: [], data: [] };
      }
      return { aborted: true, toolCalls: [], data: [] };
    });
};

const locationFromPath = (path: string) => {
  const [pathname, hash] = path.split("#");
  return createMockLocation({ pathname, hash: `#${hash}` });
};

function setup() {
  setupQueryBuilderMetabotEndpoints();
  jest.mocked(findMatchingInflightAiStreamingRequests).mockReturnValue([]);
  jest.mocked(navigate).mockReset();
  const runQuestionQuerySpy = mockRunQuestionQuery();

  const { store, rerender } = renderWithProviders(
    <MetabotProvider>{null}</MetabotProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser(),
        settings: mockSettings({ "llm-metabot-configured?": true }),
        entities: createMockEntitiesState({ databases: [TEST_DB] }),
        metabot: createTestMetabotState(),
      }),
    },
  );

  const sendTurn = async ({
    hasQbBuffer,
    display,
  }: {
    hasQbBuffer: boolean;
    display?: CardDisplayType;
  }) => {
    await act(async () => {
      await store.dispatch(
        sendAgentRequest({
          message: "Smooth the chart",
          conversation_id: conversationIdForAgent(store),
          assistant_message_id: `msg-${jest.mocked(aiStreamingQuery).mock.calls.length}`,
          isFullPageMetabot: false,
          context: createChatContext({
            qbSql: hasQbBuffer ? getQueryBuilderSql() : undefined,
            display,
          }),
        }),
      );
    });
  };

  const initializeNavigatedQB = async () => {
    const paths = jest.mocked(navigate).mock.calls.map(([to]) => String(to));
    const lastPath = checkNotNull(paths.at(-1));
    await act(async () => {
      await store.dispatch(initializeQB(locationFromPath(lastPath), {}));
      jest.runOnlyPendingTimers();
    });
    return { paths, lastPath };
  };

  return {
    store,
    rerender,
    runQuestionQuerySpy,
    sendTurn,
    initializeNavigatedQB,
  };
}

describe("query builder auto-run of Metabot SQL from the sidebar", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.mocked(aiStreamingQuery).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fetchMock.removeRoutes();
  });

  it("navigates once and runs the last native card of a turn without opening the editor", async () => {
    const { store, runQuestionQuerySpy, sendTurn, initializeNavigatedQB } =
      setup();
    mockAgentTurns([
      [
        metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(FIRST_SQL) }),
        metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(SMOOTHED_SQL) }),
      ],
    ]);

    await sendTurn({ hasQbBuffer: false });
    const { paths } = await initializeNavigatedQB();

    expect(paths).toHaveLength(1);
    const question = checkNotNull(getQuestion(store.getState()));
    expect(Lib.rawNativeQuery(question.query())).toBe(SMOOTHED_SQL);
    expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
    expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(false);
  });

  it("does not navigate for a turn with no native card", async () => {
    const { store, sendTurn } = setup();
    mockAgentTurns([[]]);

    await sendTurn({ hasQbBuffer: false });

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().qb.pendingAutoRun).toBeNull();
    expect(
      getMetabotSqlModeEntry(store.getState(), conversationIdForAgent(store)),
    ).toBeUndefined();
  });

  it("opens the editor for a native card with show_sql", async () => {
    const { store, runQuestionQuerySpy, sendTurn, initializeNavigatedQB } =
      setup();
    mockAgentTurns([
      [
        metabotNativeCardPart({
          datasetQuery: mbqlNativeQuery(SMOOTHED_SQL),
          showSql: true,
        }),
      ],
    ]);

    await sendTurn({ hasQbBuffer: false });
    await initializeNavigatedQB();

    expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
    expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(true);
    expect(
      getMetabotSqlModeEntry(store.getState(), conversationIdForAgent(store))
        ?.mode,
    ).toBe("sql-shown");
  });

  it("stores the SQL text of the query builder question, so the next edit applies", async () => {
    const {
      store,
      rerender,
      runQuestionQuerySpy,
      sendTurn,
      initializeNavigatedQB,
    } = setup();
    mockAgentTurns([
      [metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(SMOOTHED_SQL) })],
      [codeEditPart({ sql: LAST_TWO_YEARS_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    await initializeNavigatedQB();

    const question = checkNotNull(getQuestion(store.getState()));
    expect(
      getMetabotSqlModeEntry(store.getState(), conversationIdForAgent(store))
        ?.lastAppliedSql,
    ).toBe(Lib.rawNativeQuery(question.query()));

    rerender(
      <MetabotProvider>
        <QueryBuilderEditor />
      </MetabotProvider>,
    );
    await sendTurn({ hasQbBuffer: true });

    await waitFor(() =>
      expect(getTestIdText("qb-sql")).toBe(LAST_TWO_YEARS_SQL),
    );
    await waitFor(() => expect(runQuestionQuerySpy).toHaveBeenCalledTimes(2));
    expect(getRunSql(runQuestionQuerySpy, 1)).toBe(LAST_TWO_YEARS_SQL);
    expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(false);
  });
  it("records the SQL of the loaded question, with model tags renamed by the init", async () => {
    setupCardEndpoints(ORDERS_MODEL);
    const { store, sendTurn, initializeNavigatedQB } = setup();
    mockAgentTurns([
      [metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(MODEL_SQL) })],
    ]);

    await sendTurn({ hasQbBuffer: false });
    await initializeNavigatedQB();

    const questionSql = Lib.rawNativeQuery(
      checkNotNull(getQuestion(store.getState())).query(),
    );
    expect(questionSql).toContain("{{#5-orders-model}}");
    expect(
      getMetabotSqlModeEntry(store.getState(), conversationIdForAgent(store))
        ?.lastAppliedSql,
    ).toBe(questionSql);
  });

  it.each(["aborted", "failed", "streamed-error"] as const)(
    "opens the native card of a %s turn, without a run and with the editor closed",
    async (ending) => {
      const { store, runQuestionQuerySpy, sendTurn, initializeNavigatedQB } =
        setup();
      mockInterruptedTurn(
        [metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(FIRST_SQL) })],
        ending,
      );

      await sendTurn({ hasQbBuffer: false });

      expect(navigate).toHaveBeenCalledTimes(1);
      await initializeNavigatedQB();
      expect(runQuestionQuerySpy).not.toHaveBeenCalled();
      expect(store.getState().qb.uiControls.isNativeEditorOpen).toBe(false);
      expect(
        getMetabotSqlModeEntry(store.getState(), conversationIdForAgent(store)),
      ).toEqual({ mode: "chart", lastAppliedSql: FIRST_SQL });
    },
  );

  it("keeps the chart display of the query builder for a native card with no display", async () => {
    const { store, sendTurn, initializeNavigatedQB } = setup();
    mockAgentTurns([
      [
        metabotNativeCardPart({
          datasetQuery: mbqlNativeQuery(SMOOTHED_SQL),
          display: null,
        }),
      ],
    ]);

    await sendTurn({ hasQbBuffer: false, display: "bar" });
    await initializeNavigatedQB();

    expect(checkNotNull(getQuestion(store.getState())).display()).toBe("bar");
  });

  it("keeps the display of a native card that has one", async () => {
    const { store, sendTurn, initializeNavigatedQB } = setup();
    mockAgentTurns([
      [metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(SMOOTHED_SQL) })],
    ]);

    await sendTurn({ hasQbBuffer: false, display: "bar" });
    await initializeNavigatedQB();

    expect(checkNotNull(getQuestion(store.getState())).display()).toBe("line");
  });

  it("opens a notebook card at once when it follows a native card in the same turn", async () => {
    const { store, sendTurn } = setup();
    mockAgentTurns([
      [
        metabotNativeCardPart({ datasetQuery: mbqlNativeQuery(FIRST_SQL) }),
        metabotNativeCardPart({ datasetQuery: mbqlOrdersQuery }),
      ],
    ]);

    await sendTurn({ hasQbBuffer: false });

    expect(navigate).toHaveBeenCalledTimes(1);
    const card = deserializeCardFromQuery(
      String(jest.mocked(navigate).mock.calls[0][0]),
    );
    expect(card.dataset_query).toEqual(mbqlOrdersQuery);
    expect(store.getState().qb.pendingAutoRun).toBeNull();
  });
});
