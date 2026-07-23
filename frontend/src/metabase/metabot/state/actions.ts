import {
  type ThunkDispatch,
  type UnknownAction,
  isRejected,
  nanoid,
} from "@reduxjs/toolkit";
import { P, isMatching, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import {
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase/api/ai-streaming";
import type { ProcessedChatResponse } from "metabase/api/ai-streaming/process-stream";
import { metabotApi } from "metabase/api/metabot";
import { listTag } from "metabase/api/tags";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { setIsNativeEditorOpen } from "metabase/redux/query-builder";
import type { Dispatch, State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { createAsyncThunk } from "metabase/redux/utils";
import { push } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import * as Urls from "metabase/urls";
import { retry } from "metabase/utils/retry";
import { uuid } from "metabase/utils/uuid";
import type {
  JSONValue,
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotChatContext,
  MetabotCodeEditorBufferContext,
  MetabotStateContext,
  MetabotTransformInfo,
} from "metabase-types/api";

import {
  METABOT_ERR_MSG,
  type MetabotProfileId,
  isHistoryEnabledProfile,
} from "../constants";
import { normalizeFetchedChatMessages } from "../utils/normalize-fetched-chat-messages";

import { metabot } from "./reducer";
import {
  getAgentRequestMetadata,
  getDebugMode,
  getDeveloperMessage,
  getIsCurrentConversation,
  getIsPollingForTitle,
  getIsProcessing,
  getMessageIdToRewind,
  getMetabotConversation,
  getMetabotConversationTitle,
  getUserPromptForMessageId,
} from "./selectors";
import type {
  MetabotAgentDataPartMessage,
  MetabotAgentId,
  MetabotAgentTurnDisplayError,
  MetabotAgentTurnError,
  MetabotUserChatMessage,
  SlashCommand,
} from "./types";
import { createMessageId, parseSlashCommand } from "./utils";

export const {
  addAgentTextDelta,
  addAgentMessage,
  addDeveloperMessage,
  addUserMessage,
  setIsProcessing,
  setMessageExternalIds,
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
  addSuggestedTransform,
  activateSuggestedTransform,
  deactivateSuggestedTransform,
  updateSuggestedTransformId,
  createAgent,
  destroyAgent,
  addSuggestedCodeEdit,
  removeSuggestedCodeEdit,
  setIsPollingForTitle,
  markChartSaved,
} = metabot.actions;

const TITLE_POLL_INTERVAL_MS = 1500;
const TITLE_POLL_MAX_ATTEMPTS = 40;
const TITLE_PENDING = new Error("Metabot conversation title pending");

type PollConversationTitleOptions = {
  dispatch: ThunkDispatch<State, unknown, UnknownAction>;
  getState: () => State;
  agentId: MetabotAgentId;
  conversationId: string;
};

const pollConversationTitle = async ({
  dispatch,
  getState,
  agentId,
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

    const convo = getMetabotConversation(getState(), agentId);
    if (convo.conversationId === conversationId) {
      dispatch(setConversationTitle({ agentId, title }));
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
  { command: SlashCommand; agentId: MetabotAgentId }
>(
  "metabase/metabot/executeSlashCommand",
  async ({ command, agentId }, { dispatch, getState }) => {
    match(command)
      .with({ cmd: "profile" }, ({ args }) => {
        if (args.length <= 1) {
          // cast allows custom overrides for development purposes; the backend validates
          dispatch(
            setProfileOverride({
              agentId,
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
          dispatch(setMetabotReqIdOverride({ id: args[0], agentId }));
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
        const handled = PLUGIN_AUDIT.handleMetabotSlashCommand({
          command,
          agentId,
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
    agentId: MetabotAgentId;
    metabot_id?: string;
    profile?: MetabotProfileId;
    retryMessageId?: string;
  }
>(
  "metabase/metabot/submitInput",
  async (payload, { dispatch, getState, signal }) => {
    const state = getState();
    const {
      agentId,
      message: rawPrompt,
      profile,
      retryMessageId,
      ...data
    } = payload;
    const convo = getMetabotConversation(state, agentId);

    const prompt = rawPrompt.trim();
    if (prompt === "") {
      console.warn("An empty prompt was submitted to conversation: ", agentId);
      return { prompt, success: true };
    }

    try {
      const isProcessing = getIsProcessing(state, agentId);
      if (isProcessing) {
        console.error("Metabot is actively serving a request");
        return { prompt, success: false, shouldRetry: false };
      }

      // if there were from the last prompt, remove the last prompt from the history
      const rewindToMessageId = getMessageIdToRewind(state, agentId);
      if (rewindToMessageId) {
        dispatch(
          rewindConversation({
            agentId,
            messageId: rewindToMessageId,
          }),
        );
      }

      const command = parseSlashCommand(prompt);
      if (command) {
        await dispatch(
          executeSlashCommand({
            command,
            agentId,
          }),
        );
        return { prompt, success: true };
      }

      // it's important that we get the current metadata containing the history before
      // altering it by adding the current message the user is wanting to send
      const agentMetadata = getAgentRequestMetadata(
        getState(),
        agentId,
        retryMessageId,
      );
      const messageId = createMessageId();
      const userMessageId = retryMessageId ?? uuid();
      const assistantMessageId = uuid();
      const promptWithDevMessage = getDeveloperMessage(state, agentId) + prompt;
      dispatch(
        addUserMessage({
          id: messageId,
          ..._.omit(data, ["context", "metabot_id"]),
          message: prompt,
          agentId,
        }),
      );

      const sendMessageRequestPromise = dispatch(
        sendAgentRequest({
          ...data,
          message: promptWithDevMessage,
          agentId,
          conversation_id: convo.conversationId,
          loadId: getMetabotConversation(getState(), agentId).loadId,
          ...agentMetadata,
          user_message_id: userMessageId,
          assistant_message_id: assistantMessageId,
          ...(profile ? { profile_id: profile } : {}),
        }),
      );
      signal.addEventListener("abort", () => {
        sendMessageRequestPromise.abort();
      });

      const result = await sendMessageRequestPromise;

      if (isRejected(result)) {
        return {
          prompt: rawPrompt,
          success: false,
          shouldRetry: result.payload?.shouldRetry ?? true,
          error:
            result.payload?.type === "error"
              ? result.payload.display
              : undefined,
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

export const sendAgentRequest = createAsyncThunk<
  SendAgentRequestResult,
  MetabotAgentRequest & { agentId: MetabotAgentId; loadId: string },
  { rejectValue: SendAgentRequestError }
>(
  "metabase/metabot/sendAgentRequest",
  async (
    payload,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    const { agentId, loadId, ...request } = payload;

    // Keep the stream alive for persistence, but ignore it after switching conversations.
    const dispatchToConvo = (action: Parameters<typeof dispatch>[0]) => {
      if (
        getIsCurrentConversation(
          getState(),
          agentId,
          request.conversation_id,
          loadId,
        )
      ) {
        dispatch(action);
      }
    };

    let state: MetabotStateContext | undefined;
    let response: ProcessedChatResponse | undefined;
    let receivedTitle = false;
    const hadTitleBeforeTurn = Boolean(
      getMetabotConversationTitle(getState(), agentId),
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
          sourceId: agentId,
        },
        {
          onDataPart: function handleDataPart(part) {
            const pushDataPart = (
              message: Omit<
                MetabotAgentDataPartMessage,
                "id" | "role" | "externalId"
              >,
            ) => dispatchToConvo(addAgentMessage({ ...message, agentId }));

            match(part)
              // only update the convo state if the request is successful
              .with({ type: "data-state" }, (part) => (state = part.data))
              .with({ type: "data-conversation-title" }, (part) => {
                receivedTitle = true;
                dispatchToConvo(
                  setConversationTitle({ agentId, title: part.data }),
                );
              })
              .with({ type: "data-todo_list" }, (part) => {
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "data-code_edit" }, (part) => {
                dispatchToConvo(
                  addSuggestedCodeEdit({ ...part.data, active: true }),
                );

                if (part.data.buffer_id === "qb") {
                  dispatchToConvo(setIsNativeEditorOpen(true));
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
              .with({ type: "data-transform_suggestion" }, (part) => {
                const suggestionId = nanoid();
                const suggestedTransform = {
                  ...part.data,
                  id: part.data.id || undefined,
                  active: true,
                  suggestionId,
                };
                dispatchToConvo(addSuggestedTransform(suggestedTransform));

                const editorTransform = request.context.user_is_viewing
                  .filter(
                    (t): t is MetabotTransformInfo => t.type === "transform",
                  )
                  .find((t) => t.id === suggestedTransform.id);
                pushDataPart({
                  type: "data_part",
                  part,
                  metadata: { editorTransform, suggestionId },
                });
              })
              .with({ type: "data-generated_entity" }, (part) => {
                if (agentId === "ask") {
                  pushDataPart({ type: "data_part", part });
                  return;
                }

                const path = Urls.generatedEntity(part.data);

                if (isEmbeddingSdk()) {
                  if (part.data.type === "card") {
                    dispatchToConvo(setNavigateToPath(path));
                  }
                  pushDataPart({ type: "data_part", part });
                  return;
                }

                // Unjustified type cast. FIXME
                dispatchToConvo(push(path) as UnknownAction);
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
                  dispatchToConvo(
                    toolCallTitled({
                      agentId,
                      toolCallId: tool_call_id,
                      title,
                    }),
                  );
                }
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "data-tool_title" }, (part) => {
                const { tool_call_id, title } = part.data;
                dispatchToConvo(
                  toolCallTitled({ agentId, toolCallId: tool_call_id, title }),
                );
              })
              .with(
                { type: "data-navigate_to" },
                { type: "data-adhoc_viz" },
                { type: "data-static_viz" },
                () => {},
              )
              .with({ type: "data-search_results" }, (part) => {
                dispatchToConvo(
                  toolCallSearchResults({
                    agentId,
                    toolCallId: part.data.tool_call_id,
                    totalCount: part.data.total_count,
                    results: part.data.results,
                  }),
                );
              })
              .exhaustive();
          },
          onStart: function handleStart(event) {
            dispatchToConvo(
              setMessageExternalIds({
                agentId,
                agentMessageId: event.messageId,
                userMessageId: event.messageMetadata?.userMessageId,
              }),
            );
          },
          onTextPart: function handleTextPart(delta) {
            dispatchToConvo(
              addAgentTextDelta({ agentId, text: delta, nowMs: Date.now() }),
            );
          },
          onReasoningStart: function handleReasoningStart() {
            dispatchToConvo(reasoningStart({ agentId, nowMs: Date.now() }));
          },
          onReasoningDelta: function handleReasoningDelta(event) {
            dispatchToConvo(
              reasoningDelta({ agentId, text: event.delta, nowMs: Date.now() }),
            );
          },
          onToolInputStart: function handleToolInputStart(event) {
            dispatchToConvo(
              toolCallStart({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                title: event.title,
                agentId,
                nowMs: Date.now(),
              }),
            );
          },
          onToolInputAvailable: function handleToolInputAvailable(event) {
            dispatchToConvo(
              toolCallArgs({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                title: event.title,
                args: JSON.stringify(event.input),
                agentId,
                nowMs: Date.now(),
              }),
            );
          },
          onToolResultPart: function handleToolResultPart(event) {
            dispatchToConvo(
              toolCallEnd({
                toolCallId: event.toolCallId,
                result:
                  typeof event.output === "string"
                    ? event.output
                    : JSON.stringify(event.output),
                agentId,
                nowMs: Date.now(),
              }),
            );
          },
          onToolErrorPart: function handleToolErrorPart(event) {
            dispatchToConvo(
              toolCallEnd({
                toolCallId: event.toolCallId,
                result: event.errorText,
                isError: true,
                agentId,
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

      if (streamedError) {
        // a typed error's code arrives on finish.messageMetadata, after the
        // `error` chunk — fold it in so the display branch can match on it
        streamedError.type = response.messageMetadata?.errorCode;
        return rejectWithValue({
          type: "error",
          conversation_id: request.conversation_id,
          shouldRetry: true,
          error: streamedError,
          display: isMatching(
            { type: "ai_usage_limit_reached", message: P.string },
            streamedError,
          )
            ? // special case where we want to show the returned error from the backend
              { type: "message" as const, message: streamedError.message }
            : undefined,
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
          agentId,
          conversationId: request.conversation_id,
        });
      }

      return fulfillWithValue({
        conversation_id: request.conversation_id,
        state,
        processedResponse: response,
      });
    } catch (error) {
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
        getSetting(getState(), "metabot-name") || "Metabot",
      );
      return rejectWithValue({
        type: "error" as const,
        conversation_id: request.conversation_id,
        shouldRetry: true,
        error: handled.error,
        display: handled.display,
      });
    }
  },
);

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase/metabot/cancelInflightAgentRequests",
  (agentId: MetabotAgentId) => {
    findMatchingInflightAiStreamingRequests(
      "/api/metabot/agent-streaming",
      agentId,
    ).forEach((req) => req.abortController.abort());
  },
);

const rewindConversation = createAsyncThunk(
  "metabase/metabot/rewindConversation",
  (
    {
      agentId,
      messageId,
    }: {
      agentId: MetabotAgentId;
      messageId: string;
    },
    { dispatch, getState },
  ) => {
    const promptMessage = getUserPromptForMessageId(
      getState(),
      agentId,
      messageId,
    );
    if (!promptMessage) {
      throw new Error(
        `Unable to find the prompt for message ${messageId} in conversation with agent ${agentId}`,
      );
    }

    dispatch(cancelInflightAgentRequests(agentId));
    dispatch(
      metabot.actions.rewindStateToMessageId({
        agentId,
        messageId: promptMessage.id,
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
    agentId: MetabotAgentId;
  }
>(
  "metabase/metabot/retryPrompt",
  async (
    { messageId, context, metabot_id, agentId },
    { getState, dispatch },
  ) => {
    const state = getState();

    const prompt = getUserPromptForMessageId(state, agentId, messageId);
    if (!prompt) {
      throw new Error("Agent message was not proceeded by a user message");
    }

    const isProcessing = getIsProcessing(state, agentId);
    if (isProcessing) {
      console.error("Metabot is actively serving a request");
      return { prompt: prompt.message, success: false, shouldRetry: false };
    }

    dispatch(rewindConversation({ agentId, messageId: prompt.id }));
    dispatch(cancelInflightAgentRequests(agentId));
    dispatch(metabot.actions.rewindStateToMessageId({ agentId, messageId }));

    return await dispatch(
      submitInput({
        agentId,
        type: "text",
        message: prompt.message,
        context,
        metabot_id,
        retryMessageId: prompt.externalId,
      }),
    ).unwrap();
  },
);

export const resetConversation = createAsyncThunk(
  "metabase/metabot/resetConversation",
  (payload: { agentId: MetabotAgentId }, { dispatch }) => {
    dispatch(cancelInflightAgentRequests(payload.agentId));
    dispatch(metabot.actions.resetConversation(payload));
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
    // NOTE: deliberately doesn't cancel the inflight streaming-request;
    // as we do not want to record it as an aborted response.

    const { data: detail, error } = await dispatch(
      metabotApi.endpoints.getMetabotConversation.initiate(conversationId, {
        forceRefetch: true,
        subscribe: false,
      }),
    );

    if (error || !detail) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "feedback-negative",
          message: t`Sorry, we couldn't load that conversation.`,
        }),
      );
      return;
    }

    dispatch(
      setConversationSnapshot({
        agentId,
        conversationId: detail.conversation_id,
        title: detail.title ?? undefined,
        messages: normalizeFetchedChatMessages(detail.messages),
        state: detail.state,
        activeToolCalls: [],
      }),
    );
  },
);
