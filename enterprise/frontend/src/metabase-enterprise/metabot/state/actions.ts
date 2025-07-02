import { type UnknownAction, isRejected } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { P, match } from "ts-pattern";

import { createAsyncThunk } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import {
  EnterpriseApi,
  metabotAgent,
  metabotApi,
} from "metabase-enterprise/api";
import {
  type JSONValue,
  aiStreamingQuery,
  getInflightRequestsForUrl,
} from "metabase-enterprise/api/ai-streaming";
import type {
  MetabotAgentRequest,
  MetabotAgentResponse,
  MetabotChatContext,
  MetabotReaction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { METABOT_ERR_MSG } from "../constants";
import { notifyUnknownReaction, reactionHandlers } from "../reactions";

import { type MetabotErrorMessage, metabot } from "./reducer";
import {
  getAgentErrorMessages,
  getAgentRequestMetadata,
  getHistory,
  getIsProcessing,
  getLastMessage,
  getMetabotConversationId,
  getUseStreaming,
  getUserPromptForMessageId,
} from "./selectors";
import { createMessageId } from "./utils";

export const {
  addAgentTextDelta,
  addAgentMessage,
  addAgentErrorMessage,
  addUserMessage,
  resetConversationId,
  setIsProcessing,
  toolCallStart,
  toolCallEnd,
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

export const toggleStreaming = () => (dispatch: Dispatch) => {
  dispatch(resetConversation());
  dispatch(metabot.actions.toggleStreaming());
};

export const setVisible =
  (isVisible: boolean) => (dispatch: Dispatch, getState: any) => {
    const currentUser = getUser(getState());
    if (!currentUser) {
      console.error(
        "Metabot can not be opened while there is no signed in user",
      );
      return;
    }

    dispatch(metabot.actions.setVisible(isVisible));
  };

export type MetabotPromptSubmissionResult =
  | { prompt: string; success: true; shouldRetry?: void }
  | { prompt: string; success: false; shouldRetry: false }
  | { prompt: string; success: false; shouldRetry: true };

export const submitInput = createAsyncThunk<
  MetabotPromptSubmissionResult,
  {
    message: string;
    context: MetabotChatContext;
    metabot_id?: string;
  }
>(
  "metabase-enterprise/metabot/submitInput",
  async (data, { dispatch, getState, signal }) => {
    try {
      const state = getState() as any;
      const isProcessing = getIsProcessing(state);
      if (isProcessing) {
        console.error("Metabot is actively serving a request");
        return { prompt: data.message, success: false, shouldRetry: false };
      }

      // if there were from the last prompt, remove the last prompt from the history
      const errors = getAgentErrorMessages(state);
      const lastMessageId = getLastMessage(state)?.id;
      if (errors.length > 0 && lastMessageId) {
        dispatch(rewindConversation(lastMessageId));
      }

      // it's important that we get the current metadata containing the history before
      // altering it by adding the current message the user is wanting to send
      const agentMetadata = getAgentRequestMetadata(getState() as any);
      const messageId = createMessageId();
      dispatch(addUserMessage({ id: messageId, message: data.message }));
      const useStreaming = getUseStreaming(getState() as any);
      const sendRequestAction = useStreaming
        ? sendStreamedAgentRequest
        : sendAgentRequest;
      const sendMessageRequestPromise = dispatch(
        sendRequestAction({
          ...data,
          ...agentMetadata,
        }),
      );
      signal.addEventListener("abort", () => {
        sendMessageRequestPromise.abort();
      });

      const result = await sendMessageRequestPromise;

      if (isRejected(result)) {
        dispatch(stopProcessingAndNotify(result.payload?.errorMessage));
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

export const sendAgentRequest = createAsyncThunk<
  MetabotAgentResponse,
  Omit<MetabotAgentRequest, "conversation_id">,
  { rejectValue: PromptErrorOutcome }
>(
  "metabase-enterprise/metabot/sendAgentRequest",
  async (
    data: Omit<MetabotAgentRequest, "conversation_id">,
    { dispatch, getState, rejectWithValue, fulfillWithValue },
  ) => {
    try {
      // TODO: make enterprise store
      let sessionId = getMetabotConversationId(getState() as any);
      // should not be needed, but just in case the value got unset
      if (!sessionId) {
        console.warn(
          "Metabot has no session id while open, this should never happen",
        );
        dispatch(resetConversationId());
        sessionId = getMetabotConversationId(getState() as any) as string;
      }

      const metabotRequestPromise = dispatch(
        metabotAgent.initiate({ ...data, conversation_id: sessionId }),
      );
      const result = await metabotRequestPromise;

      if (result.data) {
        await dispatch(processMetabotReactions(result.data?.reactions || []));
        return fulfillWithValue(result.data);
      } else {
        throw result.error;
      }
    } catch (error) {
      console.error(error);
      return rejectWithValue(handleResponseError(error));
    }
  },
);

export const sendStreamedAgentRequest = createAsyncThunk<
  Omit<MetabotAgentResponse, "reactions">,
  Omit<MetabotAgentRequest, "conversation_id">,
  { rejectValue: PromptErrorOutcome }
>(
  "metabase-enterprise/metabot/sendStreamedAgentRequest",
  async (
    req,
    { dispatch, getState, signal, rejectWithValue, fulfillWithValue },
  ) => {
    // TODO: make enterprise store
    let sessionId = getMetabotConversationId(getState() as any);

    // should not be needed, but just in case the value got unset
    if (!sessionId) {
      console.warn(
        "Metabot has no session id while open, this should never happen",
      );
      dispatch(resetConversationId());
      sessionId = getMetabotConversationId(getState() as any) as string;
    }

    try {
      const body = { ...req, conversation_id: sessionId };
      const state = { ...body.state };
      let error: unknown = undefined;

      const response = await aiStreamingQuery(
        {
          url: "/api/ee/metabot-v3/v2/agent-streaming",
          // NOTE: StructuredDatasetQuery as part of the EntityInfo in MetabotChatContext
          // is upsetting the types, casting for now
          body: body as JSONValue,
          signal,
        },
        {
          onDataPart: (part) => {
            match(part)
              // ignore state updates, we'll save it to the state when once we've
              // streamed the full response and know we have a successful request
              .with({ type: "state" }, () => {})
              .with({ type: "navigate_to" }, (part) => {
                dispatch(push(part.value) as UnknownAction);
              })
              .exhaustive();
          },
          onTextPart: (part) => {
            dispatch(addAgentTextDelta(String(part)));
          },
          onToolCallPart: (part) => dispatch(toolCallStart(part)),
          onToolResultPart: (part) => dispatch(toolCallEnd(part)),
          onError: (part) => (error = part),
        },
      );

      if (error) {
        throw error;
      }

      return fulfillWithValue({
        conversation_id: body.conversation_id,
        history: [...getHistory(getState() as any), ...response.history],
        state,
      });
    } catch (error) {
      console.error(error);
      return rejectWithValue(handleResponseError(error));
    }
  },
);

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase-enterprise/metabot/cancelInflightAgentRequests",
  (_args, { dispatch }) => {
    // cancel rtkquery managed requests
    const requests = dispatch(EnterpriseApi.util.getRunningMutationsThunk());
    const agentRequests = requests.filter(
      (req) => req.arg.endpointName === metabotApi.endpoints.metabotAgent.name,
    );
    agentRequests.forEach((req) => req.abort());

    // cancel streamed requests
    getInflightRequestsForUrl("/api/ee/metabot-v3/v2/agent-streaming").forEach(
      (req) => req.abortController.abort(),
    );
  },
);

const rewindConversation = createAsyncThunk(
  "metabase-enterprise/metabot/rewindConversation",
  (messageId: string, { dispatch, getState }) => {
    dispatch(cancelInflightAgentRequests());

    const promptMessage = getUserPromptForMessageId(getState(), messageId);
    if (!promptMessage) {
      throw new Error("Unable to rewind conversation to prompt for pro");
    }
    dispatch(metabot.actions.rewindStateToMessageId(promptMessage.id));
  },
);

export const retryPrompt = createAsyncThunk<
  MetabotPromptSubmissionResult & { prompt: string },
  {
    messageId: string;
    context: MetabotChatContext;
    metabot_id?: string;
  }
>(
  "metabase-enterprise/metabot/retryPrompt",
  async ({ messageId, context, metabot_id }, { getState, dispatch }) => {
    const prompt = getUserPromptForMessageId(getState() as any, messageId);
    if (!prompt) {
      throw new Error("Agent message was not proceeded by a user message");
    }

    dispatch(rewindConversation(prompt.id));
    dispatch(cancelInflightAgentRequests());
    dispatch(metabot.actions.rewindStateToMessageId(messageId));

    return await dispatch(
      submitInput({ message: prompt.message, context, metabot_id }),
    ).unwrap();
  },
);

export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (_args, { dispatch }) => {
    dispatch(cancelInflightAgentRequests());

    // clear out suggested prompts so the user is shown something fresh
    dispatch(EnterpriseApi.util.invalidateTags(["metabot-prompt-suggestions"]));

    dispatch(metabot.actions.resetConversation());
  },
);

export const processMetabotReactions = createAsyncThunk(
  "metabase-enterprise/metabot/processMetabotReactions",
  async (reactions: MetabotReaction[], { dispatch, getState }) => {
    dispatch(setIsProcessing(true));

    for (const reaction of reactions) {
      try {
        const reactionHandler =
          reactionHandlers[reaction.type] ?? notifyUnknownReaction;
        // TS isn't smart enough to know the reaction matches the handler
        await reactionHandler(reaction as any)({ dispatch, getState });
      } catch (error: any) {
        console.error("Halting processing of reactions.", error);
        dispatch(stopProcessingAndNotify());
        break;
      }

      // TODO: make an EnterpriseStore
      const isProcessing = getIsProcessing(getState() as any);
      if (!isProcessing) {
        console.warn(
          "A handler has stopped further procesing of metabot reactions",
        );
        break;
      }
    }

    dispatch(setIsProcessing(false));
  },
);

export const stopProcessing = () => (dispatch: Dispatch) => {
  dispatch(setIsProcessing(false));
};

export const stopProcessingAndNotify =
  (message?: MetabotErrorMessage | false | undefined) =>
  (dispatch: Dispatch) => {
    dispatch(stopProcessing());
    if (message !== false) {
      dispatch(
        addAgentErrorMessage(
          message ?? {
            type: "message",
            message: METABOT_ERR_MSG.default,
          },
        ),
      );
    }
  };
