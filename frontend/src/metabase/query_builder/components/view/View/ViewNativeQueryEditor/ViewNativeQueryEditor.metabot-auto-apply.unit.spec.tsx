// The native editor toggle and its text field are part of the tested flow.
jest.unmock("metabase/querying/components/NativeQueryEditor");

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { P, isMatching } from "ts-pattern";

import { setupAdhocQueryEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import {
  deserializeCardFromQuery,
  deserializeCardFromUrl,
} from "metabase/common/utils/card";
import { MetabotProvider } from "metabase/metabot";
import { useInlineSQLPrompt } from "metabase/metabot/components/MetabotInlineSQLPrompt";
import {
  type MetabotAgentId,
  getMetabotSqlModeEntry,
  metabotSqlEditedByUser,
  metabotSqlStarted,
  sendAgentRequest,
  startNewConversation,
  submitInput,
} from "metabase/metabot/state";
import {
  conversationIdForAgent,
  createTestMetabotState,
} from "metabase/metabot/tests/utils";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import type * as Router from "metabase/router";
import { navigate } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockDataset,
  createMockNativeDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";

import * as querying from "../../../../actions/querying";
import { getQuestion } from "../../../../store/selectors";

import {
  QueryBuilderEditor,
  TEST_DB,
  codeEditPart,
  createChatContext,
  createQueryBuilderStateWithSavedCard,
  createQueryBuilderStateWithSql,
  getQueryBuilderSql,
  getRunSql,
  getTestIdText,
  lastAgentRequestBody,
  metabotNativeCardPart,
  mockAgentTurns,
  mockRunQuestionQuery,
  nativeDatasetQuery,
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

const mockedAiStreamingQuery = jest.mocked(aiStreamingQuery);

const INITIAL_SQL = "SELECT 1";

const TEST_NATIVE_CARD = createMockCard({
  id: 101,
  dataset_query: createMockNativeDatasetQuery({
    database: TEST_DB.id,
    native: { query: INITIAL_SQL },
  }),
});

/** Shows the SQL that the inline prompt proposes as a diff, or nothing. */
const QuerySuggestionProbe = () => {
  const question = checkNotNull(useSelector(getQuestion));
  const inlinePrompt = useInlineSQLPrompt(question, "qb");
  const proposedSql = inlinePrompt.proposedQuestion
    ? Lib.rawNativeQuery(inlinePrompt.proposedQuestion.query())
    : "";

  return <div data-testid="qb-proposed-sql">{proposedSql}</div>;
};

const METABOT_SQL = "SELECT CREATED_AT, TOTAL\nFROM ORDERS";
const NEW_SQL = "SELECT CREATED_AT, TOTAL\nFROM ORDERS\nWHERE TOTAL > 10";
const NEWER_SQL = "SELECT CREATED_AT, TOTAL\nFROM ORDERS\nWHERE TOTAL > 20";

interface AutoApplySetupOpts {
  editorQuestion?: "metabot" | "saved";
}

function setupAutoApply({
  editorQuestion = "metabot",
}: AutoApplySetupOpts = {}) {
  const storeInitialState = createMockState({
    currentUser: createMockUser(),
    settings: mockSettings({ "llm-metabot-configured?": true }),
    entities: createMockEntitiesState({
      databases: [TEST_DB],
      questions: [TEST_NATIVE_CARD],
    }),
    metabot: createTestMetabotState(),
    qb:
      editorQuestion === "saved"
        ? createQueryBuilderStateWithSavedCard(TEST_NATIVE_CARD)
        : createQueryBuilderStateWithSql(METABOT_SQL),
  });
  const runQuestionQuery = mockRunQuestionQuery();

  const { store } = renderWithProviders(
    <MetabotProvider>
      <QuerySuggestionProbe />
      <QueryBuilderEditor />
    </MetabotProvider>,
    { storeInitialState },
  );

  const sendTurn = async ({
    agentId = "omnibot",
    hasQbBuffer = true,
    qbSql = hasQbBuffer ? getQueryBuilderSql() : undefined,
  }: {
    agentId?: MetabotAgentId;
    hasQbBuffer?: boolean;
    qbSql?: string;
  } = {}) => {
    await act(async () => {
      await store.dispatch(
        sendAgentRequest({
          message: "Change the chart",
          conversation_id: conversationIdForAgent(store, agentId),
          assistant_message_id: `msg-${mockedAiStreamingQuery.mock.calls.length}`,
          isFullPageMetabot: false,
          context: createChatContext({ qbSql }),
        }),
      );
    });
  };

  const submitTurn = async (agentId: MetabotAgentId) => {
    await act(async () => {
      await store.dispatch(
        submitInput({
          type: "text",
          message: "Change the chart",
          conversationId: conversationIdForAgent(store, agentId),
          context: createChatContext({ qbSql: getQueryBuilderSql() }),
        }),
      );
    });
  };

  const isNativeEditorOpen = () =>
    store.getState().qb.uiControls.isNativeEditorOpen;
  const getSqlModeEntry = () =>
    getMetabotSqlModeEntry(store.getState(), conversationIdForAgent(store));

  return {
    store,
    runQuestionQuery,
    sendTurn,
    submitTurn,
    isNativeEditorOpen,
    getSqlModeEntry,
  };
}

const expectQuestionSql = (sql: string) =>
  waitFor(() => expect(getTestIdText("qb-sql")).toBe(sql));

const expectProposedSql = (sql: string) =>
  waitFor(() => expect(getTestIdText("qb-proposed-sql")).toBe(sql));

const openEditorWithToggle = async () =>
  userEvent.click(await screen.findByTestId("visibility-toggler"));

const metabotCard = (sql: string) =>
  metabotNativeCardPart({ datasetQuery: nativeDatasetQuery(sql) });

const editEditorText = async (sql: string) => {
  fireEvent.change(await screen.findByRole("textbox"), {
    target: { value: sql },
  });
  await expectQuestionSql(sql);
};

const lastNavigatedPath = (): unknown =>
  jest.mocked(navigate).mock.calls.at(-1)?.[0];

/** The SQL of the card that the next query builder init opens and runs. */
const getPendingAutoRunSql = (store: { getState: () => State }) => {
  const pendingAutoRun = checkNotNull(store.getState().qb.pendingAutoRun);
  const card = deserializeCardFromQuery(pendingAutoRun.url);
  return Lib.rawNativeQuery(
    Question.create({ dataset_query: card.dataset_query }).query(),
  );
};

const CREATED_SQL = "SELECT CREATED_AT, COUNT(*)\nFROM ORDERS\nGROUP BY 1";
const EDITED_SQL =
  "SELECT CREATED_AT, COUNT(*)\nFROM ORDERS\nWHERE TOTAL > 10\nGROUP BY 1";

describe("query builder SQL that Metabot started from the sidebar", () => {
  beforeEach(() => {
    mockedAiStreamingQuery.mockReset();
    jest.mocked(findMatchingInflightAiStreamingRequests).mockReturnValue([]);
    jest.mocked(navigate).mockReset();
    setupQueryBuilderMetabotEndpoints();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fetchMock.removeRoutes();
  });

  it("applies and runs an omnibot code_edit after Metabot started the SQL", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);

    await sendTurn({ hasQbBuffer: false });
    await sendTurn();

    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));
    expect(getRunSql(runQuestionQuery)).toBe(NEW_SQL);
    expect(getSqlModeEntry()?.lastAppliedSql).toBe(getTestIdText("qb-sql"));
    expect(screen.getByTestId("qb-proposed-sql")).toBeEmptyDOMElement();
    expect(isNativeEditorOpen()).toBe(false);
  });

  it("applies and runs two Metabot edits in a row without a diff", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
      [codeEditPart({ sql: NEWER_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    await sendTurn();
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));
    expect(getSqlModeEntry()?.lastAppliedSql).toBe(getTestIdText("qb-sql"));

    await sendTurn();

    await expectQuestionSql(NEWER_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(2));
    expect(getRunSql(runQuestionQuery, 1)).toBe(NEWER_SQL);
    expect(getSqlModeEntry()?.lastAppliedSql).toBe(NEWER_SQL);
    expect(screen.getByTestId("qb-proposed-sql")).toBeEmptyDOMElement();
    expect(isNativeEditorOpen()).toBe(false);
  });

  it("opens the editor and auto-applies a code_edit with show_sql", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL, showSql: true })],
    ]);

    await sendTurn({ hasQbBuffer: false });
    await sendTurn();

    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));
    expect(getRunSql(runQuestionQuery)).toBe(NEW_SQL);
    expect(screen.getByTestId("qb-proposed-sql")).toBeEmptyDOMElement();
    expect(isNativeEditorOpen()).toBe(true);
    expect(getSqlModeEntry()?.mode).toBe("sql-shown");
  });

  it("keeps the editor open and auto-applies after the user opens it with the toggle", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });

    await openEditorWithToggle();
    expect(isNativeEditorOpen()).toBe(true);
    expect(getSqlModeEntry()?.mode).toBe("sql-shown");

    await sendTurn();

    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));
    expect(getRunSql(runQuestionQuery)).toBe(NEW_SQL);
    expect(isNativeEditorOpen()).toBe(true);
  });

  it("shows later Metabot changes as a diff after a hand edit", async () => {
    const { store, runQuestionQuery, sendTurn, isNativeEditorOpen } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
      [codeEditPart({ sql: NEWER_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    await sendTurn();
    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch(metabotSqlEditedByUser());
    });
    await sendTurn();

    await expectProposedSql(NEWER_SQL);
    expect(getTestIdText("qb-sql")).toBe(NEW_SQL);
    expect(runQuestionQuery).toHaveBeenCalledTimes(1);
    expect(isNativeEditorOpen()).toBe(true);
  });

  it("keeps user-in-control when Metabot opens new SQL in the same conversation", async () => {
    const { store, sendTurn, getSqlModeEntry } = setupAutoApply();
    mockAgentTurns([[metabotCard(METABOT_SQL)], [metabotCard(NEW_SQL)]]);
    await sendTurn({ hasQbBuffer: false });
    act(() => {
      store.dispatch(metabotSqlEditedByUser());
    });

    await sendTurn();

    expect(getSqlModeEntry()).toEqual({
      mode: "user-in-control",
      lastAppliedSql: NEW_SQL,
    });
  });

  it("auto-applies again in a new conversation after a hand edit", async () => {
    const { store, runQuestionQuery, sendTurn } = setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    act(() => {
      store.dispatch(metabotSqlEditedByUser());
      store.dispatch(startNewConversation({ agentId: "omnibot" }));
    });

    await sendTurn({ hasQbBuffer: false });
    await sendTurn();

    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("qb-proposed-sql")).toBeEmptyDOMElement();
  });

  it("falls back to the diff when the SQL changed after the last apply", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen } = setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
      [codeEditPart({ sql: NEWER_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    await sendTurn();
    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));

    // The mocked CodeMirror sends no hand-edit event, as in a typing race.
    await openEditorWithToggle();
    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: `${NEW_SQL} -- mine` },
    });
    await expectQuestionSql(`${NEW_SQL} -- mine`);
    await sendTurn();

    await expectProposedSql(NEWER_SQL);
    expect(getTestIdText("qb-sql")).toBe(`${NEW_SQL} -- mine`);
    expect(runQuestionQuery).toHaveBeenCalledTimes(1);
    expect(isNativeEditorOpen()).toBe(true);
  });

  it("keeps today's diff for a native question that Metabot did not start", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([[codeEditPart({ sql: NEW_SQL })]]);

    await sendTurn();

    await expectProposedSql(NEW_SQL);
    expect(getTestIdText("qb-sql")).toBe(METABOT_SQL);
    expect(runQuestionQuery).not.toHaveBeenCalled();
    expect(isNativeEditorOpen()).toBe(true);
    expect(getSqlModeEntry()).toBeUndefined();
  });

  it("keeps a visible diff on a saved question that the user opened in the same conversation", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply({ editorQuestion: "saved" });
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });

    await openEditorWithToggle();
    expect(getSqlModeEntry()?.mode).toBe("chart");
    await sendTurn();

    await expectProposedSql(NEW_SQL);
    expect(getTestIdText("qb-sql")).toBe(INITIAL_SQL);
    expect(getTestIdText("qb-question-id")).toBe(String(TEST_NATIVE_CARD.id));
    expect(runQuestionQuery).not.toHaveBeenCalled();
    expect(isNativeEditorOpen()).toBe(true);
  });

  it("keeps the diff for the inline SQL prompt while the sidebar is in auto mode", async () => {
    const { runQuestionQuery, sendTurn, getSqlModeEntry } = setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    expect(getSqlModeEntry()?.mode).toBe("chart");

    await sendTurn({ agentId: "sql" });

    await expectProposedSql(NEW_SQL);
    expect(runQuestionQuery).not.toHaveBeenCalled();
  });

  it("sends auto_apply on the qb buffer of the omnibot request only", async () => {
    const { submitTurn } = setupAutoApply();
    mockAgentTurns([[metabotCard(METABOT_SQL)], [], []]);
    await submitTurn("omnibot");

    await submitTurn("omnibot");
    expect(lastAgentRequestBody()).toMatchObject({
      context: {
        user_is_viewing: [
          { type: "adhoc" },
          { type: "code_editor", buffers: [{ id: "qb", auto_apply: true }] },
        ],
      },
    });

    await submitTurn("sql");
    expect(lastAgentRequestBody()).toMatchObject({
      context: {
        user_is_viewing: [
          { type: "adhoc" },
          {
            type: "code_editor",
            buffers: [expect.not.objectContaining({ auto_apply: true })],
          },
        ],
      },
    });
  });
  describe("a turn that creates a native card and then edits it", () => {
    it("puts the edit into the new card, with one navigation and no run of the old question", async () => {
      const { store, runQuestionQuery, sendTurn, isNativeEditorOpen } =
        setupAutoApply();
      mockAgentTurns([
        [metabotCard(METABOT_SQL)],
        [metabotCard(CREATED_SQL), codeEditPart({ sql: EDITED_SQL })],
      ]);
      await sendTurn({ hasQbBuffer: false });
      jest.mocked(navigate).mockClear();

      await sendTurn();

      expect(getPendingAutoRunSql(store)).toBe(EDITED_SQL);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(runQuestionQuery).not.toHaveBeenCalled();
      expect(getTestIdText("qb-sql")).toBe(METABOT_SQL);
      expect(screen.getByTestId("qb-proposed-sql")).toBeEmptyDOMElement();
      expect(store.getState().qb.pendingAutoRun?.isNativeEditorOpen).toBe(
        false,
      );
      expect(isNativeEditorOpen()).toBe(false);
    });

    it("opens the editor on the new card when the edit has show_sql", async () => {
      const { store, sendTurn } = setupAutoApply();
      mockAgentTurns([
        [metabotCard(METABOT_SQL)],
        [
          metabotCard(CREATED_SQL),
          codeEditPart({ sql: EDITED_SQL, showSql: true }),
        ],
      ]);
      await sendTurn({ hasQbBuffer: false });

      await sendTurn();

      expect(getPendingAutoRunSql(store)).toBe(EDITED_SQL);
      expect(store.getState().qb.pendingAutoRun?.isNativeEditorOpen).toBe(true);
    });

    it.each([
      {
        state: "a question that Metabot did not start",
        startedByMetabot: false,
      },
      { state: "chart mode with changed SQL", startedByMetabot: true },
    ])(
      "opens the new card with the editor open and no run, when the edit is a diff, for $state",
      async ({ startedByMetabot }) => {
        const { store, runQuestionQuery, sendTurn } = setupAutoApply();
        mockAgentTurns([
          ...(startedByMetabot ? [[metabotCard(METABOT_SQL)]] : []),
          [metabotCard(CREATED_SQL), codeEditPart({ sql: EDITED_SQL })],
        ]);
        if (startedByMetabot) {
          await sendTurn({ hasQbBuffer: false });
        }

        await sendTurn({
          qbSql: startedByMetabot ? `${METABOT_SQL} -- formatted` : undefined,
        });

        expect(getPendingAutoRunSql(store)).toBe(CREATED_SQL);
        await expectProposedSql(EDITED_SQL);
        expect(store.getState().qb.pendingAutoRun).toMatchObject({
          isNativeEditorOpen: true,
          shouldRun: false,
        });
        expect(runQuestionQuery).not.toHaveBeenCalled();
      },
    );

    it("keeps the edit as a diff after a hand edit", async () => {
      const { store, runQuestionQuery, sendTurn } = setupAutoApply();
      mockAgentTurns([
        [metabotCard(METABOT_SQL)],
        [metabotCard(CREATED_SQL), codeEditPart({ sql: EDITED_SQL })],
      ]);
      await sendTurn({ hasQbBuffer: false });
      act(() => {
        store.dispatch(metabotSqlEditedByUser());
      });

      await sendTurn();

      expect(getPendingAutoRunSql(store)).toBe(CREATED_SQL);
      await expectProposedSql(EDITED_SQL);
      expect(runQuestionQuery).not.toHaveBeenCalled();
    });
  });

  it("does not send auto_apply when the SQL changed with no hand edit", async () => {
    const { sendTurn, submitTurn } = setupAutoApply();
    mockAgentTurns([[metabotCard(METABOT_SQL)], []]);
    await sendTurn({ hasQbBuffer: false });

    // The mocked CodeMirror sends no hand-edit event, as for "Format query".
    await openEditorWithToggle();
    await editEditorText(`${METABOT_SQL} -- formatted`);
    await submitTurn("omnibot");

    expect(lastAgentRequestBody()).toMatchObject({
      context: {
        user_is_viewing: [
          { type: "adhoc" },
          {
            type: "code_editor",
            buffers: [expect.not.objectContaining({ auto_apply: true })],
          },
        ],
      },
    });
  });

  it("shows a diff for a request without auto_apply, even when the SQL matches when the edit arrives", async () => {
    const { runQuestionQuery, sendTurn } = setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });

    await sendTurn({ qbSql: "SELECT 'another question'" });

    await expectProposedSql(NEW_SQL);
    expect(getTestIdText("qb-sql")).toBe(METABOT_SQL);
    expect(runQuestionQuery).not.toHaveBeenCalled();
  });

  it("does not run the query again for a code_edit that keeps the SQL", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: METABOT_SQL, showSql: true })],
    ]);
    await sendTurn({ hasQbBuffer: false });

    await sendTurn();

    expect(isNativeEditorOpen()).toBe(true);
    expect(getSqlModeEntry()?.mode).toBe("sql-shown");
    expect(runQuestionQuery).not.toHaveBeenCalled();

    // A later change must not bring back a diff of the old edit.
    await editEditorText(`${METABOT_SQL} -- mine`);
    expect(screen.getByTestId("qb-proposed-sql")).toBeEmptyDOMElement();
    expect(isNativeEditorOpen()).toBe(true);
  });

  it("gives a saved question the URL of a hand edit after an auto-apply", async () => {
    setupAdhocQueryEndpoint(createMockDataset());
    const { store, sendTurn } = setupAutoApply({ editorQuestion: "saved" });
    // The real thunk runs the query and updates the URL.
    jest.mocked(querying.runQuestionQuery).mockRestore();
    mockAgentTurns([[codeEditPart({ sql: NEW_SQL })]]);
    // Metabot started this SQL, and the user saved it as card 101.
    act(() => {
      store.dispatch(
        metabotSqlStarted({
          conversationId: conversationIdForAgent(store),
          sql: INITIAL_SQL,
          isSqlShown: false,
        }),
      );
    });

    await sendTurn();

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1),
    );
    const to = lastNavigatedPath();
    expect(to).toMatchObject({ pathname: "/question" });
    const hash = isMatching({ hash: P.string }, to) ? to.hash : "";
    const card = deserializeCardFromUrl(hash.replace(/^#/, ""));
    expect(card).toMatchObject({ original_card_id: TEST_NATIVE_CARD.id });
    expect(card).not.toHaveProperty("id");
  });

  it("moves the SQL back to the chart when the user closes the editor with the toggle", async () => {
    const { runQuestionQuery, sendTurn, isNativeEditorOpen, getSqlModeEntry } =
      setupAutoApply();
    mockAgentTurns([
      [metabotCard(METABOT_SQL)],
      [codeEditPart({ sql: NEW_SQL })],
    ]);
    await sendTurn({ hasQbBuffer: false });
    await openEditorWithToggle();
    expect(getSqlModeEntry()?.mode).toBe("sql-shown");

    await openEditorWithToggle();

    expect(isNativeEditorOpen()).toBe(false);
    expect(getSqlModeEntry()?.mode).toBe("chart");
    await sendTurn();
    await expectQuestionSql(NEW_SQL);
    await waitFor(() => expect(runQuestionQuery).toHaveBeenCalledTimes(1));
    expect(isNativeEditorOpen()).toBe(false);
  });
});
