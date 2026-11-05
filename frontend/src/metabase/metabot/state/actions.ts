import {
  type ThunkDispatch,
  type UnknownAction,
  isRejected,
} from "@reduxjs/toolkit";
import { P, isMatching, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import type { ProcessedChatResponse } from "metabase/api/ai-streaming/process-stream";
import type {
  GeneratedCard,
  GeneratedEntity,
} from "metabase/api/ai-streaming/schemas";
import { listTag } from "metabase/api/tags";
import { getUser } from "metabase/current-user";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  setIsNativeEditorOpen,
  setPendingAutoRun,
} from "metabase/redux/query-builder";
import type { Dispatch, State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { createAsyncThunk } from "metabase/redux/utils";
import { navigate } from "metabase/router";
import { getSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import { retry } from "metabase/utils/retry";
import { uuid } from "metabase/utils/uuid";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  DatasetQuery,
  JSONValue,
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotChatContext,
  MetabotCodeEdit,
  MetabotCodeEditorBufferContext,
  MetabotStateContext,
} from "metabase-types/api";

import { metabotApi } from "../api";
import {
  METABOT_ERR_MSG,
  type MetabotProfileId,
  isHistoryEnabledProfile,
} from "../constants";
import { PLUGIN_METABOT_SLASH_COMMANDS } from "../plugins";
import { isReasoningVisible } from "../utils/reasoning-visibility";

import { metabot } from "./reducer";
import {
  getAgentRequestMetadata,
  getConversationTitle,
  getDebugMode,
  getDeveloperMessage,
  getHasConversation,
  getIsConversationProcessing,
  getIsPollingForTitle,
  getMessageIdToRewind,
  getMessages,
  getMetabotConversationId,
  getMetabotSqlModeEntry,
  getPromptText,
  getUserPromptMessage,
} from "./selectors";
import type {
  MetabotAgentDataPartMessage,
  MetabotAgentId,
  MetabotAgentTurnDisplayError,
  MetabotAgentTurnError,
  MetabotUserChatMessage,
  SlashCommand,
} from "./types";
import {
  createMessageId,
  getServerErrorDisplay,
  parseSlashCommand,
} from "./utils";

export const {
  addAgentTextDelta,
  addAgentMessage,
  addDeveloperMessage,
  addUserMessage,
  setIsProcessing,
  setConversationSnapshot,
  setConversationTitle,
  setNavigateToPath,
  setProfileOverride,
  reasoningStart,
  reasoningDelta,
  toolCallStart,
  toolCallArgs,
  toolCallEnd,
  toolCallTitled,
  toolCallSearchResults,
  setMetabotReqIdOverride,
  setDebugMode,
  createAgent,
  destroyAgent,
  attachAgentToConversation,
  startNewConversation,
  addSuggestedCodeEdit,
  removeSuggestedCodeEdit,
  metabotSqlStarted,
  metabotSqlLoaded,
  metabotSqlApplied,
  metabotSqlShown,
  metabotSqlHidden,
  metabotSqlEditedByUser,
  setIsPollingForTitle,
  markChartSaved,
} = metabot.actions;

const TITLE_POLL_INTERVAL_MS = 1500;
const TITLE_POLL_MAX_ATTEMPTS = 40;
const TITLE_PENDING = new Error("Metabot conversation title pending");

type PollConversationTitleOptions = {
  dispatch: ThunkDispatch<State, unknown, UnknownAction>;
  getState: () => State;
  conversationId: string;
};

const pollConversationTitle = async ({
  dispatch,
  getState,
  conversationId,
}: PollConversationTitleOptions) => {
  dispatch(setIsPollingForTitle({ conversationId, isPollingForTitle: true }));
  try {
    const title = await retry(
      async () => {
        const result = await dispatch(
          metabotApi.endpoints.getMetabotConversationTitle.initiate(
            conversationId,
            { forceRefetch: true, subscribe: false },
          ),
        );

        if (result.data?.status !== "ready") {
          throw TITLE_PENDING;
        }

        return result.data.title;
      },
      {
        maxRetries: TITLE_POLL_MAX_ATTEMPTS - 1,
        shouldRetry: (error) => error === TITLE_PENDING,
        delayMs: () => TITLE_POLL_INTERVAL_MS,
      },
    ).catch(() => null);

    if (!title) {
      return;
    }

    if (getHasConversation(getState(), conversationId)) {
      dispatch(setConversationTitle({ conversationId, title }));
    }
    dispatch(
      metabotApi.util.invalidateTags([listTag("metabot-conversations")]),
    );
  } finally {
    dispatch(
      setIsPollingForTitle({ conversationId, isPollingForTitle: false }),
    );
  }
};

type HandledResponseError = {
  error: MetabotAgentTurnError;
  display: MetabotAgentTurnDisplayError;
};

const handleResponseError = (
  error: unknown,
  metabotName: string,
): HandledResponseError => {
  // HTTP failures arrive as the legacy client's `{ status, data }` shape, with
  // the parsed response body under `data`.
  return match(error)
    .with({ status: 400 }, () => ({
      error: { type: "http_error", message: t`Invalid request format` },
      display: {
        type: "message" as const,
        message: METABOT_ERR_MSG.format(t`Invalid request format`),
      },
    }))
    .with({ status: 401 }, () => ({
      error: { type: "unauthenticated" },
      display: {
        type: "alert" as const,
        message: METABOT_ERR_MSG.unauthenticated(metabotName),
      },
    }))
    .with(
      { status: 402, data: { "error-code": "metabase_ai_managed_locked" } },
      () => ({
        error: { type: "metabase_ai_managed_locked" },
        display: { type: "locked" as const, message: METABOT_ERR_MSG.locked },
      }),
    )
    .with(
      {
        status: P.number,
        data: { "error-code": "ai_usage_limit_reached", message: P.string },
      },
      ({ data: { message } }) => ({
        error: { type: "ai_usage_limit_reached", message },
        display: { type: "message" as const, message },
      }),
    )
    .with({ status: 409 }, () => ({
      error: { type: "conversation_out_of_sync" },
      display: { type: "message" as const, message: METABOT_ERR_MSG.outOfSync },
    }))
    .with(
      { status: P.number, data: { message: P.string } },
      ({ data: { message } }) => ({
        error: { type: "http_error", message },
        display: {
          type: "message" as const,
          message: METABOT_ERR_MSG.format(message),
        },
      }),
    )
    .with(P.string, (err) => ({
      error: { type: "http_error", message: err },
      display: {
        type: "message" as const,
        message: METABOT_ERR_MSG.format(err),
      },
    }))
    .otherwise(() => ({
      error: { type: "unknown" },
      display: {
        type: "message" as const,
        message: METABOT_ERR_MSG.default,
      },
    }));
};

export const setVisible =
  (payload: { agentId: MetabotAgentId; visible: boolean }) =>
  (dispatch: Dispatch, getState: () => State) => {
    const currentUser = getUser(getState());
    if (!currentUser) {
      console.error(
        "Metabot can not be opened while there is no signed in user",
      );
      return;
    }

    dispatch(metabot.actions.setVisible(payload));
  };

export const executeSlashCommand = createAsyncThunk<
  void,
  { command: SlashCommand; conversationId: string }
>(
  "metabase/metabot/executeSlashCommand",
  async ({ command, conversationId }, { dispatch, getState }) => {
    match(command)
      .with({ cmd: "profile" }, ({ args }) => {
        if (args.length <= 1) {
          // cast allows custom overrides for development purposes; the backend validates
          dispatch(
            setProfileOverride({
              conversationId,
              // Unjustified type cast. FIXME
              profile: args[0] as MetabotProfileId | undefined,
            }),
          );
        } else {
          dispatch(addUndo({ message: "/profile <name>" }));
        }
      })
      .with({ cmd: "metabot" }, ({ args }) => {
        if (args.length <= 1) {
          dispatch(setMetabotReqIdOverride({ id: args[0], conversationId }));
        } else {
          dispatch(addUndo({ message: "/metabot <name>" }));
        }
      })
      .with({ cmd: "debug" }, () => {
        const currentDebugMode = getDebugMode(getState());
        const newDebugMode = !currentDebugMode;
        dispatch(setDebugMode(newDebugMode));
        dispatch(
          addUndo({
            message: newDebugMode
              ? "Debug mode enabled"
              : "Debug mode disabled",
          }),
        );
      })
      .otherwise(() => {
        const handled = PLUGIN_METABOT_SLASH_COMMANDS.handleSlashCommand({
          command,
          conversationId,
          dispatch,
          getState,
        });
        if (!handled) {
          dispatch(addUndo({ message: "Unknown command" }));
        }
      });
  },
);

export type MetabotPromptSubmissionResult =
  | {
      prompt: string;
      success: true;
      shouldRetry?: void;
      data?: SendAgentRequestResult;
    }
  | {
      prompt: string;
      success: false;
      shouldRetry: false;
      error?: MetabotAgentTurnDisplayError;
      data?: void;
    }
  | {
      prompt: string;
      success: false;
      shouldRetry: true;
      error?: MetabotAgentTurnDisplayError;
      data?: void;
    };

export const submitInput = createAsyncThunk<
  MetabotPromptSubmissionResult,
  Omit<MetabotUserChatMessage, "id" | "role"> & {
    context: MetabotChatContext;
    conversationId: string;
    metabot_id?: string;
    profile?: MetabotProfileId;
    retryMessageId?: string;
    isFullPageMetabot?: boolean;
  }
>(
  "metabase/metabot/submitInput",
  async (payload, { dispatch, getState, signal }) => {
    const state = getState();
    const {
      conversationId,
      message: rawPrompt,
      profile,
      retryMessageId,
      isFullPageMetabot,
      ...data
    } = payload;

    const prompt = rawPrompt.trim();
    if (prompt === "") {
      console.warn(
        "An empty prompt was submitted to conversation: ",
        conversationId,
      );
      return { prompt, success: true };
    }

    try {
      if (getIsConversationProcessing(state, conversationId)) {
        console.error("Metabot is actively serving a request");
        return { prompt, success: false, shouldRetry: false };
      }

      // if there were from the last prompt, remove the last prompt from the history
      const rewindToMessageId = getMessageIdToRewind(state, conversationId);
      if (rewindToMessageId) {
        dispatch(
          rewindConversation({
            conversationId,
            messageId: rewindToMessageId,
          }),
        );
      }

      const command = parseSlashCommand(prompt);
      if (command) {
        await dispatch(
          executeSlashCommand({
            command,
            conversationId,
          }),
        );
        return { prompt, success: true };
      }

      // it's important that we get the current metadata containing the history before
      // altering it by adding the current message the user is wanting to send
      const agentMetadata = getAgentRequestMetadata(
        getState(),
        conversationId,
        retryMessageId,
      );
      const messageId = createMessageId();
      const userMessageId = retryMessageId ?? uuid();
      const assistantMessageId = uuid();
      const promptWithDevMessage =
        getDeveloperMessage(state, conversationId) + prompt;
      dispatch(
        addUserMessage({
          id: messageId,
          externalId: userMessageId,
          ..._.omit(data, ["context", "metabot_id"]),
          message: prompt,
          conversationId,
        }),
      );

      const sendMessageRequestPromise = dispatch(
        sendAgentRequest({
          ...data,
          context: data.context,
          message: promptWithDevMessage,
          conversation_id: conversationId,
          ...agentMetadata,
          user_message_id: userMessageId,
          assistant_message_id: assistantMessageId,
          ...(profile ? { profile_id: profile } : {}),
          isFullPageMetabot: isFullPageMetabot ?? false,
        }),
      );
      signal.addEventListener("abort", () => {
        sendMessageRequestPromise.abort();
      });

      const result = await sendMessageRequestPromise;

      if (isRejected(result)) {
        const metabotName = getSetting(getState(), "metabot-name");
        return {
          prompt: rawPrompt,
          success: false,
          shouldRetry: result.payload?.shouldRetry ?? true,
          error: match(result)
            .returnType<MetabotAgentTurnDisplayError | undefined>()
            .with(
              P.union(
                { payload: { type: "abort" } },
                { meta: { aborted: true } },
              ),
              () => ({
                type: "aborted",
                message: t`Response from ${metabotName} was interrupted`,
              }),
            )
            .with(
              { payload: { type: "error" } },
              ({ payload }) => payload.display,
            )
            .otherwise(() => undefined),
        };
      }

      return { prompt, success: true, data: result.payload };
    } catch (error) {
      // NOTE: all errors should be caught above, this is is a catch-all
      // to make sure that this async action always resolves to a value
      console.error(error);
      return {
        prompt,
        success: false,
        shouldRetry: true,
        error: { type: "message", message: METABOT_ERR_MSG.default },
      };
    }
  },
);

type SendAgentRequestError =
  | {
      type: "error";
      conversation_id: string;
      shouldRetry: boolean;
      serverStarted: boolean;
      error: MetabotAgentTurnError;
      display?: MetabotAgentTurnDisplayError;
    }
  | ({
      type: "abort";
      shouldRetry: false;
      unresolved_tool_calls: { toolCallId: string; toolName: string }[];
    } & MetabotAgentResponse);

type SendAgentRequestResult = MetabotAgentResponse & {
  processedResponse: ProcessedChatResponse;
};

const QB_BUFFER_ID = "qb";

const findCodeEditBuffer = (
  context: MetabotChatContext,
  bufferId: string,
): MetabotCodeEditorBufferContext | undefined => {
  const viewedBuffers = context.user_is_viewing.flatMap((item) =>
    item.type === "code_editor" ? item.buffers : [],
  );
  const buffers = [...viewedBuffers, ...(context.code_editor?.buffers ?? [])];

  return buffers.find((buffer) => buffer.id === bufferId);
};

/**
 * The sidebar conversation applies and runs Metabot SQL edits in the query
 * builder, when Metabot started that SQL and the user did not edit it.
 */
const isSidebarSqlAutoMode = (state: State, conversationId: string) => {
  const isSidebarConversation =
    conversationId === getMetabotConversationId(state, "omnibot");
  const mode = getMetabotSqlModeEntry(state, conversationId)?.mode;
  return isSidebarConversation && mode != null && mode !== "user-in-control";
};

/** The SQL text of a native query, as the query builder reads it; `null` for other queries. */
const getNativeSql = (datasetQuery: DatasetQuery): string | null => {
  try {
    const query = Question.create({ dataset_query: datasetQuery }).query();
    return Lib.queryDisplayInfo(query).isNative
      ? Lib.rawNativeQuery(query)
      : null;
  } catch {
    return null;
  }
};

/** The question that the query builder shows, as the request context describes it. */
const getViewedQuestion = (context: MetabotChatContext) => {
  for (const item of context.user_is_viewing) {
    if (
      item.type === "adhoc" ||
      item.type === "question" ||
      item.type === "model" ||
      item.type === "metric"
    ) {
      return item;
    }
  }
  return undefined;
};

/**
 * Metabot edits apply with no review only while the query builder still shows
 * the SQL of the last Metabot change. Else the backend tells the model that
 * the edit waits for the user.
 */
const canAutoApplyQbEdits = (
  state: State,
  conversationId: string,
  context: MetabotChatContext,
) => {
  const viewedQuery = getViewedQuestion(context)?.query;
  const viewedSql = viewedQuery ? getNativeSql(viewedQuery) : null;
  return (
    isSidebarSqlAutoMode(state, conversationId) &&
    viewedSql != null &&
    viewedSql === getMetabotSqlModeEntry(state, conversationId)?.lastAppliedSql
  );
};

const withQbAutoApply = (context: MetabotChatContext): MetabotChatContext => ({
  ...context,
  user_is_viewing: context.user_is_viewing.map((item) =>
    item.type === "code_editor"
      ? {
          ...item,
          buffers: item.buffers.map((buffer) =>
            buffer.id === QB_BUFFER_ID
              ? { ...buffer, auto_apply: true }
              : buffer,
          ),
        }
      : item,
  ),
});

const hasQbAutoApply = (context: MetabotChatContext) =>
  findCodeEditBuffer(context, QB_BUFFER_ID)?.auto_apply === true;

type MetabotSqlCard = {
  entity: GeneratedCard;
  sql: string;
  isSqlShown: boolean;
};

/**
 * The native card of a sidebar turn, or `null` for other entities. A card with
 * no display keeps the chart that the user sees.
 */
const toMetabotSqlCard = (
  entity: GeneratedEntity,
  context: MetabotChatContext,
  previousCard: MetabotSqlCard | undefined,
): MetabotSqlCard | null => {
  if (entity.type !== "card") {
    return null;
  }
  const sql = getNativeSql(entity.query.query);
  if (sql == null) {
    return null;
  }
  const viewedDisplay =
    getViewedQuestion(context)?.chart_configs?.[0]?.display_type;
  return {
    entity: entity.display ? entity : { ...entity, display: viewedDisplay },
    sql,
    isSqlShown: Boolean(previousCard?.isSqlShown) || entity.show_sql === true,
  };
};

/** The card with the SQL of a Metabot edit, for an edit that comes in the same turn. */
const withEditedSql = (
  card: MetabotSqlCard,
  codeEdit: MetabotCodeEdit,
): MetabotSqlCard => {
  const query = Lib.withNativeQuery(
    Question.create({ dataset_query: card.entity.query.query }).query(),
    codeEdit.value,
  );
  return {
    entity: {
      ...card.entity,
      query: { ...card.entity.query, query: Lib.toJsQuery(query) },
    },
    sql: Lib.rawNativeQuery(query),
    isSqlShown: card.isSqlShown || codeEdit.show_sql === true,
  };
};

/**
 * Opens the native card of a sidebar turn. The query builder runs it once,
 * unless the turn stopped or failed. A card with a pending Metabot diff opens
 * with the editor open and no run, so the user sees Accept and Reject.
 */
const openMetabotSqlCard =
  (
    conversationId: string,
    { entity, sql, isSqlShown }: MetabotSqlCard,
    {
      shouldRun,
      hasPendingDiff,
    }: { shouldRun: boolean; hasPendingDiff: boolean },
  ) =>
  (dispatch: Dispatch, getState: () => State) => {
    dispatch(metabotSqlStarted({ conversationId, sql, isSqlShown }));
    const mode = getMetabotSqlModeEntry(getState(), conversationId)?.mode;
    const url = Urls.generatedEntity(entity);
    dispatch(
      setPendingAutoRun({
        url,
        conversationId,
        isNativeEditorOpen: mode !== "chart" || hasPendingDiff,
        shouldRun: shouldRun && !hasPendingDiff,
      }),
    );
    navigate(url);
  };

export const sendAgentRequest = createAsyncThunk<
  SendAgentRequestResult,
  MetabotAgentRequest & { isFullPageMetabot: boolean },
  { rejectValue: SendAgentRequestError }
>(
  "metabase/metabot/sendAgentRequest",
  async (
    payload,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    const { isFullPageMetabot, ...requestPayload } = payload;
    const conversationId = requestPayload.conversation_id;
    const request = canAutoApplyQbEdits(
      getState(),
      conversationId,
      requestPayload.context,
    )
      ? { ...requestPayload, context: withQbAutoApply(requestPayload.context) }
      : requestPayload;

    let state: MetabotStateContext | undefined;
    let response: ProcessedChatResponse | undefined;
    let receivedTitle = false;
    let serverStarted = false;
    // Only the last native card of a sidebar turn opens, after the stream ends.
    let sidebarSqlCard: MetabotSqlCard | undefined;
    // A Metabot edit of `sidebarSqlCard` that waits as a diff.
    let hasSidebarSqlCardDiff = false;
    const openSidebarSqlCard = (shouldRun: boolean) => {
      if (sidebarSqlCard) {
        dispatch(
          openMetabotSqlCard(conversationId, sidebarSqlCard, {
            shouldRun,
            hasPendingDiff: hasSidebarSqlCardDiff,
          }),
        );
        sidebarSqlCard = undefined;
      }
    };
    const isSidebarConversation =
      conversationId === getMetabotConversationId(getState(), "omnibot");
    const hadTitleBeforeTurn = Boolean(
      getConversationTitle(getState(), conversationId),
    );

    try {
      // store error object streamed across the wire
      let streamedError: MetabotAgentTurnError | undefined;
      response = await aiStreamingQuery(
        {
          url: "/api/metabot/agent-streaming",
          // NOTE: StructuredDatasetQuery as part of the EntityInfo in MetabotChatContext
          // is upsetting the types, casting for now
          body: request as JSONValue,
          signal,
          sourceId: conversationId,
        },
        {
          shouldPaceReasoning: () => isReasoningVisible(conversationId),
          onDataPart: function handleDataPart(part) {
            const pushDataPart = (
              message: Omit<MetabotAgentDataPartMessage, "id" | "role">,
            ) => dispatch(addAgentMessage({ ...message, conversationId }));

            match(part)
              // only update the convo state if the request is successful
              .with({ type: "data-state" }, (part) => (state = part.data))
              .with({ type: "data-conversation-title" }, (part) => {
                receivedTitle = true;
                dispatch(
                  setConversationTitle({ conversationId, title: part.data }),
                );
              })
              .with({ type: "data-todo_list" }, (part) => {
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "data-research_plan_update" }, (part) => {
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "data-code_edit" }, (part) => {
                const isQbEdit = part.data.buffer_id === QB_BUFFER_ID;
                const autoApply =
                  isQbEdit &&
                  hasQbAutoApply(request.context) &&
                  isSidebarSqlAutoMode(getState(), conversationId);

                if (autoApply && sidebarSqlCard) {
                  // The edit is for the native card of this turn, which opens at the end.
                  sidebarSqlCard = withEditedSql(sidebarSqlCard, part.data);
                } else {
                  dispatch(
                    addSuggestedCodeEdit({
                      ...part.data,
                      active: true,
                      autoApply,
                    }),
                  );
                  const isSqlShown =
                    getMetabotSqlModeEntry(getState(), conversationId)?.mode ===
                      "sql-shown" || part.data.show_sql === true;
                  if (isQbEdit && (!autoApply || isSqlShown)) {
                    dispatch(setIsNativeEditorOpen(true));
                  }
                  if (isQbEdit && !autoApply && sidebarSqlCard) {
                    hasSidebarSqlCardDiff = true;
                  }
                }
                pushDataPart({
                  type: "data_part",
                  part,
                  metadata: {
                    codeEditBuffer: findCodeEditBuffer(
                      request.context,
                      part.data.buffer_id,
                    ),
                  },
                });
              })
              .with({ type: "data-generated_entity" }, (part) => {
                pushDataPart({ type: "data_part", part });

                if (isFullPageMetabot) {
                  return;
                }

                const path = Urls.generatedEntity(part.data);

                if (isEmbeddingSdk()) {
                  if (part.data.type === "card") {
                    dispatch(setNavigateToPath(path));
                  }
                  return;
                }

                const sqlCard = isSidebarConversation
                  ? toMetabotSqlCard(part.data, request.context, sidebarSqlCard)
                  : null;
                if (sqlCard) {
                  sidebarSqlCard = sqlCard;
                  hasSidebarSqlCardDiff = false;
                  return;
                }

                sidebarSqlCard = undefined;
                navigate(path);
              })
              .with({ type: "data-entity_saved" }, (part) => {
                dispatch(
                  markChartSaved({
                    entityId: part.data.chart_id,
                    cardId: part.data.card_id,
                  }),
                );
                const { tool_call_id, title } = part.data;
                if (tool_call_id && title) {
                  dispatch(
                    toolCallTitled({
                      conversationId,
                      toolCallId: tool_call_id,
                      title,
                    }),
                  );
                }
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "data-tool_title" }, (part) => {
                const { tool_call_id, title } = part.data;
                dispatch(
                  toolCallTitled({
                    conversationId,
                    toolCallId: tool_call_id,
                    title,
                  }),
                );
              })
              .with(
                { type: "data-transform_suggestion" },
                { type: "data-navigate_to" },
                { type: "data-adhoc_viz" },
                { type: "data-static_viz" },
                () => {},
              )
              .with({ type: "data-search_results" }, (part) => {
                dispatch(
                  toolCallSearchResults({
                    conversationId,
                    toolCallId: part.data.tool_call_id,
                    totalCount: part.data.total_count,
                    results: part.data.results,
                  }),
                );
              })
              .exhaustive();
          },
          onStart: function handleStart() {
            serverStarted = true;
          },
          onTextPart: function handleTextPart(delta) {
            dispatch(
              addAgentTextDelta({
                conversationId,
                text: delta,
                nowMs: Date.now(),
              }),
            );
          },
          onReasoningStart: function handleReasoningStart() {
            dispatch(reasoningStart({ conversationId, nowMs: Date.now() }));
          },
          onReasoningDelta: function handleReasoningDelta(event) {
            dispatch(
              reasoningDelta({
                conversationId,
                text: event.delta,
                nowMs: Date.now(),
              }),
            );
          },
          onToolInputStart: function handleToolInputStart(event) {
            dispatch(
              toolCallStart({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                title: event.title,
                conversationId,
                nowMs: Date.now(),
              }),
            );
          },
          onToolInputAvailable: function handleToolInputAvailable(event) {
            dispatch(
              toolCallArgs({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                title: event.title,
                args: JSON.stringify(event.input),
                conversationId,
                nowMs: Date.now(),
              }),
            );
          },
          onToolResultPart: function handleToolResultPart(event) {
            dispatch(
              toolCallEnd({
                toolCallId: event.toolCallId,
                result:
                  typeof event.output === "string"
                    ? event.output
                    : JSON.stringify(event.output),
                conversationId,
                nowMs: Date.now(),
              }),
            );
          },
          onToolErrorPart: function handleToolErrorPart(event) {
            dispatch(
              toolCallEnd({
                toolCallId: event.toolCallId,
                result: event.errorText,
                isError: true,
                conversationId,
                nowMs: Date.now(),
              }),
            );
          },
          onError: function handleError(error) {
            // the `error` chunk carries only the message; a typed error's code
            // rides the trailing `finish` event's messageMetadata, folded in at
            // rejection time below
            streamedError = { message: error.errorText };
          },
        },
      );

      if (response.aborted) {
        throw new DOMException("Stream aborted", "AbortError");
      }

      openSidebarSqlCard(streamedError === undefined);

      if (streamedError) {
        // a typed error's code arrives on finish.messageMetadata, after the
        // `error` chunk — fold it in so the display branch can match on it
        streamedError.type = response.messageMetadata?.errorCode;
        return rejectWithValue({
          type: "error",
          conversation_id: request.conversation_id,
          shouldRetry: true,
          serverStarted,
          error: streamedError,
          display: getServerErrorDisplay(streamedError),
        });
      }

      const shouldPollForTitle =
        !receivedTitle &&
        !hadTitleBeforeTurn &&
        !getIsPollingForTitle(getState(), request.conversation_id) &&
        isHistoryEnabledProfile(request.profile_id);
      if (shouldPollForTitle) {
        void pollConversationTitle({
          dispatch,
          getState,
          conversationId,
        });
      }

      return fulfillWithValue({
        conversation_id: request.conversation_id,
        state,
        processedResponse: response,
      });
    } catch (error) {
      // A stopped or failed turn still opens the card that Metabot made.
      openSidebarSqlCard(false);

      if (isMatching({ name: "AbortError" }, error)) {
        return rejectWithValue({
          type: "abort",
          conversation_id: request.conversation_id,
          unresolved_tool_calls:
            response?.toolCalls.filter((tc) => tc.state === "call") ?? [],
          state,
          shouldRetry: false,
        });
      }

      const handled = handleResponseError(
        error,
        getSetting(getState(), "metabot-name"),
      );
      if (handled.error.type === "unknown") {
        console.error(error);
      }
      return rejectWithValue({
        type: "error" as const,
        conversation_id: request.conversation_id,
        shouldRetry: true,
        serverStarted,
        error: handled.error,
        display: handled.display,
      });
    }
  },
);

export const cancelInflightConversationRequests = createAsyncThunk(
  "metabase/metabot/cancelInflightConversationRequests",
  (conversationId: string) => {
    findMatchingInflightAiStreamingRequests(
      "/api/metabot/agent-streaming",
      conversationId,
    ).forEach((req) => req.abortController.abort());
  },
);

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase/metabot/cancelInflightAgentRequests",
  (agentId: MetabotAgentId, { dispatch, getState }) => {
    dispatch(
      cancelInflightConversationRequests(
        getMetabotConversationId(getState(), agentId),
      ),
    );
  },
);

const rewindConversation = createAsyncThunk(
  "metabase/metabot/rewindConversation",
  (
    {
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    },
    { dispatch, getState },
  ) => {
    const userTurn = getUserPromptMessage(
      getState(),
      conversationId,
      messageId,
    );
    if (!userTurn) {
      throw new Error(
        `Unable to find the prompt for message ${messageId} in conversation ${conversationId}`,
      );
    }

    dispatch(cancelInflightConversationRequests(conversationId));
    dispatch(
      metabot.actions.rewindStateToMessageId({
        conversationId,
        messageId: userTurn.id,
      }),
    );
  },
);

export const retryPrompt = createAsyncThunk<
  MetabotPromptSubmissionResult & { prompt: string },
  {
    messageId: string;
    context: MetabotChatContext;
    metabot_id?: string;
    conversationId: string;
    profile?: MetabotProfileId;
    isFullPageMetabot?: boolean;
  }
>(
  "metabase/metabot/retryPrompt",
  async (
    {
      messageId,
      context,
      metabot_id,
      conversationId,
      profile,
      isFullPageMetabot,
    },
    { getState, dispatch },
  ) => {
    const state = getState();

    const userTurn = getUserPromptMessage(state, conversationId, messageId);
    if (!userTurn) {
      throw new Error("Agent message was not proceeded by a user message");
    }
    const promptText = getPromptText(userTurn);

    if (getIsConversationProcessing(state, conversationId)) {
      console.error("Metabot is actively serving a request");
      return { prompt: promptText, success: false, shouldRetry: false };
    }

    // a turn the server never started has no rows to regenerate
    const failedTurn = getMessages(state, conversationId).at(-1);
    const retryMessageId =
      failedTurn?.status.type === "errored" &&
      failedTurn.status.serverStarted === false
        ? undefined
        : userTurn.externalId;

    dispatch(rewindConversation({ conversationId, messageId: userTurn.id }));
    dispatch(cancelInflightConversationRequests(conversationId));

    return await dispatch(
      submitInput({
        conversationId,
        type: "text",
        message: promptText,
        context,
        metabot_id,
        profile,
        retryMessageId,
        isFullPageMetabot,
      }),
    ).unwrap();
  },
);

const assertConversationIsNotStreaming = (conversationId: string) => {
  const isStreaming =
    findMatchingInflightAiStreamingRequests(
      "/api/metabot/agent-streaming",
      conversationId,
    ).length > 0;
  if (isStreaming) {
    throw new Error(
      `Cannot load conversation ${conversationId} while it is streaming`,
    );
  }
};

export const fetchConversationSnapshot = createAsyncThunk(
  "metabase/metabot/fetchConversationSnapshot",
  async (conversationId: string, { dispatch }) => {
    assertConversationIsNotStreaming(conversationId);

    const { data: detail, error } = await dispatch(
      metabotApi.endpoints.getMetabotConversation.initiate(conversationId, {
        forceRefetch: true,
        subscribe: false,
      }),
    );

    if (error || !detail) {
      dispatch(
        addUndo({
          variant: "negative",
          message: t`Sorry, we couldn't load that conversation.`,
        }),
      );
      return;
    }

    dispatch(
      setConversationSnapshot({
        conversationId: detail.conversation_id,
        title: detail.title ?? undefined,
        forkedFromConversationId:
          detail.forked_from_conversation_id ?? undefined,
        contextWindowTokens: detail.context_window_tokens,
        messages: detail.messages,
        state: detail.state,
        activeToolCalls: [],
      }),
    );
  },
);

export const loadConversation = createAsyncThunk(
  "metabase/metabot/loadConversation",
  async (
    {
      agentId,
      conversationId,
    }: { agentId: MetabotAgentId; conversationId: string },
    { dispatch },
  ) => {
    assertConversationIsNotStreaming(conversationId);

    // NOTE: deliberately doesn't cancel the inflight streaming-request;
    // as we do not want to record it as an aborted response.
    dispatch(attachAgentToConversation({ agentId, conversationId }));
    await dispatch(fetchConversationSnapshot(conversationId)).unwrap();
  },
);

export const forkConversation = createAsyncThunk(
  "metabase/metabot/forkConversation",
  async (
    {
      agentId,
      conversationId,
      messageId,
    }: { agentId: MetabotAgentId; conversationId: string; messageId: string },
    { dispatch },
  ) => {
    const conversation = await dispatch(
      metabotApi.endpoints.forkMetabotConversation.initiate({
        conversation_id: conversationId,
        message_id: messageId,
      }),
    ).unwrap();

    // attach new converation before setting snapshot so convo being
    // forked will be evicted from the state
    dispatch(
      attachAgentToConversation({
        agentId,
        conversationId: conversation.conversation_id,
      }),
    );

    dispatch(
      setConversationSnapshot({
        conversationId: conversation.conversation_id,
        title: conversation.title ?? undefined,
        forkedFromConversationId:
          conversation.forked_from_conversation_id ?? undefined,
        contextWindowTokens: conversation.context_window_tokens,
        messages: conversation.messages,
        state: conversation.state,
        activeToolCalls: [],
      }),
    );

    if (agentId === "ask") {
      navigate(Urls.metabotConversation(conversation.conversation_id));
    }

    return conversation;
  },
);
