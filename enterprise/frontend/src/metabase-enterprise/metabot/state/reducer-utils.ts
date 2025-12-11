import type { PayloadAction } from "@reduxjs/toolkit";
import type { WritableDraft } from "immer";

import { uuid } from "metabase/lib/uuid";

import {
  type MetabotConversationId,
  type MetabotConverstationState,
  type MetabotFriendlyConversationId,
  type MetabotState,
  isMetabotChatDomainId,
} from "./types";

export type ConvoPayloadAction<Value extends Record<string, any>> =
  PayloadAction<{ conversation_id: MetabotFriendlyConversationId } & Value>;

// TODO: this should move into the selectors file probably
// Access an existing conversation in the state
export const getConversationId = (
  state: MetabotState,
  id: MetabotFriendlyConversationId,
): MetabotConversationId | undefined => {
  return isMetabotChatDomainId(id) ? state.domainConversationIds[id] : id;
};

export const getConversation = (
  state: MetabotState,
  id: MetabotFriendlyConversationId,
): MetabotConverstationState | undefined => {
  const convoId = getConversationId(state, id);
  return convoId ? state.conversations[convoId] : undefined;
};

// Create a unique id for a metabot conversations
export const createConversationId = (): MetabotConversationId => {
  return uuid() as MetabotConversationId;
};

// Create a new empty conversation
export const createConversation = (): MetabotConverstationState => ({
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

// Access an existing conversation if it exists, otherwise fallback to creating it
export const getOrCreateConversation = (
  state: WritableDraft<MetabotState>,
  id: MetabotFriendlyConversationId,
): WritableDraft<MetabotConverstationState> => {
  const convo = getConversation(state as MetabotState, id);
  if (convo) {
    return convo as WritableDraft<MetabotConverstationState>;
  }

  const newConvo = createConversation();
  Object.assign(state.conversations, { [newConvo.conversationId]: newConvo });
  if (isMetabotChatDomainId(id)) {
    state.domainConversationIds[id] = newConvo.conversationId;
  }

  return state.conversations[
    newConvo.conversationId
  ] as WritableDraft<MetabotConverstationState>;
};

export const convoReducer =
  <
    Action extends {
      payload: { conversation_id: MetabotFriendlyConversationId };
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
      getOrCreateConversation(state, action.payload.conversation_id),
      action,
      state,
    );
  };

export const getMetabotInitialState = (): MetabotState => {
  const omnibotConvo = createConversation();
  // TODO: remove this
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
