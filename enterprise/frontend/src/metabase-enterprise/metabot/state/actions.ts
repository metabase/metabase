import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { createAsyncThunk } from "metabase/lib/redux";
import {
  EnterpriseApi,
  METABOT_TAG,
  metabotAgent,
} from "metabase-enterprise/api";
import type {
  MetabotAgentResponse,
  MetabotChatContext,
  MetabotReaction,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { getErrorMessage } from "../constants";
import { notifyUnknownReaction, reactionHandlers } from "../reactions";

import { metabot } from "./reducer";
import { getIsProcessing, getMetabotConversationId } from "./selectors";
import {
  StreamingMessageSchema,
  streamingPayloadSchema,
} from "./streaming-schemas";

class Defer<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void = () => {};
  reject: (reason?: any) => void = () => {};

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export const {
  addUserMessage,
  dismissUserMessage,
  clearUserMessages,
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

    dispatch(clearUserMessages());
    const sendMessageRequestPromise = dispatch(
      sendMessageRequestStreaming(data),
    );
    signal.addEventListener("abort", () => {
      sendMessageRequestPromise.abort();
    });
    return sendMessageRequestPromise;
  },
);

export const sendMessageRequestStreaming = createAsyncThunk(
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

    const messages: StreamingMessageSchema[] = [];

    let state: unknown = {};

    dispatch(metabot.actions.setIsProcessing(true));

    const deferred = new Defer<null>();

    const _streamingResponse = fetch("/api/ee/metabot-v3/v2/agent-streaming", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({ ...data, conversation_id: sessionId }),
    }).then((response) => {
      if (!response || !response.body) {
        throw new Error("No response");
      }
      console.log(response);
      const reader = response.body.getReader();
      // read() returns a promise that resolves when a value has been received
      reader.read().then(async function pump({ done, value }): Promise<any> {
        console.log(">>>>>>", value);
        if (value) {
          const stringValue = new TextDecoder().decode(value);
          console.log(stringValue);
          const parsedValue = streamingPayloadSchema.cast(
            JSON.parse(stringValue),
          );

          const data = parsedValue.data;
          const message = data.message as StreamingMessageSchema;

          messages.push(message);

          const reactions: MetabotReaction[] = [];

          if (message.role === "assistant" && message.content) {
            reactions.push({
              type: "metabot.reaction/message",
              message: message.content,
            });
          }

          if (message.role === "assistant" && message.navigate_to) {
            reactions.push({
              type: "metabot.reaction/redirect",
              url: message.navigate_to,
            });
          }

          if (message.role === "assistant" && message.tool_calls?.length) {
            for (const tc of message.tool_calls) {
              reactions.push({
                type: "metabot.reaction/message",
                message: `Calling tool: ${tc.name}`,
              });
            }
          }

          if (data.state) {
            state = data.state;
          }

          if (reactions.length) {
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
            }
          }
        }

        console.log("IS DONE", done);
        if (done) {
          deferred.resolve(null);
          return;
        }
        return await reader.read().then(pump);
      });
    });

    await deferred.promise;

    dispatch(metabot.actions.setIsProcessing(false));

    const result: MetabotAgentResponse = {
      history: messages,
      reactions: [],
      state,
      conversation_id: sessionId,
    };

    return result;
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
      dispatch(clearUserMessages());
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
