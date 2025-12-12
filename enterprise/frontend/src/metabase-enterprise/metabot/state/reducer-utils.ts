import type { PayloadAction } from "@reduxjs/toolkit";
import type { WritableDraft } from "immer";

import { uuid } from "metabase/lib/uuid";

import {
  type MetabotConverstationState,
  type MetabotConvoId,
  type MetabotFixedConvoId,
  type MetabotState,
  type MetabotUniqueConvoId,
  isMetabotChatDomainId,
} from "./types";

export type ConvoPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ convoId: MetabotConvoId } & Value>;

export const getUniqueConversationId = (
  state: WritableDraft<MetabotState>,
  id: MetabotConvoId,
): MetabotUniqueConvoId => {
  return isMetabotChatDomainId(id) ? state.fixedConversationIds[id] : id;
};

export const findFixedConversationId = (
  state: WritableDraft<MetabotState>,
  id: MetabotConvoId,
): MetabotFixedConvoId | undefined => {
  if (isMetabotChatDomainId(id)) {
    return id;
  }

  type Key = keyof MetabotState["fixedConversationIds"];
  type Value = MetabotState["fixedConversationIds"][Key];
  const kvs = Object.entries(state.fixedConversationIds) as [Key, Value][];
  return kvs.find((kv) => kv[1] === id)?.[0];
};

export const getConversation = (
  state: WritableDraft<MetabotState>,
  id: MetabotConvoId,
): WritableDraft<MetabotConverstationState> | undefined => {
  return state.conversations[getUniqueConversationId(state, id)];
};

export const getRequestConversation = (
  state: WritableDraft<MetabotState>,
  action: { meta: { arg: { conversation_id: string } } },
) => {
  const convoId = action.meta.arg.conversation_id as unknown as MetabotConvoId;
  return getConversation(state as any, convoId);
};

// Create a unique id for a metabot conversations
export const createConversationId = (): MetabotUniqueConvoId => {
  return uuid() as MetabotUniqueConvoId;
};

// Create a new empty conversation
export const createConversation = (
  overrides?: Partial<MetabotConverstationState>,
): MetabotConverstationState => ({
  isProcessing: false,
  messages: [],
  errorMessages: [],
  visible: false,
  history: [],
  state: {},
  activeToolCalls: [],
  ...overrides,
  conversationId: overrides?.conversationId ?? createConversationId(),
  experimental: {
    developerMessage: "",
    metabotReqIdOverride: undefined,
    profileOverride: undefined,
    ...overrides?.experimental,
  },
});

export const getConversationOrThrow = (
  state: WritableDraft<MetabotState>,
  convoId: MetabotConvoId,
): WritableDraft<MetabotConverstationState> => {
  const conversationId = isMetabotChatDomainId(convoId)
    ? state.fixedConversationIds[convoId]
    : convoId;
  const convo = getConversation(state, conversationId);
  if (!convo) {
    throw new Error(
      `Could not find metabot conversation with convo id: ${convoId}`,
    );
  }
  return convo;
};

export const convoReducer =
  <
    Action extends {
      payload: { convoId: MetabotConvoId };
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
      getConversationOrThrow(state, action.payload.convoId),
      action,
      state,
    );
  };

export const getMetabotInitialState = (): MetabotState => {
  const omnibotConvo = createConversation();
  const inlineSqlConvo = createConversation();

  return {
    conversations: {
      [omnibotConvo.conversationId]: omnibotConvo,
      [inlineSqlConvo.conversationId]: inlineSqlConvo,
    },
    fixedConversationIds: {
      omnibot: omnibotConvo.conversationId,
      inline_sql: inlineSqlConvo.conversationId,
    },
    reactions: {
      navigateToPath: null,
      suggestedCodeEdits: [],
      // NOTE: suggestedTransforms should be folded into suggestedCodeEdits eventually
      suggestedTransforms: [],
    },
    debugMode: false,
  };
};
