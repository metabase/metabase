import type { PayloadAction } from "@reduxjs/toolkit";
import type { WritableDraft } from "immer";

import { uuid } from "metabase/lib/uuid";

import {
  type MetabotConverstationState,
  type MetabotConvoId,
  type MetabotState,
  type MetabotUniqueConvoId,
  isMetabotChatDomainId,
} from "./types";

export type ConvoPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ conversation_id: MetabotConvoId } & Value>;

export const getUniqueConversationId = (
  state: WritableDraft<MetabotState>,
  id: MetabotConvoId,
): MetabotUniqueConvoId => {
  return isMetabotChatDomainId(id) ? state.domainConversationIds[id] : id;
};

export const getConversation = (
  state: WritableDraft<MetabotState>,
  id: MetabotConvoId,
): WritableDraft<MetabotConverstationState> | undefined => {
  return state.conversations[getUniqueConversationId(state, id)];
};

// Create a unique id for a metabot conversations
export const createConversationId = (): MetabotUniqueConvoId => {
  return uuid() as MetabotUniqueConvoId;
};

// Create a new empty conversation
const createConversation = (): MetabotConverstationState => ({
  isProcessing: false,
  conversationId: createConversationId(),
  messages: [],
  errorMessages: [],
  visible: false,
  history: [],
  state: {},
  activeToolCalls: [],
  experimental: {
    developerMessage: "",
    metabotReqIdOverride: undefined,
    profileOverride: undefined,
  },
});

export const getConversationOrThrow = (
  state: WritableDraft<MetabotState>,
  convoId: MetabotConvoId,
): WritableDraft<MetabotConverstationState> => {
  const conversationId = isMetabotChatDomainId(convoId)
    ? state.domainConversationIds[convoId]
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
      payload: { conversation_id: MetabotConvoId };
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
      getConversationOrThrow(state, action.payload.conversation_id),
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
    domainConversationIds: {
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
