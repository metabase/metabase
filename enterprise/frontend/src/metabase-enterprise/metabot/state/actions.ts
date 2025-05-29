import type { UnknownAction } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { isMatching, match } from "ts-pattern";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { createAsyncThunk } from "metabase/lib/redux";
import { aiStreamingQuery } from "metabase-enterprise/api/ai";
import { getInflightRequestsForUrl } from "metabase-enterprise/api/ai/requests";
import type { JSONValue } from "metabase-enterprise/api/ai/types";
import type {
  MetabotAgentRequest,
  MetabotChatContext,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getErrorMessage } from "../constants";

import { metabot } from "./reducer";
import {
  getHistory,
  getIsProcessing,
  getMetabotConversationId,
  getMetabotState,
} from "./selectors";

const isAbortError = isMatching({ name: "AbortError" });

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
      metabot_id?: string;
    },
    { dispatch, getState, signal },
  ) => {
    const state = getState() as any;
    const isProcessing = getIsProcessing(state);
    if (isProcessing) {
      return console.error("Metabot is actively serving a request");
    }

    const history = getHistory(state);
    const metabotState = getMetabotState(state);

    dispatch(addUserMessage(data.message));
    const sendMessageRequestPromise = dispatch(
      sendMessageRequest({ ...data, state: metabotState, history }),
    );
    signal.addEventListener("abort", () => {
      sendMessageRequestPromise.abort();
    });
    return sendMessageRequestPromise;
  },
);

const streamAgentRequest = createAsyncThunk(
  "metabase-enterprise/metabot/streamAgentRequest",
  async ({ body }: { body: MetabotAgentRequest }, { dispatch, getState }) => {
    try {
      let state = { ...body.state };

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
              .with({ type: "state" }, () => {
                state = { ...state, ...part.value };
              })
              .with({ type: "navigate_to" }, () => {
                // TODO: create entity store / fix createAsyncThunk's types
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
          history: [...getHistory(getState() as any), ...response.history],
          state,
        },
        error: undefined,
      } as const;
    } catch (e) {
      console.error(e);
      const error = e instanceof Error ? e.message : "Unknown error";
      return {
        data: undefined,
        error: {
          status: "FETCH_ERROR",
          error,
        },
      } as const;
    }
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

    const result = (await dispatch(
      streamAgentRequest({ body: { ...data, conversation_id: sessionId } }),
    )) as any;

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

    return result;
  },
);

export const cancelInflightAgentRequests = createAsyncThunk(
  "metabase-enterprise/metabot/cancelInflightAgentRequests",
  (reason: string, { dispatch: _dispatch }) => {
    getInflightRequestsForUrl("/api/ee/metabot-v3/v2/agent-streaming").forEach(
      (req) => req.abortController.abort(reason),
    );
  },
);

export const resetConversation = createAsyncThunk(
  "metabase-enterprise/metabot/resetConversation",
  (_args, { dispatch }) => {
    dispatch(
      cancelInflightAgentRequests("User manaully cancelled the request"),
    );
    dispatch(clearMessages());
    dispatch(resetConversationId());
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
