import type { UnknownAction } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { createAsyncThunk } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import {
  type JSONValue,
  aiStreamingQuery,
  getInflightRequestsForUrl,
} from "metabase-enterprise/api/ai-streaming";
import type {
  MetabotAgentRequest,
  MetabotChatContext,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getAgentOfflineError } from "../constants";

import { metabot } from "./reducer";
import {
  getHistory,
  getIsProcessing,
  getMetabotConversationId,
  getMetabotState,
} from "./selectors";

export const {
  addAgentMessage,
  addUserMessage,
  clearMessages,
  resetConversationId,
  setIsProcessing,
  toolCallStart,
  toolCallEnd,
} = metabot.actions;

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

export const submitInput = createAsyncThunk(
  "metabase-enterprise/metabot/submitInput",
  async (
    data: {
      message: string;
      context: MetabotChatContext;
      metabot_id?: string;
    },
    { dispatch, getState },
  ) => {
    const state = getState() as any;
    const isProcessing = getIsProcessing(state);
    if (isProcessing) {
      return console.error("Metabot is actively serving a request");
    }

    const history = getHistory(state);
    const metabotState = getMetabotState(state);

    dispatch(addUserMessage(data.message));
    dispatch(sendMessageRequest({ ...data, state: metabotState, history }));
  },
);

export const sendMessageRequest = createAsyncThunk(
  "metabase-enterprise/metabot/sendMessageRequest",
  async (
    req: Omit<MetabotAgentRequest, "conversation_id">,
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

    try {
      const body = { ...req, conversation_id: sessionId };
      const state = { ...body.state };

      const response = await aiStreamingQuery(
        {
          url: "/api/ee/metabot-v3/v2/agent-streaming",
          // NOTE: StructuredDatasetQuery as part of the EntityInfo in MetabotChatContext
          // is upsetting the types, casting for now
          body: body as JSONValue,
        },
        {
          onDataPart: (part) => {
            match(part)
              .with({ type: "state" }, (part) =>
                Object.assign(state, part.value),
              )
              .with({ type: "navigate_to" }, (part) => {
                dispatch(push(part.value) as UnknownAction);
              })
              .exhaustive();
          },
          onTextPart: (part) => {
            dispatch(addAgentMessage({ type: "reply", message: String(part) }));
          },
          onToolCallPart: (part) => dispatch(toolCallStart(part)),
          onToolResultPart: (part) => dispatch(toolCallEnd(part.toolCallId)),
        },
      );

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
        .otherwise(() => t`I can’t do that, unfortunately.`);

      if (notification !== false) {
        dispatch(addAgentMessage({ type: "error", message: notification }));
      }

      return { data: undefined, error };
    }
  },
);

export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (_args, { dispatch }) => {
    getInflightRequestsForUrl("/api/ee/metabot-v3/v2/agent-streaming").forEach(
      (req) => req.abortController.abort("User manaully cancelled the request"),
    );
    dispatch(clearMessages());
    dispatch(resetConversationId());
  },
);
