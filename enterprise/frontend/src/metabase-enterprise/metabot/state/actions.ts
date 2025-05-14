import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { createAsyncThunk } from "metabase/lib/redux";
import {
  EnterpriseApi,
  METABOT_TAG,
  metabotAgent,
} from "metabase-enterprise/api";
import type { MetabotChatContext, MetabotReaction } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getErrorMessage } from "../constants";
import { notifyUnknownReaction, reactionHandlers } from "../reactions";

import { metabot } from "./reducer";
import { getIsProcessing, getMetabotConversationId } from "./selectors";

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

    if (!isVisible) {
      // reset the conversation history when closing metabot
      dispatch(
        EnterpriseApi.internalActions.removeMutationResult({
          fixedCacheKey: METABOT_TAG,
        }),
      );
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
      // TODO: if the request fails, do we want to put the message back into the input?
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

    const metabotRequestPromise = dispatch(
      metabotAgent.initiate(
        { ...data, conversation_id: sessionId },
        { fixedCacheKey: METABOT_TAG },
      ),
    );

    let isAborted = false;
    signal.addEventListener("abort", () => {
      // This flag is needed, so other async actions are not dispatched
      isAborted = true;
      // Need to abort the request so, the hook's `isDoingScience` is false
      metabotRequestPromise.abort();
    });

    const result = await metabotRequestPromise;
    if (isAborted) {
      return;
    }

    if (result.error) {
      console.error("Metabot request returned error: ", result.error);
      const message =
        (result.error as any).status >= 500 ? getErrorMessage() : undefined;
      dispatch(stopProcessingAndNotify(message));
    } else {
      const reactions = result.data?.reactions || [];
      await dispatch(processMetabotReactions(reactions));
      return result;
    }
  },
);

export const resetConversation = () => (dispatch: Dispatch, getState: any) => {
  // TODO: figure out how to cancel current request... for now just ignore the reset
  const isProcessing = getIsProcessing(getState() as any);
  if (isProcessing) {
    return console.error("Metabot is actively serving a request");
  }

  dispatch(clearMessages());
  dispatch(resetConversationId());
};

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

export const stopProcessingAndNotify =
  (message?: string) => (dispatch: Dispatch) => {
    dispatch(setIsProcessing(false));
    dispatch(addAgentMessage(message || t`I can’t do that, unfortunately.`));
  };
