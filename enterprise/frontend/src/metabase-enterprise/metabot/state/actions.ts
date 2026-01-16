import {
  type UnknownAction,
  createAsyncThunk as createAsyncThunkOriginal,
  isRejected,
  nanoid,
} from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { P, match } from "ts-pattern";
import _ from "underscore";

import { addUndo } from "metabase/redux/undo";
import { getIsEmbedding } from "metabase/selectors/embed";
import { getIsWorkspace } from "metabase/selectors/routing";
import { getUser } from "metabase/selectors/user";
import {
  type JSONValue,
  aiStreamingQuery,
  findMatchingInflightAiStreamingRequests,
} from "metabase-enterprise/api/ai-streaming";
import type { ProcessedChatResponse } from "metabase-enterprise/api/ai-streaming/process-stream";
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
  getMetabotConversation,
  getUserPromptForMessageId,
} from "./selectors";
import type {
  MetabotAgentEditSuggestionChatMessage,
  MetabotAgentId,
  MetabotAgentTodoListChatMessage,
  MetabotErrorMessage,
  MetabotStoreState,
  MetabotUserChatMessage,
  SlashCommand,
} from "./types";
import { createMessageId, parseSlashCommand } from "./utils";

interface MetabotThunkConfig {
  state: MetabotStoreState;
}

const createAsyncThunk =
  createAsyncThunkOriginal.withTypes<MetabotThunkConfig>();

export const {
  addAgentTextDelta,
  addAgentMessage,
  addAgentErrorMessage,
  addDeveloperMessage,
  addUserMessage,
  setIsProcessing,
  setNavigateToPath,
  setProfileOverride,
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
  addSuggestedCodeEdit,
  removeSuggestedCodeEdit,
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
  (payload: { agentId: MetabotAgentId; visible: boolean }) =>
  (dispatch: Dispatch, getState: () => MetabotStoreState) => {
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
  "metabase-enterprise/metabot/executeSlashCommand",
  async ({ command, agentId }, { dispatch, getState }) => {
    match(command)
      .with({ cmd: "profile" }, ({ args }) => {
        if (args.length <= 1) {
          dispatch(setProfileOverride({ agentId, profile: args[0] }));
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
        dispatch(addUndo({ message: "Unknown command" }));
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
  | { prompt: string; success: false; shouldRetry: false; data?: void }
  | { prompt: string; success: false; shouldRetry: true; data?: void };

export const submitInput = createAsyncThunk<
  MetabotPromptSubmissionResult,
  Omit<MetabotUserChatMessage, "id" | "role"> & {
    context: MetabotChatContext;
    agentId: MetabotAgentId;
    metabot_id?: string;
  }
>(
  "metabase-enterprise/metabot/submitInput",
  async (payload, { dispatch, getState, signal }) => {
    const state = getState();
    const { agentId, message: rawPrompt, ...data } = payload;
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
      const errors = getAgentErrorMessages(state, agentId);
      const lastMessageId = getLastMessage(state, agentId)?.id;
      if (errors.length > 0 && lastMessageId) {
        dispatch(
          rewindConversation({
            agentId,
            messageId: lastMessageId,
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
          ...agentMetadata,
        }),
      );
      signal.addEventListener("abort", () => {
        sendMessageRequestPromise.abort();
      });

      const result = await sendMessageRequestPromise;

      if (isRejected(result)) {
        if (result.payload?.type === "error") {
          dispatch(
            stopProcessingAndNotify({
              agentId,
              message: result.payload?.errorMessage,
            }),
          );
        }
        const shouldRetry =
          (result.payload &&
            "shouldRetry" in result.payload &&
            (result.payload?.shouldRetry ?? {})) ??
          false;
        return { prompt: rawPrompt, success: false, shouldRetry };
      }

      return { prompt, success: true, data: result.payload };
    } catch (error) {
      // NOTE: all errors should be caught above, this is is a catch-all
      // to make sure that this async action always resolves to a value
      console.error(error);
      return { prompt, success: false, shouldRetry: true };
    }
  },
);

type SendAgentRequestError =
  | ({ type: "error" } & PromptErrorOutcome)
  | ({
      type: "abort";
      unresolved_tool_calls: { toolCallId: string; toolName: string }[];
    } & MetabotAgentResponse);

type SendAgentRequestResult = MetabotAgentResponse & {
  processedResponse: ProcessedChatResponse;
};

export const sendAgentRequest = createAsyncThunk<
  SendAgentRequestResult,
  MetabotAgentRequest & { agentId: MetabotAgentId },
  { rejectValue: SendAgentRequestError }
>(
  "metabase-enterprise/metabot/sendAgentRequest",
  async (
    payload,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    const isEmbedding = getIsEmbedding(getState());
    const isWorkspace = getIsWorkspace(getState());
    const { agentId, ...request } = payload;

    try {
      let state = {};
      let error: unknown = undefined;

      const response = await aiStreamingQuery(
        {
          url: "/api/ee/metabot-v3/native-agent-streaming",
          // NOTE: StructuredDatasetQuery as part of the EntityInfo in MetabotChatContext
          // is upsetting the types, casting for now
          body: request as JSONValue,
          signal,
          sourceId: agentId,
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

                dispatch(addAgentMessage({ ...message, agentId }));
              })
              .with({ type: "code_edit" }, (part) => {
                dispatch(addSuggestedCodeEdit({ ...part.value, active: true }));
              })
              .with({ type: "navigate_to" }, (part) => {
                dispatch(setNavigateToPath(part.value));

                if (!isEmbedding && !isWorkspace) {
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
                dispatch(addAgentMessage({ ...message, agentId }));
              })
              .exhaustive();
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
          history: [...getHistory(getState(), agentId), ...response.history],
          // state object comes at the end, so we may not have received it
          // so fallback to the state used when the request was issued
          state: Object.keys(state).length === 0 ? request.state : state,
        });
      }

      return fulfillWithValue({
        conversation_id: request.conversation_id,
        history: [...getHistory(getState(), agentId), ...response.history],
        state,
        processedResponse: response,
      });
    } catch (error) {
      console.error(error);
      return rejectWithValue({ type: "error", ...handleResponseError(error) });
    }
  },
);

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase-enterprise/metabot/cancelInflightAgentRequests",
  (agentId: MetabotAgentId) => {
    findMatchingInflightAiStreamingRequests(
      "/api/ee/metabot-v3/native-agent-streaming",
      agentId,
    ).forEach((req) => req.abortController.abort());
  },
);

const rewindConversation = createAsyncThunk(
  "metabase-enterprise/metabot/rewindConversation",
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
  "metabase-enterprise/metabot/retryPrompt",
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

export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (payload: { agentId: MetabotAgentId }, { dispatch }) => {
    dispatch(cancelInflightAgentRequests(payload.agentId));
    dispatch(metabot.actions.resetConversation(payload));
  },
);

export const stopProcessingAndNotify =
  (payload: {
    agentId: MetabotAgentId;
    message?: MetabotErrorMessage | false | undefined;
  }) =>
  (dispatch: Dispatch) => {
    dispatch(setIsProcessing({ agentId: payload.agentId, processing: false }));
    if (payload.message !== false) {
      const message = payload.message ?? {
        type: "message",
        message: METABOT_ERR_MSG.default,
      };
      dispatch(
        addAgentErrorMessage({
          agentId: payload.agentId,
          ...message,
        }),
      );
    }
  };
