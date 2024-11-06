import { t } from "ttag";
import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import {
  EnterpriseApi,
  METABOT_TAG,
  metabotAgent,
} from "metabase-enterprise/api";
import type { MetabotChatContext, MetabotReaction } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { notifyUnknownReaction, reactionHandlers } from "../reactions";

import { metabot } from "./reducer";
import {
  getConfirmationOptions,
  getIsProcessing,
  getLastHistoryValue,
  getLastSentContext,
} from "./selectors";

export const {
  addUserMessage,
  dismissUserMessage,
  clearUserMessages,
  setIsProcessing,
  setConfirmationOptions,
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

export const submitInput = createAsyncThunk(
  "metabase-enterprise/metabot/submitInput",
  async (
    data: { message: string; context: MetabotChatContext; history: any[] },
    { dispatch, getState },
  ) => {
    const isProcessing = getIsProcessing(getState() as any);
    if (isProcessing) {
      return console.error("Metabot is actively serving a request");
    }

    // handle if user is responding to a confirmation prompt
    const requestingUserConfirmation = !!getConfirmationOptions(
      getState() as any,
    );
    if (requestingUserConfirmation) {
      await dispatch(selectUserConfirmationOption(data.message));
    } else {
      dispatch(clearUserMessages());
      await dispatch(sendMessageRequest(data));
    }
  },
);

export const sendMessageRequest = createAsyncThunk(
  "metabase-enterprise/metabot/sendMessageRequest",
  async (
    data: { message: string; context: MetabotChatContext; history: any[] },
    { dispatch },
  ) => {
    const result = await dispatch(
      metabotAgent.initiate(data, { fixedCacheKey: METABOT_TAG }),
    );

    if (result.error) {
      dispatch(clearUserMessages());
      dispatch(addUserMessage(t`I can’t do that, unfortunately.`));
    } else {
      const reactions = result.data?.reactions || [];
      await dispatch(processMetabotReactions(reactions));
      return result;
    }
  },
);

export const selectUserConfirmationOption = createAsyncThunk(
  "metabase-enterprise/metabot/selectUserConfirmationOption",
  async (message: string, { dispatch, getState }) => {
    const userConfirmationOptions = getConfirmationOptions(getState() as any);

    if (!userConfirmationOptions) {
      console.warn("Metabot has no user options to let user choose from");
      return;
    }

    const confirmationOption = userConfirmationOptions[message];
    if (!confirmationOption) {
      const options = Object.keys(userConfirmationOptions);
      const quotedOptions = options.map(option => `“${option}”`).join(" or ");
      dispatch(addUserMessage(t`Sorry, could you give me a ${quotedOptions}?`));
    } else {
      dispatch(clearUserMessages());
      dispatch(setConfirmationOptions(undefined));
      await dispatch(processMetabotReactions(confirmationOption));
    }
  },
);

export const sendWritebackMessageRequest = createAsyncThunk(
  "metabase-enterprise/metabot/sendWritebackMessageRequest",
  async (message: string, { dispatch, getState }) => {
    const lastSentContext = getLastSentContext(getState() as any);
    const lastHistory = getLastHistoryValue(getState() as any);

    if (!lastSentContext) {
      console.warn(
        "Metabot expected to have a previously sent request before writing back to the server",
      );
    }

    await dispatch(
      sendMessageRequest({
        message,
        history: lastHistory,
        context: lastSentContext ?? ({} as any),
      }),
    );
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

export const stopProcessingAndNotify =
  (message?: string) => (dispatch: Dispatch) => {
    dispatch(setIsProcessing(false));
    dispatch(clearUserMessages());
    dispatch(addUserMessage(message || t`I can’t do that, unfortunately.`));
  };
