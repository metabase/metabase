import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryMetadataEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockQueryBuilderState } from "__support__/state";
import { screen } from "__support__/ui";
import { aiStreamingQuery } from "metabase/api/ai-streaming";
import type { KnownDataPart } from "metabase/api/ai-streaming/schemas";
import { useDispatch, useSelector } from "metabase/redux";
import { setIsNativeEditorOpen } from "metabase/redux/query-builder";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardDisplayType,
  DatasetQuery,
  MetabotAdhocQueryInfo,
  MetabotChatContext,
  MetabotCodeEditorContext,
} from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { setDatasetQuery } from "../../../../actions/core/core";
import * as querying from "../../../../actions/querying";
import { getQuestion } from "../../../../store/selectors";

import { ViewNativeQueryEditor } from "./ViewNativeQueryEditor";

export const TEST_DB = createSampleDatabase();

export const nativeDatasetQuery = (sql: string): DatasetQuery =>
  createMockNativeDatasetQuery({
    database: TEST_DB.id,
    native: { query: sql },
  });

/** The query builder store with an unsaved native question open. */
export const createQueryBuilderStateWithSql = (sql: string) =>
  createMockQueryBuilderState({
    card: Question.create({ dataset_query: nativeDatasetQuery(sql) }).card(),
  });

/**
 * The query builder store with a saved question open, as after its init: the
 * init gives the card an `original_card_id` (`fetchAndPrepareSavedQuestionCards`).
 */
export const createQueryBuilderStateWithSavedCard = (card: Card) =>
  createMockQueryBuilderState({
    card: { ...card, original_card_id: card.id },
    originalCard: { ...card },
  });

/** A native card of a Metabot turn; `display: null` is a card with no display, as `create_sql_query` sends it. */
export const metabotNativeCardPart = ({
  datasetQuery,
  showSql = false,
  display = "line",
}: {
  datasetQuery: DatasetQuery;
  showSql?: boolean;
  display?: CardDisplayType | null;
}): KnownDataPart => ({
  type: "data-generated_entity",
  data: {
    type: "card",
    id: "chart-1",
    title: "Orders over time",
    ...(display ? { display } : {}),
    query: { id: "query-1", query: datasetQuery },
    ...(showSql ? { show_sql: true } : {}),
  },
});

export const codeEditPart = ({
  sql,
  showSql = false,
}: {
  sql: string;
  showSql?: boolean;
}): KnownDataPart => ({
  type: "data-code_edit",
  data: {
    buffer_id: "qb",
    mode: "rewrite",
    value: sql,
    ...(showSql ? { show_sql: true } : {}),
  },
});

/** Each call of the mocked stream sends the parts of the next turn. */
export const mockAgentTurns = (turns: KnownDataPart[][]) => {
  const remainingTurns = [...turns];
  jest
    .mocked(aiStreamingQuery)
    .mockImplementation(async (_request, callbacks) => {
      const parts = remainingTurns.shift() ?? [];
      parts.forEach((part) => callbacks?.onDataPart?.(part));
      return { aborted: false, toolCalls: [], data: [] };
    });
};

/** The endpoints that a sidebar turn and the native editor call. */
export const setupQueryBuilderMetabotEndpoints = () => {
  setupEnterprisePlugins();
  setupDatabasesEndpoints([TEST_DB]);
  setupNativeQuerySnippetEndpoints();
  setupCollectionsEndpoints({ collections: [] });
  setupUserMetabotPermissionsEndpoint();
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [TEST_DB] }),
  );
  fetchMock.get("express:/api/metabot/conversations/:conversationId/title", {
    status: "ready",
    title: "Orders over time",
  });
};

export const getTestIdText = (testId: string) =>
  screen.getByTestId(testId).textContent;

export const lastAgentRequestBody = (): unknown =>
  jest.mocked(aiStreamingQuery).mock.calls.at(-1)?.[0].body;

/**
 * The context that the sidebar sends. Like the query builder context provider,
 * it holds the viewed question (its query and display) and, for a native
 * question, the `qb` editor buffer.
 */
export const createChatContext = ({
  qbSql,
  display,
}: {
  qbSql?: string;
  display?: CardDisplayType;
} = {}): MetabotChatContext => {
  const viewedQuestion: MetabotAdhocQueryInfo = {
    type: "adhoc",
    ...(qbSql != null ? { query: nativeDatasetQuery(qbSql) } : {}),
    ...(display ? { chart_configs: [{ display_type: display }] } : {}),
  };
  const qbEditor: MetabotCodeEditorContext = {
    type: "code_editor",
    buffers: [
      {
        id: "qb",
        source: { language: "sql", database_id: TEST_DB.id },
        cursor: { line: 1, column: 1 },
      },
    ],
  };
  const hasViewedQuestion = qbSql != null || display != null;

  return {
    user_is_viewing: [
      ...(hasViewedQuestion ? [viewedQuestion] : []),
      ...(qbSql != null ? [qbEditor] : []),
    ],
    current_time_with_timezone: "2026-03-04T00:00:00Z",
    capabilities: [],
  };
};

/**
 * Mocks the `runQuestionQuery` thunk. Like the real thunk, it runs
 * `overrideWithQuestion`, else the question in the query builder store.
 * The returned mock gets the question that runs.
 */
export const mockRunQuestionQuery = () => {
  const runQuestion = jest.fn<void, [Question]>();
  jest
    .spyOn(querying, "runQuestionQuery")
    .mockImplementation(
      ({ overrideWithQuestion } = {}) =>
        async (_dispatch, getState) => {
          runQuestion(
            overrideWithQuestion ?? checkNotNull(getQuestion(getState())),
          );
        },
    );
  return runQuestion;
};

export const getRunSql = (
  runQuestion: ReturnType<typeof mockRunQuestionQuery>,
  callIndex = 0,
) => {
  const question = runQuestion.mock.calls[callIndex]?.[0];
  return question ? Lib.rawNativeQuery(question.query()) : undefined;
};

const noop = () => {};

/**
 * The native editor of the query builder, on the question in the query builder
 * store, with the real `setDatasetQuery` and `runQuestionQuery` thunks.
 */
export function QueryBuilderEditor() {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const isNativeEditorOpen = useSelector(
    (state) => state.qb.uiControls.isNativeEditorOpen,
  );
  if (!question) {
    return null;
  }

  return (
    <>
      <ViewNativeQueryEditor
        question={question}
        query={checkNotNull(question.legacyNativeQuery())}
        isNativeEditorOpen={isNativeEditorOpen}
        isRunnable
        isRunning={false}
        isResultDirty={false}
        isShowingDataReference={false}
        isShowingTemplateTagsEditor={false}
        isShowingSnippetSidebar={false}
        runQuery={noop}
        toggleEditor={noop}
        handleResize={noop}
        setDatasetQuery={(query) =>
          dispatch(setDatasetQuery(query.datasetQuery()))
        }
        runQuestionQuery={(opts) => dispatch(querying.runQuestionQuery(opts))}
        setNativeEditorSelectedRange={noop}
        openDataReferenceAtQuestion={noop}
        openSnippetModalWithSelectedText={noop}
        insertSnippet={noop}
        setIsNativeEditorOpen={(isOpen) =>
          dispatch(setIsNativeEditorOpen(isOpen))
        }
        setParameterValue={noop}
        onOpenModal={noop}
        toggleDataReference={noop}
        toggleTemplateTagsEditor={noop}
        toggleSnippetSidebar={noop}
        closeSnippetModal={noop}
      />
      <output data-testid="qb-sql">
        {Lib.rawNativeQuery(question.query())}
      </output>
      <output data-testid="qb-question-id">{question.id() ?? ""}</output>
    </>
  );
}

/** The SQL in the query builder, as the test shows it; `undefined` with no native question. */
export const getQueryBuilderSql = () =>
  screen.queryByTestId("qb-sql")?.textContent ?? undefined;
