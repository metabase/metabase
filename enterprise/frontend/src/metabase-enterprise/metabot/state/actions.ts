import { t } from "ttag";
import _ from "underscore";

import { createAsyncThunk } from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";
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
  getMetabotSessionId,
} from "./selectors";

export const {
  addUserMessage,
  dismissUserMessage,
  clearUserMessages,
  setIsProcessing,
  setConfirmationOptions,
  setSessionId,
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
    { dispatch, getState },
  ) => {
    // TODO: make enterprise store
    let sessionId = getMetabotSessionId(getState() as any);

    // should not be needed, but just in case the value got unset
    if (!sessionId) {
      console.warn(
        "Metabot has no session id while open, this should never happen",
      );
      sessionId = uuid();
      dispatch(setSessionId(sessionId));
    }

    const result = await dispatch(
      metabotAgent.initiate(
        { ...data, session_id: sessionId },
        { fixedCacheKey: METABOT_TAG },
      ),
    );

    if (result.error) {
      console.error("Metabot request returned error: ", result.error);
      dispatch(clearUserMessages());
      const message =
        (result.error as any).status >= 500
          ? t`I'm currently offline, try again later.`
          : undefined;
      dispatch(stopProcessingAndNotify(message));
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
