import type { PayloadAction } from "@reduxjs/toolkit";
import { merge } from "icepick";
import type { WritableDraft } from "immer";
import { match } from "ts-pattern";

import { uuid } from "metabase/lib/uuid";

import type {
  MetabotAgentId,
  MetabotConverstationState,
  MetabotState,
} from "./types";

export type ConvoPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ agentId: MetabotAgentId } & Value>;

export const getRequestConversation = (
  state: WritableDraft<MetabotState>,
  action: {
    meta: { arg: { agentId: MetabotAgentId; conversation_id: string } };
  },
) => {
  const { agentId, conversation_id } = action.meta.arg;
  const convo = state.conversations[agentId];

  if (!convo) {
    console.warn(`Unable to find metabot conversation for ${agentId}`);
    return undefined;
  }

  if (conversation_id !== convo.conversationId) {
    console.warn(
      `Metabot conversation ${agentId} has ${convo.conversationId} but request was for ${conversation_id}`,
    );
    return undefined;
  }

  return convo;
};

const agentOverridesByAgentId: Partial<
  Record<MetabotAgentId, Partial<MetabotConverstationState>>
> = {
  sql: {
    profileOverride: "sql",
  },
};

export const createConversation = (
  agentId: MetabotAgentId,
  conversationOverrides?: Partial<MetabotConverstationState>,
): MetabotConverstationState => {
  const agentOverrides = agentOverridesByAgentId[agentId] ?? {};
  const overrides = merge(agentOverrides, conversationOverrides);

  return {
    isProcessing: false,
    messages: [],
    errorMessages: [],
    visible: false,
    history: [],
    state: {},
    activeToolCalls: [],
    profileOverride: undefined,
    ...overrides,
    conversationId: overrides?.conversationId ?? uuid(),
    experimental: {
      developerMessage: "",
      metabotReqIdOverride: undefined,
      ...overrides?.experimental,
    },
  };
};

export const resetReactionState = (
  state: WritableDraft<MetabotState>,
  agentId: MetabotAgentId,
) => {
  match(agentId)
    .with("omnibot", () => {
      state.reactions.navigateToPath = null;
      state.reactions.suggestedTransforms = [];
    })
    .with("sql", () => {
      state.reactions.suggestedCodeEdits = {};
    })
    .otherwise(() => {});
};

export const getConversationOrThrow = (
  state: WritableDraft<MetabotState>,
  agentId: MetabotAgentId,
): WritableDraft<MetabotConverstationState> => {
  const convo = state.conversations[agentId];
  if (!convo) {
    throw new Error(
      `Could not find metabot conversation with convo id: ${agentId}`,
    );
  }
  return convo;
};

export const convoReducer =
  <
    Action extends {
      payload: { agentId: MetabotAgentId };
    },
  >(
    convoReducerFn: (
      convo: WritableDraft<MetabotConverstationState>,
      action: Action,
      state: WritableDraft<MetabotState>,
    ) => void,
  ) =>
  (state: WritableDraft<MetabotState>, action: Action) => {
    convoReducerFn(
      getConversationOrThrow(state, action.payload.agentId),
      action,
      state,
    );
  };

export const getMetabotInitialState = (): MetabotState => {
  return {
    conversations: {
      omnibot: createConversation("omnibot"),
      sql: createConversation("sql"),
    },
    reactions: {
      navigateToPath: null,
      suggestedCodeEdits: {},
      // NOTE: suggestedTransforms should be folded into suggestedCodeEdits eventually
      suggestedTransforms: [],
    },
    debugMode: false,
  };
};
