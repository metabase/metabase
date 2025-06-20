import { type UnknownAction, isRejected, nanoid } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { P, isMatching, match } from "ts-pattern";
import { t } from "ttag";

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
  MetabotChatContext,
  MetabotReaction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getAgentOfflineError } from "../constants";
import { notifyUnknownReaction, reactionHandlers } from "../reactions";

import { metabot } from "./reducer";
import {
  getAgentRequestMetadata,
  getIsProcessing,
  getMetabotConversationId,
  getUseStreaming,
  getUserPromptForMessageId,
} from "./selectors";

const isAbortError = isMatching({ name: "AbortError" });

export const {
  addAgentMessage,
  addUserMessage,
  resetConversationId,
  setIsProcessing,
  toolCallStart,
  toolCallEnd,
} = metabot.actions;

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
    const state = getState() as any;
    const isProcessing = getIsProcessing(state);
    if (isProcessing) {
      console.error("Metabot is actively serving a request");
      return { prompt: data.message, success: false, shouldRetry: false };
    }

    // it's important that we get the current metadata containing the history before
    // altering it by adding the current message the user is wanting to send
    const agentMetadata = getAgentRequestMetadata(getState() as any);
    const messageId = nanoid();
    dispatch(addUserMessage({ id: messageId, message: data.message }));

    const useStreaming = getUseStreaming(getState() as any);
    const sendRequestAction = useStreaming
      ? sendStreamedAgentRequest
      : sendAgentRequest;
    const sendMessageRequestPromise = dispatch(
      sendRequestAction({ ...data, ...agentMetadata }),
    );
    signal.addEventListener("abort", () => {
      sendMessageRequestPromise.abort();
    });

    const result = await sendMessageRequestPromise;

    // TODO:
    if (isRejected(result)) {
      const shouldRetry = !!result.error;
      dispatch(rewindConversation(messageId));
      dispatch(stopProcessingAndNotify(t`Something went wrong, try again.`));
      console.error(result.error);
      return { prompt: data.message, success: false, shouldRetry };
    }

    return { prompt: data.message, success: true };
  },
);

export const sendAgentRequest = createAsyncThunk(
  "metabase-enterprise/metabot/sendAgentRequest",
  async (
    data: Omit<MetabotAgentRequest, "conversation_id">,
    { dispatch, getState },
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

    const metabotRequestPromise = dispatch(
      metabotAgent.initiate({ ...data, conversation_id: sessionId }),
    );

    const result = await metabotRequestPromise;

    if (result.error) {
      const didUserAbort = isAbortError(result.error);
      if (didUserAbort) {
        dispatch(stopProcessing());
      } else {
        console.error("Metabot request returned error: ", result.error);
        const message =
          (result.error as any).status >= 500
            ? getAgentOfflineError()
            : undefined;
        dispatch(stopProcessingAndNotify(message));
      }
    }

    const reactions = result.data?.reactions || [];
    await dispatch(processMetabotReactions(reactions));
    return result;
  },
);

export const sendStreamedAgentRequest = createAsyncThunk(
  "metabase-enterprise/metabot/sendStreamedAgentRequest",
  async (
    req: Omit<MetabotAgentRequest, "conversation_id">,
    { dispatch, getState, signal },
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
            dispatch(addAgentMessage({ type: "reply", message: String(part) }));
          },
          onToolCallPart: (part) => dispatch(toolCallStart(part)),
          onToolResultPart: () => dispatch(toolCallEnd()),
          onError: (part) => (error = part),
        },
      );

      if (error) {
        throw error;
      }

      return {
        data: {
          conversation_id: body.conversation_id,
          history: [...body.history, ...response.history],
          state,
        },
        error: undefined,
      } as const;
    } catch (error) {
      console.error("Metabot request error: ", error);

      const notification = match(error)
        .with({ name: "AbortError" }, () => false as const)
        .with({ status: P.number.gte(500) }, getAgentOfflineError)
        .otherwise(() => t`Something went wrong.`);

      if (notification !== false) {
        dispatch(addAgentMessage({ type: "error", message: notification }));
      }

      return { data: undefined, error };
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

export const rewindConversation = createAsyncThunk(
  "metabase-enterprise/metabot/rewindConversation",
  (messageId: string, { dispatch }) => {
    dispatch(setIsProcessing(false));

    dispatch(cancelInflightAgentRequests());

    dispatch(metabot.actions.rewindStateToMessageId(messageId));
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

    return await dispatch(
      submitInput({ message: prompt.message, context, metabot_id }),
    ).unwrap();
  },
);

export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (_args, { dispatch }) => {
    dispatch(setIsProcessing(false));

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
  (message?: string) => (dispatch: Dispatch) => {
    dispatch(stopProcessing());
    dispatch(
      addAgentMessage({
        type: "error",
        message: message || t`Something went wrong, try again.`,
      }),
    );
  };
