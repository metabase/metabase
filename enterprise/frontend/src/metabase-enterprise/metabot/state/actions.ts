import { type UnknownAction, isRejected, nanoid } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { getIsEmbedding } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import {
  type JSONValue,
  aiStreamingQuery,
  getInflightRequestsForUrl,
} from "metabase-enterprise/api/ai-streaming";
import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotChatContext,
  MetabotTransformInfo,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { METABOT_ERR_MSG } from "../constants";

import { metabot } from "./reducer";
import {
  getAgentErrorMessages,
  getAgentRequestMetadata,
  getDebugMode,
  getDeveloperMessage,
  getHistory,
  getIsProcessing,
  getLastMessage,
  getUniqueConversationId,
  getUserPromptForMessageId,
} from "./selectors";
import type {
  MetabotAgentEditSuggestionChatMessage,
  MetabotAgentTodoListChatMessage,
  MetabotConvoId,
  MetabotErrorMessage,
  MetabotStoreState,
  MetabotUniqueConvoId,
  MetabotUserChatMessage,
  SlashCommand,
} from "./types";
import { createMessageId, parseSlashCommand } from "./utils";

export const {
  addAgentTextDelta,
  addAgentMessage,
  addAgentErrorMessage,
  addUserMessage,
  setIsProcessing,
  setNavigateToPath,
  toolCallStart,
  toolCallEnd,
  setMetabotReqIdOverride,
  setDebugMode,
  addSuggestedTransform,
  activateSuggestedTransform,
  deactivateSuggestedTransform,
  addSuggestedCodeEdit,
  deactivateSuggestedCodeEdit,
  setProfileOverride,
  newConversation,
} = metabot.actions;

type PromptErrorOutcome = {
  errorMessage: MetabotErrorMessage | false;
  shouldRetry: boolean;
};

const handleResponseError = (error: unknown): PromptErrorOutcome => {
  return match(error)
    .with({ name: "AbortError" }, () => ({
      errorMessage: false as const,
      shouldRetry: false,
    }))
    .with(
      { message: P.string.startsWith("Response status: 5") },
      { status: 500 },
      () => ({
        errorMessage: {
          type: "alert" as const,
          message: METABOT_ERR_MSG.agentOffline,
        },
        shouldRetry: true,
      }),
    )
    .otherwise(() => ({
      errorMessage: {
        type: "message" as const,
        message: METABOT_ERR_MSG.default,
      },
      shouldRetry: true,
    }));
};

export const setVisible =
  (payload: { convoId: MetabotConvoId; visible: boolean }) =>
  (dispatch: Dispatch, getState: any) => {
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
  { command: SlashCommand; conversationId: MetabotUniqueConvoId }
>(
  "metabase-enterprise/metabot/executeSlashCommand",
  async ({ command, conversationId }, { dispatch, getState }) => {
    match(command)
      .with({ cmd: "profile" }, ({ args }) => {
        if (args.length <= 1) {
          dispatch(
            setProfileOverride({ convoId: conversationId, profile: args[0] }),
          );
        } else {
          dispatch(addUndo({ message: "/profile <name>" }));
        }
      })
      .with({ cmd: "metabot" }, ({ args }) => {
        if (args.length <= 1) {
          dispatch(
            setMetabotReqIdOverride({ id: args[0], convoId: conversationId }),
          );
        } else {
          dispatch(addUndo({ message: "/metabot <name>" }));
        }
      })
      .with({ cmd: "debug" }, () => {
        const currentDebugMode = getDebugMode(getState() as MetabotStoreState);
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
        dispatch(addUndo({ message: "Unknown command" }));
      });
  },
);

export type MetabotPromptSubmissionResult =
  | { prompt: string; success: true; shouldRetry?: void }
  | { prompt: string; success: false; shouldRetry: false }
  | { prompt: string; success: false; shouldRetry: true };

export const submitInput = createAsyncThunk<
  MetabotPromptSubmissionResult,
  Omit<MetabotUserChatMessage, "id" | "role"> & {
    context: MetabotChatContext;
    conversationId: MetabotUniqueConvoId;
    metabot_id?: string;
  }
>(
  "metabase-enterprise/metabot/submitInput",
  async (payload, { dispatch, getState, signal }) => {
    const state = getState() as any;
    const { conversationId, ...data } = payload;

    try {
      const isProcessing = getIsProcessing(state, conversationId);
      if (isProcessing) {
        console.error("Metabot is actively serving a request");
        return { prompt: data.message, success: false, shouldRetry: false };
      }

      // if there were from the last prompt, remove the last prompt from the history
      const errors = getAgentErrorMessages(state, conversationId);
      const lastMessageId = getLastMessage(state, conversationId)?.id;
      if (errors.length > 0 && lastMessageId) {
        dispatch(
          rewindConversation({
            conversationId: conversationId,
            messageId: lastMessageId,
          }),
        );
      }

      const command = parseSlashCommand(data.message);
      if (command) {
        await dispatch(
          executeSlashCommand({
            command,
            conversationId: conversationId,
          }),
        );
        return { prompt: data.message, success: true };
      }

      // it's important that we get the current metadata containing the history before
      // altering it by adding the current message the user is wanting to send
      const agentMetadata = getAgentRequestMetadata(
        getState() as any,
        conversationId,
      );
      const messageId = createMessageId();
      const message = getDeveloperMessage(state, conversationId) + data.message;
      dispatch(
        addUserMessage({
          id: messageId,
          ..._.omit(data, ["context", "metabot_id"]),
          convoId: conversationId,
          message,
        }),
      );

      const sendMessageRequestPromise = dispatch(
        sendAgentRequest({
          ...data,
          message,
          conversation_id: conversationId,
          ...agentMetadata,
        }),
      );
      signal.addEventListener("abort", () => {
        sendMessageRequestPromise.abort();
      });

      const result = await sendMessageRequestPromise;

      if (isRejected(result) && result.payload?.type === "error") {
        dispatch(
          stopProcessingAndNotify({
            convoId: conversationId,
            message: result.payload?.errorMessage,
          }),
        );
        return {
          prompt: data.message,
          success: false,
          shouldRetry: result.payload?.shouldRetry ?? false,
        };
      }

      return { prompt: data.message, success: true, data: result.payload };
    } catch (error) {
      // NOTE: all errors should be caught above, this is is a catch-all
      // to make sure that this async action always resolves to a value
      console.error(error);
      return { prompt: data.message, success: false, shouldRetry: true };
    }
  },
);

type SendAgentRequestError =
  | ({ type: "error" } & PromptErrorOutcome)
  | ({
      type: "abort";
      unresolved_tool_calls: { toolCallId: string; toolName: string }[];
    } & MetabotAgentResponse);

export const sendAgentRequest = createAsyncThunk<
  MetabotAgentResponse,
  MetabotAgentRequest,
  { rejectValue: SendAgentRequestError }
>(
  "metabase-enterprise/metabot/sendAgentRequest",
  async (
    request,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    const isEmbedding = getIsEmbedding(getState() as any);
    const conversationId = request.conversation_id as MetabotUniqueConvoId;

    try {
      let state = {};
      let error: unknown = undefined;

      const response = await aiStreamingQuery(
        {
          url: "/api/ee/metabot-v3/agent-streaming",
          // NOTE: StructuredDatasetQuery as part of the EntityInfo in MetabotChatContext
          // is upsetting the types, casting for now
          body: request as JSONValue,
          signal,
        },
        {
          onDataPart: function handleDataPart(part) {
            match(part)
              // only update the convo state if the request is successful
              .with({ type: "state" }, (part) => (state = part.value))
              .with({ type: "todo_list" }, (part) => {
                const message: Omit<
                  MetabotAgentTodoListChatMessage,
                  "id" | "role"
                > = {
                  type: "todo_list",
                  payload: part.value,
                };

                dispatch(
                  addAgentMessage({ ...message, convoId: conversationId }),
                );
              })
              .with({ type: "code_edit" }, (part) => {
                dispatch(addSuggestedCodeEdit({ ...part.value, active: true }));
              })
              .with({ type: "navigate_to" }, (part) => {
                dispatch(setNavigateToPath(part.value));

                if (!isEmbedding) {
                  dispatch(push(part.value) as UnknownAction);
                }
              })
              .with({ type: "transform_suggestion" }, ({ value }) => {
                const suggestedTransform = {
                  ...value,
                  id: value.id || undefined,
                  active: true,
                  suggestionId: nanoid(),
                };
                dispatch(addSuggestedTransform(suggestedTransform));

                const transform = request.context.user_is_viewing
                  .filter(
                    (t): t is MetabotTransformInfo => t.type === "transform",
                  )
                  .find((t) => t.id === suggestedTransform.id);
                const message: Omit<
                  MetabotAgentEditSuggestionChatMessage,
                  "id" | "role"
                > = {
                  type: "edit_suggestion",
                  model: "transform",
                  payload: {
                    editorTransform: transform,
                    suggestedTransform,
                  },
                };
                dispatch(
                  addAgentMessage({ ...message, convoId: conversationId }),
                );
              })
              .exhaustive();
          },
          onTextPart: function handleTextPart(part) {
            dispatch(
              addAgentTextDelta({
                convoId: conversationId,
                text: String(part),
              }),
            );
          },
          onToolCallPart: function handleToolCallPart(part) {
            dispatch(toolCallStart({ ...part, convoId: conversationId }));
          },
          onToolResultPart: function handleToolResultPart(part) {
            dispatch(toolCallEnd({ ...part, convoId: conversationId }));
          },
          onError: function handleError(part) {
            error = part;
          },
        },
      );

      if (error) {
        throw error;
      }

      if (response.aborted) {
        return rejectWithValue({
          type: "abort",
          conversation_id: request.conversation_id,
          unresolved_tool_calls: response.toolCalls.filter(
            (tc) => tc.state === "call",
          ),
          history: [
            ...getHistory(getState() as any, conversationId),
            ...response.history,
          ],
          // state object comes at the end, so we may not have recieved it
          // so fallback to the state used when the request was issued
          state: Object.keys(state).length === 0 ? request.state : state,
        });
      }

      return fulfillWithValue({
        conversation_id: request.conversation_id,
        history: [
          ...getHistory(getState() as any, conversationId),
          ...response.history,
        ],
        state,
      });
    } catch (error) {
      console.error(error);
      return rejectWithValue({ type: "error", ...handleResponseError(error) });
    }
  },
);

// TODO: this needs to be scoped for a conversation
export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase-enterprise/metabot/cancelInflightAgentRequests",
  (convoId: MetabotConvoId, { getState }) => {
    const conversation_id = getUniqueConversationId(getState() as any, convoId);
    getInflightRequestsForUrl("/api/ee/metabot-v3/agent-streaming")
      .filter((req) => req.conversation_id === conversation_id)
      .forEach((req) => req.abortController.abort());
  },
);

export const addDeveloperMessage = (payload: {
  convoId: MetabotConvoId;
  message: string;
}) => {
  return (dispatch: Dispatch, getState: any) => {
    const state = getState() as any;
    const isProcessing = getIsProcessing(state, payload.convoId);
    if (isProcessing) {
      console.error("Metabot is actively serving a request");
      // NOTE: silently failing - not great but is is better to not break the app for
      // now we don't want to write to history at this point in time as we'd have a
      // race condition w/ the in-flight request. in the future, it'd be preferable to
      // have a queue that we write to which flushes its contents into the history once
      // it has settled.
      return;
    } else {
      dispatch(metabot.actions.addDeveloperMessage(payload));
    }
  };
};

const rewindConversation = createAsyncThunk(
  "metabase-enterprise/metabot/rewindConversation",
  (
    payload: {
      conversationId: MetabotUniqueConvoId;
      messageId: string;
    },
    { dispatch, getState },
  ) => {
    dispatch(cancelInflightAgentRequests(payload.conversationId));

    const promptMessage = getUserPromptForMessageId(
      getState(),
      payload.conversationId,
      payload.messageId,
    );
    if (!promptMessage) {
      throw new Error("Unable to rewind conversation to prompt for pro");
    }
    dispatch(
      metabot.actions.rewindStateToMessageId({
        convoId: payload.conversationId,
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
    conversationId: MetabotUniqueConvoId;
  }
>(
  "metabase-enterprise/metabot/retryPrompt",
  async (
    { messageId, context, metabot_id, conversationId },
    { getState, dispatch },
  ) => {
    const prompt = getUserPromptForMessageId(
      getState() as any,
      conversationId,
      messageId,
    );
    if (!prompt) {
      throw new Error("Agent message was not proceeded by a user message");
    }

    dispatch(
      rewindConversation({
        conversationId,
        messageId: prompt.id,
      }),
    );
    dispatch(cancelInflightAgentRequests(conversationId));
    dispatch(
      metabot.actions.rewindStateToMessageId({
        convoId: conversationId,
        messageId: messageId,
      }),
    );

    return await dispatch(
      submitInput({
        conversationId: conversationId,
        type: "text",
        message: prompt.message,
        context,
        metabot_id,
      }),
    ).unwrap();
  },
);

export const removeConversation = createAsyncThunk(
  "metabase-enterprise/metabot/removeConversation ",
  (
    payload: { convoId: MetabotConvoId; resetReactions: boolean },
    { dispatch },
  ) => {
    dispatch(cancelInflightAgentRequests(payload.convoId));
    dispatch(metabot.actions.removeConversation(payload));
  },
);

export const stopProcessingAndNotify =
  (payload: {
    convoId: MetabotConvoId;
    message?: MetabotErrorMessage | false | undefined;
  }) =>
  (dispatch: Dispatch) => {
    dispatch(setIsProcessing({ convoId: payload.convoId, processing: false }));
    if (payload.message !== false) {
      const message = payload.message ?? {
        type: "message",
        message: METABOT_ERR_MSG.default,
      };
      dispatch(
        addAgentErrorMessage({
          convoId: payload.convoId,
          ...message,
        }),
      );
    }
  };
