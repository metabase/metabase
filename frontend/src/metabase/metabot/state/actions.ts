import { isRejected, nanoid } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
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
import { normalizeFetchedChatMessages } from "metabase/metabot/utils/normalize-fetched-chat-messages";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { setIsNativeEditorOpen } from "metabase/redux/query-builder";
import type { Dispatch, State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { createAsyncThunk } from "metabase/redux/utils";
import { getLocation } from "metabase/selectors/routing";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import { clone } from "metabase/utils/clone";
import { uuid } from "metabase/utils/uuid";
import type {
  JSONValue,
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotChatContext,
  MetabotCodeEditorBufferContext,
  MetabotTransformInfo,
} from "metabase-types/api";

import { METABOT_ERR_MSG, type MetabotProfileId } from "../constants";

import { metabot } from "./reducer";
import {
  getAgentRequestMetadata,
  getDebugMode,
  getDeveloperMessage,
  getHistory,
  getIsProcessing,
  getMessageIdToRewind,
  getMetabotConversation,
  getMetabotState,
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
  setCurrentQuestionPath,
  setPendingMessageExternalId,
  setModelOverride,
  setProfileOverride,
  setSelectedDatabaseId,
  setPrompt,
  setConversationTitle,
  rememberDataPointTarget,
  focusPromptInput,
  toolCallStart,
  toolCallEnd,
  setMetabotReqIdOverride,
  setDebugMode,
  addSuggestedTransform,
  activateSuggestedTransform,
  deactivateSuggestedTransform,
  updateSuggestedTransformId,
  createAgent,
  destroyAgent,
  hydrateChatConversation,
  addSuggestedCodeEdit,
  removeSuggestedCodeEdit,
  setInBar,
  setOverlayAgentId,
  setHasUnreadResponse,
} = metabot.actions;

function markUnreadIfUnfocused(
  state: State,
  dispatch: Dispatch,
  agentId: MetabotAgentId,
) {
  const convo = getMetabotState(state).conversations[agentId];
  if (!convo) {
    return;
  }

  const pathname = getLocation(state).pathname ?? "";
  const isFocused =
    convo.visible ||
    getMetabotState(state).overlayAgentId === agentId ||
    pathname === `/chat/${convo.conversationId}`;

  if (!isFocused) {
    dispatch(setHasUnreadResponse({ agentId, hasUnreadResponse: true }));
  }
}

type HandledResponseError = {
  error: MetabotAgentTurnError;
  display: MetabotAgentTurnDisplayError;
};

const handleResponseError = (
  error: unknown,
  metabotName: string,
): HandledResponseError => {
  return match(error)
    .with(
      { message: P.string.startsWith("Response status: 401") },
      { status: 401 },
      () => ({
        error: { type: "unauthenticated" },
        display: {
          type: "alert" as const,
          message: METABOT_ERR_MSG.unauthenticated(metabotName),
        },
      }),
    )
    .with({ status: 402, "error-code": "metabase_ai_managed_locked" }, () => ({
      error: { type: "metabase_ai_managed_locked" },
      display: { type: "locked" as const, message: METABOT_ERR_MSG.locked },
    }))
    .with({ status: P.number, message: P.string }, ({ message }) => ({
      error: { type: "http_error", message },
      display: {
        type: "message" as const,
        message: METABOT_ERR_MSG.format(message),
      },
    }))
    .with(
      { "error-code": "ai_usage_limit_reached", message: P.string },
      ({ message }) => ({
        error: { type: "ai_usage_limit_reached", message },
        display: { type: "message" as const, message },
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

export const expandConversation =
  ({ agentId }: { agentId: MetabotAgentId }) =>
  (dispatch: Dispatch) => {
    dispatch(metabot.actions.setVisible({ agentId, visible: false }));
    dispatch(metabot.actions.setOverlayAgentId({ agentId }));
  };

export const collapseConversation =
  ({ agentId }: { agentId: MetabotAgentId }) =>
  (dispatch: Dispatch) => {
    dispatch(metabot.actions.setOverlayAgentId({ agentId: null }));
    dispatch(metabot.actions.setVisible({ agentId, visible: true }));
  };

export const minimizeConversation =
  ({ agentId }: { agentId: MetabotAgentId }) =>
  (dispatch: Dispatch) => {
    dispatch(metabot.actions.setOverlayAgentId({ agentId: null }));
    dispatch(metabot.actions.setInBar({ agentId, inBar: true }));
    dispatch(metabot.actions.setVisible({ agentId, visible: true }));
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
    suppressNavigateTo?: boolean;
    hidden?: boolean;
  }
>(
  "metabase/metabot/submitInput",
  async (payload, { dispatch, getState, signal }) => {
    const state = getState();
    const { agentId, message: rawPrompt, profile, hidden, ...data } = payload;
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
      const agentMetadata = getAgentRequestMetadata(getState(), agentId);
      const messageId = createMessageId();
      const promptWithDevMessage = getDeveloperMessage(state, agentId) + prompt;
      if (!hidden) {
        dispatch(
          addUserMessage({
            id: messageId,
            ..._.omit(data, ["context", "metabot_id", "suppressNavigateTo"]),
            message: prompt,
            agentId,
          }),
        );
      }

      const sendMessageRequestPromise = dispatch(
        sendAgentRequest({
          ...data,
          message: promptWithDevMessage,
          agentId,
          conversation_id: convo.conversationId,
          ...agentMetadata,
          ...(profile ? { profile_id: profile } : {}),
        }),
      );
      signal.addEventListener("abort", () => {
        sendMessageRequestPromise.abort();
      });

      const result = await sendMessageRequestPromise;
      markUnreadIfUnfocused(getState(), dispatch, agentId);

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
  MetabotAgentRequest & {
    agentId: MetabotAgentId;
    suppressNavigateTo?: boolean;
  },
  { rejectValue: SendAgentRequestError }
>(
  "metabase/metabot/sendAgentRequest",
  async (
    payload,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    const { agentId } = payload;
    const request = _.omit(payload, ["agentId", "suppressNavigateTo"]);

    let state = {};
    let response: ProcessedChatResponse | undefined;
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
            ) => dispatch(addAgentMessage({ ...message, agentId }));

            match(part)
              // only update the convo state if the request is successful
              .with({ type: "state" }, (part) => (state = part.value))
              .with({ type: "todo_list" }, (part) => {
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "code_edit" }, (part) => {
                dispatch(addSuggestedCodeEdit({ ...part.value, active: true }));

                if (part.value.buffer_id === "qb") {
                  dispatch(setIsNativeEditorOpen(true));
                }
                pushDataPart({
                  type: "data_part",
                  part,
                  metadata: {
                    codeEditBuffer: findCodeEditBuffer(
                      request.context,
                      part.value.buffer_id,
                    ),
                  },
                });
              })
              .with({ type: "transform_suggestion" }, (part) => {
                const suggestionId = nanoid();
                const suggestedTransform = {
                  ...part.value,
                  id: part.value.id || undefined,
                  active: true,
                  suggestionId,
                };
                dispatch(addSuggestedTransform(suggestedTransform));

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
              .with({ type: "adhoc_viz" }, (part) => {
                // Surface the latest chart in the SDK's question pane /
                // CurrentChart without navigating the user away.
                dispatch(setCurrentQuestionPath(part.value.link));
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "static_viz" }, (part) => {
                pushDataPart({ type: "data_part", part });
              })
              .with({ type: "conversation_title" }, (part) => {
                dispatch(setConversationTitle({ agentId, title: part.value }));
              })
              .exhaustive();
          },
          onStartMessagePart: function handleStartMessagePart(part) {
            dispatch(
              setPendingMessageExternalId({
                agentId,
                externalId: part.messageId,
              }),
            );
          },
          onTextPart: function handleTextPart(part) {
            dispatch(addAgentTextDelta({ agentId, text: String(part) }));
          },
          onToolCallPart: function handleToolCallPart(part) {
            dispatch(toolCallStart({ ...part, agentId }));
          },
          onToolResultPart: function handleToolResultPart(part) {
            dispatch(toolCallEnd({ ...part, agentId }));
          },
          onError: function handleError(part) {
            streamedError = isMatching({ message: P.string }, part)
              ? part
              : { message: String(part) };
          },
        },
      );

      if (response.aborted) {
        throw new DOMException("Stream aborted", "AbortError");
      }

      if (streamedError) {
        return rejectWithValue({
          type: "error",
          conversation_id: request.conversation_id,
          shouldRetry: true,
          error: streamedError,
          display: isMatching(
            { "error-code": "ai_usage_limit_reached", message: P.string },
            streamedError,
          )
            ? // special case where we want to show the returned error from the backend
              { type: "message" as const, message: streamedError.message }
            : undefined,
        });
      }

      // Refresh the conversation list that backs the sidebar threads so newly
      // created chats and freshly generated titles show up without a reload.
      dispatch(
        metabotApi.util.invalidateTags([listTag("metabot-conversation")]),
      );

      return fulfillWithValue({
        conversation_id: request.conversation_id,
        history: [...getHistory(getState(), agentId), ...response.history],
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
          history: [
            ...getHistory(getState(), agentId),
            ...(response?.history ?? []),
          ],
          // reuse new state if we recieved it
          state: Object.keys(state).length === 0 ? request.state : state,
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
      }),
    ).unwrap();
  },
);

export const forkConversation = createAsyncThunk<
  { agentId: MetabotAgentId },
  { agentId: MetabotAgentId; messageId: string }
>(
  "metabase/metabot/forkConversation",
  ({ agentId, messageId }, { dispatch, getState }) => {
    const state = getState();
    const source = getMetabotConversation(state, agentId);

    // Branch the conversation: keep every message up to and including the one
    // the fork was triggered from, dropping anything after it.
    const messageIndex = source.messages.findLastIndex(
      (m) => m.id === messageId,
    );
    const forkedMessages =
      messageIndex > -1
        ? source.messages.slice(0, messageIndex + 1)
        : source.messages;

    // Truncate the model history to the same number of complete turns. Each
    // user message begins a turn, so we keep history up to (but not including)
    // the user entry that would start the next turn. Counting turns rather than
    // matching ids is robust to id differences between the flat message list
    // and the backend-provided history, and it guarantees we cut on a turn
    // boundary so no tool call is left without its result.
    const turnCount = forkedMessages.filter((m) => m.role === "user").length;
    let userEntriesSeen = 0;
    let historyCutoff = source.history.length;
    for (let i = 0; i < source.history.length; i++) {
      if (source.history[i].role === "user") {
        userEntriesSeen += 1;
        if (userEntriesSeen > turnCount) {
          historyCutoff = i;
          break;
        }
      }
    }
    const forkedHistory = source.history.slice(0, historyCutoff);

    const conversationId = uuid();
    const newAgentId: MetabotAgentId = `chat_${conversationId}`;
    const sourceTitle = source.title;

    dispatch(
      hydrateChatConversation({
        agentId: newAgentId,
        conversationId,
        title: t`${sourceTitle} (forked)`,
        messages: clone(forkedMessages),
        history: clone(forkedHistory),
        state: clone(source.state),
      }),
    );

    // Open the fork in the full-page chat view and keep the original chat
    // available as a background tab if it came from the bar/overlay.
    if (source.visible) {
      dispatch(setVisible({ agentId, visible: false }));
    }
    if (getMetabotState(state).overlayAgentId === agentId) {
      dispatch(setOverlayAgentId({ agentId: null }));
    }
    dispatch(push(`/chat/${conversationId}`) as any);

    return { agentId: newAgentId };
  },
);

export const resetConversation = createAsyncThunk(
  "metabase/metabot/resetConversation",
  (payload: { agentId: MetabotAgentId }, { dispatch }) => {
    dispatch(cancelInflightAgentRequests(payload.agentId));
    dispatch(metabot.actions.resetConversation(payload));
  },
);

/** Discards a conversation that was opened but never used (no messages sent),
 * so abandoned "New chat" drafts don't linger in the sidebar history. */
export const discardConversationIfEmpty = createAsyncThunk(
  "metabase/metabot/discardConversationIfEmpty",
  ({ agentId }: { agentId: MetabotAgentId }, { dispatch, getState }) => {
    const convo = getMetabotState(getState()).conversations[agentId];
    if (convo && convo.messages.length === 0 && !convo.isProcessing) {
      dispatch(destroyAgent({ agentId }));
    }
  },
);

export const resumeChatConversation = createAsyncThunk<
  { agentId: MetabotAgentId },
  { conversationId: string }
>(
  "metabase/metabot/resumeChatConversation",
  async ({ conversationId }, { dispatch, getState }) => {
    const agentId: MetabotAgentId = `chat_${conversationId}`;
    const alreadyMounted = !!getMetabotState(getState()).conversations[agentId];
    if (!alreadyMounted) {
      const detail = await dispatch(
        metabotApi.endpoints.getMetabotChatConversation.initiate(
          conversationId,
        ),
      ).unwrap();
      dispatch(
        hydrateChatConversation({
          agentId,
          conversationId: detail.conversation_id,
          title: detail.title,
          messages: normalizeFetchedChatMessages(detail.chat_messages ?? []),
          history: detail.history,
          state: detail.state,
        }),
      );
    }
    dispatch(setInBar({ agentId, inBar: true }));
    dispatch(setVisible({ agentId, visible: true }));
    return { agentId };
  },
);
