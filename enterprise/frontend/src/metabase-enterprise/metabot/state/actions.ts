import { type UnknownAction, isRejected, nanoid } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { getIsEmbedding } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import { EnterpriseApi } from "metabase-enterprise/api";
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
import { getConversationId } from "./reducer-utils";
import {
  getAgentErrorMessages,
  getAgentRequestMetadata,
  getDebugMode,
  getDeveloperMessage,
  getHistory,
  getIsProcessing,
  getLastMessage,
  getMetabotState,
  getProfile,
  getUserPromptForMessageId,
} from "./selectors";
import type {
  MetabotAgentEditSuggestionChatMessage,
  MetabotAgentTodoListChatMessage,
  MetabotConversationId,
  MetabotErrorMessage,
  MetabotFriendlyConversationId,
  MetabotStoreState,
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
  (payload: {
    conversation_id: MetabotFriendlyConversationId;
    visible: boolean;
  }) =>
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

export const setProfileOverride =
  ({
    profile,
    conversation_id,
  }: {
    profile: string | undefined;
    conversation_id: MetabotConversationId;
  }) =>
  (dispatch: Dispatch, getState: any) => {
    const currentProfile = getProfile(getState() as any, conversation_id);
    if (profile && currentProfile !== profile) {
      dispatch(resetConversation(conversation_id));
      const nextProfile = profile === "unset" ? undefined : profile;
      dispatch(
        metabot.actions.setProfileOverride({
          conversation_id,
          profile: nextProfile,
        }),
      );
    }
  };

export const executeSlashCommand = createAsyncThunk<
  void,
  { command: SlashCommand; conversation_id: MetabotConversationId }
>(
  "metabase-enterprise/metabot/executeSlashCommand",
  async ({ command, conversation_id }, { dispatch, getState }) => {
    match(command)
      .with({ cmd: "profile" }, ({ args }) => {
        if (args.length <= 1) {
          dispatch(setProfileOverride({ conversation_id, profile: args[0] }));
        } else {
          dispatch(addUndo({ message: "/profile <name>" }));
        }
      })
      .with({ cmd: "metabot" }, ({ args }) => {
        if (args.length <= 1) {
          dispatch(setMetabotReqIdOverride({ id: args[0], conversation_id }));
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
    metabot_id?: string;
    conversation_id: MetabotFriendlyConversationId;
  }
>(
  "metabase-enterprise/metabot/submitInput",
  async (data, { dispatch, getState, signal }) => {
    try {
      const state = getState() as any;
      const metabotState = getMetabotState(state);
      const conversation_id = getConversationId(
        metabotState,
        data.conversation_id,
      );
      if (!conversation_id) {
        throw new Error("TODO: handle this case");
      }

      const isProcessing = getIsProcessing(state, conversation_id);
      if (isProcessing) {
        console.error("Metabot is actively serving a request");
        return { prompt: data.message, success: false, shouldRetry: false };
      }

      // if there were from the last prompt, remove the last prompt from the history
      const errors = getAgentErrorMessages(state, conversation_id);
      const lastMessageId = getLastMessage(state, conversation_id)?.id;
      if (errors.length > 0 && lastMessageId) {
        dispatch(
          rewindConversation({
            conversation_id: conversation_id,
            messageId: lastMessageId,
          }),
        );
      }

      const command = parseSlashCommand(data.message);
      if (command) {
        await dispatch(
          executeSlashCommand({
            command,
            conversation_id,
          }),
        );
        return { prompt: data.message, success: true };
      }

      // it's important that we get the current metadata containing the history before
      // altering it by adding the current message the user is wanting to send
      const agentMetadata = getAgentRequestMetadata(
        getState() as any,
        conversation_id,
      );
      const messageId = createMessageId();
      const message =
        getDeveloperMessage(state, conversation_id) + data.message;
      dispatch(
        addUserMessage({
          id: messageId,
          ..._.omit(data, ["context", "metabot_id"]),
          message,
        }),
      );

      const sendMessageRequestPromise = dispatch(
        sendAgentRequest({
          ...data,
          message,
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
            conversation_id,
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
    // TODO: fix type cast
    const conversation_id = request.conversation_id as MetabotConversationId;

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

                dispatch(addAgentMessage({ ...message, conversation_id }));
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
                dispatch(addAgentMessage({ ...message, conversation_id }));
              })
              .exhaustive();
          },
          onTextPart: function handleTextPart(part) {
            dispatch(
              addAgentTextDelta({ conversation_id, text: String(part) }),
            );
          },
          onToolCallPart: function handleToolCallPart(part) {
            dispatch(toolCallStart({ ...part, conversation_id }));
          },
          onToolResultPart: function handleToolResultPart(part) {
            dispatch(toolCallEnd({ ...part, conversation_id }));
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
            ...getHistory(getState() as any, conversation_id),
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
          ...getHistory(getState() as any, conversation_id),
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
  (conversation_id: MetabotConversationId) => {
    getInflightRequestsForUrl("/api/ee/metabot-v3/agent-streaming")
      .filter((req) => req.conversation_id === conversation_id)
      .forEach((req) => req.abortController.abort());
  },
);

export const addDeveloperMessage = (payload: {
  conversation_id: MetabotFriendlyConversationId;
  message: string;
}) => {
  return (dispatch: Dispatch, getState: any) => {
    const state = getState() as any;
    const isProcessing = getIsProcessing(state, payload.conversation_id);
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
      conversation_id: MetabotConversationId;
      messageId: string;
    },
    { dispatch, getState },
  ) => {
    dispatch(cancelInflightAgentRequests(payload.conversation_id));

    const promptMessage = getUserPromptForMessageId(
      getState(),
      payload.conversation_id,
      payload.messageId,
    );
    if (!promptMessage) {
      throw new Error("Unable to rewind conversation to prompt for pro");
    }
    dispatch(
      metabot.actions.rewindStateToMessageId({
        conversation_id: payload.conversation_id,
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
    conversation_id: MetabotConversationId;
  }
>(
  "metabase-enterprise/metabot/retryPrompt",
  async (
    { messageId, context, metabot_id, conversation_id },
    { getState, dispatch },
  ) => {
    const prompt = getUserPromptForMessageId(
      getState() as any,
      conversation_id,
      messageId,
    );
    if (!prompt) {
      throw new Error("Agent message was not proceeded by a user message");
    }

    dispatch(rewindConversation({ conversation_id, messageId: prompt.id }));
    dispatch(cancelInflightAgentRequests(conversation_id));
    dispatch(
      metabot.actions.rewindStateToMessageId({
        conversation_id,
        messageId: messageId,
      }),
    );

    return await dispatch(
      submitInput({
        conversation_id,
        type: "text",
        message: prompt.message,
        context,
        metabot_id,
      }),
    ).unwrap();
  },
);

// TODO: rethink this
export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (conversation_id: MetabotConversationId, { dispatch }) => {
    dispatch(cancelInflightAgentRequests(conversation_id));

    // clear out suggested prompts so the user is shown something fresh
    dispatch(EnterpriseApi.util.invalidateTags(["metabot-prompt-suggestions"]));

    dispatch(metabot.actions.resetConversation({ conversation_id }));
  },
);

export const stopProcessing =
  (conversation_id: MetabotFriendlyConversationId) => (dispatch: Dispatch) => {
    dispatch(setIsProcessing({ conversation_id, processing: false }));
  };

export const stopProcessingAndNotify =
  (payload: {
    conversation_id: MetabotFriendlyConversationId;
    message?: MetabotErrorMessage | false | undefined;
  }) =>
  (dispatch: Dispatch) => {
    dispatch(stopProcessing(payload.conversation_id));
    if (payload.message !== false) {
      const message = payload.message ?? {
        type: "message",
        message: METABOT_ERR_MSG.default,
      };
      dispatch(
        addAgentErrorMessage({
          conversation_id: payload.conversation_id,
          ...message,
        }),
      );
    }
  };
