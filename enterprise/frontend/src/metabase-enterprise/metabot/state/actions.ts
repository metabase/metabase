import { isMatching } from "ts-pattern";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { createAsyncThunk } from "metabase/lib/redux";
import {
  EnterpriseApi,
  METABOT_TAG,
  metabotAgent,
  metabotApi,
} from "metabase-enterprise/api";
import type { MetabotChatContext, MetabotReaction } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getErrorMessage } from "../constants";
import { notifyUnknownReaction, reactionHandlers } from "../reactions";

import { metabot } from "./reducer";
import { getIsProcessing, getMetabotConversationId } from "./selectors";

const isAbortError = isMatching({ name: "AbortError" });

export const {
  addAgentMessage,
  addUserMessage,
  clearMessages,
  resetConversationId,
  setIsProcessing,
} = metabot.actions;

export const setVisible =
  (isVisible: boolean) => (dispatch: Dispatch, getState: any) => {
    const currentUser = getCurrentUser(getState());
    if (!currentUser) {
      console.error(
        "Metabot can not be opened while there is no signed in user",
      );
      return;
    }

    dispatch(metabot.actions.setVisible(isVisible));
  };

export const submitInput = createAsyncThunk(
  "metabase-enterprise/metabot/submitInput",
  async (
    data: {
      message: string;
      context: MetabotChatContext;
      history: any[];
      state: any;
      metabot_id?: string;
    },
    { dispatch, getState, signal },
  ) => {
    const isProcessing = getIsProcessing(getState() as any);
    if (isProcessing) {
      return console.error("Metabot is actively serving a request");
    }

    dispatch(addUserMessage(data.message));
    const sendMessageRequestPromise = dispatch(sendMessageRequest(data));
    signal.addEventListener("abort", () => {
      sendMessageRequestPromise.abort();
    });
    return sendMessageRequestPromise;
  },
);

export const sendMessageRequest = createAsyncThunk(
  "metabase-enterprise/metabot/sendMessageRequest",
  async (
    data: {
      message: string;
      context: MetabotChatContext;
      history: any[];
      state: any;
      metabot_id?: string;
    },
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
      metabotAgent.initiate(
        { ...data, conversation_id: sessionId },
        { fixedCacheKey: METABOT_TAG },
      ),
    );

    const result = await metabotRequestPromise;

    if (result.error) {
      const didUserAbort = isAbortError(result.error);
      if (didUserAbort) {
        dispatch(stopProcessing());
      } else {
        console.error("Metabot request returned error: ", result.error);
        const message =
          (result.error as any).status >= 500 ? getErrorMessage() : undefined;
        dispatch(stopProcessingAndNotify(message));
      }
    }

    const reactions = result.data?.reactions || [];
    await dispatch(processMetabotReactions(reactions));
    return result;
  },
);

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase-enterprise/metabot/cancelInflightAgentRequests",
  (_args, { dispatch }) => {
    const requests = dispatch(EnterpriseApi.util.getRunningMutationsThunk());
    const agentRequests = requests.filter(
      (req) => req.arg.endpointName === metabotApi.endpoints.metabotAgent.name,
    );
    agentRequests.forEach((req) => req.abort());
  },
);

export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (_args, { dispatch }) => {
    dispatch(cancelInflightAgentRequests());
    // clear previous agent request state so history value is empty for future requests
    dispatch(
      EnterpriseApi.internalActions.removeMutationResult({
        fixedCacheKey: METABOT_TAG,
      }),
    );

    dispatch(clearMessages());
    dispatch(resetConversationId());
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
        message: message || t`I can’t do that, unfortunately.`,
      }),
    );
  };
