import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import {
  EnterpriseApi,
  METABOT_TAG,
  metabotAgent,
} from "metabase-enterprise/api";
import type { MetabotChatContext, MetabotReaction } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import {
  notifyUnknownReaction,
  notifyUnkownError,
  reactionHandlers,
} from "../reactions";

import { metabot } from "./reducer";
import { getIsProcessing } from "./selectors";

export const {
  addUserMessage,
  dismissUserMessage,
  clearUserMessages,
  setIsProcessing,
} = metabot.actions;

export const setVisible = (isVisible: boolean) => (dispatch: Dispatch) => {
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

export const sendMessage = createAsyncThunk(
  "metabase-enterprise/metabot/sendMessage",
  async (
    data: { message: string; context: MetabotChatContext; history: any[] },
    { dispatch, getState },
  ) => {
    const isProcessing = getIsProcessing(getState() as any);
    if (isProcessing) {
      return console.error("Metabot is actively serving a request");
    }

    dispatch(clearUserMessages());

    const result = await dispatch(
      metabotAgent.initiate(data, { fixedCacheKey: METABOT_TAG }),
    );

    if (result.error) {
      notifyUnkownError()({ dispatch, getState });
    } else {
      const reactions = result.data?.reactions || [];
      await dispatch(processMetabotReactions(reactions));
    }
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
        notifyUnkownError()({ dispatch, getState });
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
  (message: string) => (dispatch: Dispatch) => {
    dispatch(setIsProcessing(false));
    dispatch(clearUserMessages());
    dispatch(addUserMessage(message));
  };
