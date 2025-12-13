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
  findMatchingInflightAiStreamingRequests,
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
  getMetabotConversation,
  getUserPromptForMessageId,
} from "./selectors";
import type {
  MetabotAgentEditSuggestionChatMessage,
  MetabotAgentTodoListChatMessage,
  MetabotConvoId,
  MetabotErrorMessage,
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
  setProfileOverride,
  newConversation,
  removeConversation,
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
  { command: SlashCommand; convoId: MetabotConvoId }
>(
  "metabase-enterprise/metabot/executeSlashCommand",
  async ({ command, convoId: conversationId }, { dispatch, getState }) => {
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
    convoId: MetabotConvoId;
    metabot_id?: string;
  }
>(
  "metabase-enterprise/metabot/submitInput",
  async (payload, { dispatch, getState, signal }) => {
    const state = getState() as any;
    const { convoId, message: rawPrompt, ...data } = payload;

    const prompt = rawPrompt.trim();
    if (prompt === "") {
      console.warn("An empty prompt was submitted to conversation: ", convoId);
      return { prompt, success: true };
    }

    try {
      const isProcessing = getIsProcessing(state, convoId);
      if (isProcessing) {
        console.error("Metabot is actively serving a request");
        return { prompt, success: false, shouldRetry: false };
      }

      const convoState = getMetabotConversation(state, convoId);
      if (!convoState) {
        console.error(
          "There is not metabot conversation initialized for conversation: ",
          convoId,
        );
        return { prompt, success: false, shouldRetry: false };
      }

      // if there were from the last prompt, remove the last prompt from the history
      const errors = getAgentErrorMessages(state, convoId);
      const lastMessageId = getLastMessage(state, convoId)?.id;
      if (errors.length > 0 && lastMessageId) {
        dispatch(
          rewindConversation({
            convoId: convoId,
            messageId: lastMessageId,
          }),
        );
      }

      const command = parseSlashCommand(prompt);
      if (command) {
        await dispatch(
          executeSlashCommand({
            command,
            convoId,
          }),
        );
        return { prompt, success: true };
      }

      // it's important that we get the current metadata containing the history before
      // altering it by adding the current message the user is wanting to send
      const agentMetadata = getAgentRequestMetadata(getState() as any, convoId);
      const messageId = createMessageId();
      const promptWithDevMsg = getDeveloperMessage(state, convoId) + prompt;
      dispatch(
        addUserMessage({
          id: messageId,
          ..._.omit(data, ["context", "metabot_id"]),
          message: prompt,
          convoId: convoId,
        }),
      );

      const sendMessageRequestPromise = dispatch(
        sendAgentRequest({
          ...data,
          message: promptWithDevMsg,
          convoId,
          conversation_id: convoState.conversationId,
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
            convoId: convoId,
            message: result.payload?.errorMessage,
          }),
        );
        return {
          prompt,
          success: false,
          shouldRetry: result.payload?.shouldRetry ?? false,
        };
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

export const sendAgentRequest = createAsyncThunk<
  MetabotAgentResponse,
  MetabotAgentRequest & { convoId: MetabotConvoId },
  { rejectValue: SendAgentRequestError }
>(
  "metabase-enterprise/metabot/sendAgentRequest",
  async (
    payload,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    const isEmbedding = getIsEmbedding(getState() as any);
    const { convoId, ...request } = payload;

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
          sourceId: convoId,
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

                dispatch(addAgentMessage({ ...message, convoId }));
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
                dispatch(addAgentMessage({ ...message, convoId }));
              })
              .exhaustive();
          },
          onTextPart: function handleTextPart(part) {
            dispatch(addAgentTextDelta({ convoId, text: String(part) }));
          },
          onToolCallPart: function handleToolCallPart(part) {
            dispatch(toolCallStart({ ...part, convoId }));
          },
          onToolResultPart: function handleToolResultPart(part) {
            dispatch(toolCallEnd({ ...part, convoId }));
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
            ...getHistory(getState() as any, convoId),
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
          ...getHistory(getState() as any, convoId),
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

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase-enterprise/metabot/cancelInflightAgentRequests",
  (convoId: MetabotConvoId) => {
    findMatchingInflightAiStreamingRequests(
      "/api/ee/metabot-v3/agent-streaming",
      convoId,
    ).forEach((req) => req.abortController.abort());
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
      convoId: MetabotConvoId;
      messageId: string;
    },
    { dispatch, getState },
  ) => {
    dispatch(cancelInflightAgentRequests(payload.convoId));

    const promptMessage = getUserPromptForMessageId(
      getState(),
      payload.convoId,
      payload.messageId,
    );
    if (!promptMessage) {
      throw new Error("Unable to rewind conversation to prompt for pro");
    }
    dispatch(
      metabot.actions.rewindStateToMessageId({
        convoId: payload.convoId,
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
    convoId: MetabotConvoId;
  }
>(
  "metabase-enterprise/metabot/retryPrompt",
  async (
    { messageId, context, metabot_id, convoId },
    { getState, dispatch },
  ) => {
    const state = getState() as any;

    const prompt = getUserPromptForMessageId(state, convoId, messageId);
    if (!prompt) {
      throw new Error("Agent message was not proceeded by a user message");
    }

    const isProcessing = getIsProcessing(state, convoId);
    if (isProcessing) {
      console.error("Metabot is actively serving a request");
      return { prompt: prompt.message, success: false, shouldRetry: false };
    }

    dispatch(
      rewindConversation({
        convoId,
        messageId: prompt.id,
      }),
    );
    dispatch(cancelInflightAgentRequests(convoId));
    dispatch(
      metabot.actions.rewindStateToMessageId({
        convoId: convoId,
        messageId: messageId,
      }),
    );

    return await dispatch(
      submitInput({
        convoId,
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
  (
    payload: { convoId: MetabotConvoId; resetReactions: boolean },
    { dispatch },
  ) => {
    dispatch(cancelInflightAgentRequests(payload.convoId));
    dispatch(metabot.actions.resetConversation(payload));
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
