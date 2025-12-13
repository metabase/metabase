import type { PayloadAction } from "@reduxjs/toolkit";
import type { WritableDraft } from "immer";

import { uuid } from "metabase/lib/uuid";

import type {
  MetabotConverstationState,
  MetabotConvoId,
  MetabotState,
} from "./types";

export type ConvoPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ convoId: MetabotConvoId } & Value>;

export const getRequestConversation = (
  state: WritableDraft<MetabotState>,
  action: { meta: { arg: { conversation_id: string } } },
) => {
  const convoId = action.meta.arg.conversation_id as unknown as MetabotConvoId;
  return state.conversations[convoId];
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
  conversationId: overrides?.conversationId ?? uuid(),
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
  const convo = state.conversations[convoId];
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
  return {
    conversations: {
      omnibot: createConversation(),
      inline_sql: createConversation(),
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
