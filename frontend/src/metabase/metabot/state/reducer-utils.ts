import { type PayloadAction, nanoid } from "@reduxjs/toolkit";
import { merge } from "icepick";
import type { WritableDraft } from "immer";
import { match } from "ts-pattern";

import {
  METABOT_PROFILE_OVERRIDES,
  TOOL_CALL_MESSAGES,
} from "metabase/metabot/constants";
import { uuid } from "metabase/utils/uuid";

import type {
  MetabotAgentId,
  MetabotAgentTurnDisplayError,
  MetabotAgentTurnError,
  MetabotConverstationState,
  MetabotDebugToolCallMessage,
  MetabotState,
} from "./types";
import { createMessageId } from "./utils";

export type ConvoPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ agentId: MetabotAgentId } & Value>;

export const findLastToolCallMessage = (
  convo: WritableDraft<MetabotConverstationState>,
  toolCallId: string,
) =>
  convo.messages.findLast(
    (m): m is MetabotDebugToolCallMessage =>
      m.type === "tool_call" && m.id === toolCallId,
  );

export const pushNewToolCall = (
  convo: WritableDraft<MetabotConverstationState>,
  {
    toolCallId,
    toolName,
    args,
  }: { toolCallId: string; toolName: string; args?: string },
) => {
  convo.messages.push({
    id: toolCallId,
    role: "agent",
    type: "tool_call",
    name: toolName,
    args,
    status: "started",
  });
  convo.activeToolCalls.push({
    id: toolCallId,
    name: toolName,
    message: TOOL_CALL_MESSAGES[toolName],
    status: "started",
  });
};

export const getRequestConversation = (
  state: WritableDraft<MetabotState>,
  action: {
    meta: {
      arg: { agentId: MetabotAgentId; conversation_id: string; loadId: string };
    };
  },
) => {
  const { agentId, conversation_id, loadId } = action.meta.arg;
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

  if (loadId !== convo.loadId) {
    console.warn(
      `Metabot conversation ${conversation_id} was reloaded since the request started, ignoring its result`,
    );
    return undefined;
  }

  return convo;
};

const agentOverridesByAgentId: Partial<
  Record<MetabotAgentId, Partial<MetabotConverstationState>>
> = {
  sql: {
    profileOverride: METABOT_PROFILE_OVERRIDES.SQL,
  },
  ask: {
    profileOverride: METABOT_PROFILE_OVERRIDES.NLQ,
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
    title: undefined,
    messages: [],
    visible: false,
    state: {},
    activeToolCalls: [],
    profileOverride: undefined,
    pendingMessageExternalId: undefined,
    ...overrides,
    conversationId: overrides?.conversationId ?? uuid(),
    loadId: overrides?.loadId ?? nanoid(),
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

export const appendAgentTurnAborted = (
  convo: WritableDraft<MetabotConverstationState>,
) => {
  convo.messages.push({
    id: createMessageId(),
    role: "agent",
    type: "turn_aborted",
    externalId: convo.pendingMessageExternalId,
  });
};

export const appendAgentTurnErrored = (
  convo: WritableDraft<MetabotConverstationState>,
  error: MetabotAgentTurnError,
  display?: MetabotAgentTurnDisplayError,
) => {
  convo.messages.push({
    id: createMessageId(),
    role: "agent",
    type: "turn_errored",
    error,
    display,
    externalId: convo.pendingMessageExternalId,
  });
};

export const getMetabotInitialState = (): MetabotState => {
  return {
    conversations: {
      omnibot: createConversation("omnibot"),
      sql: createConversation("sql"),
      ask: createConversation("ask"),
    },
    reactions: {
      navigateToPath: null,
      suggestedCodeEdits: {},
      // NOTE: suggestedTransforms should be folded into suggestedCodeEdits eventually
      suggestedTransforms: [],
    },
    titlePollingConversationIds: [],
    debugMode: false,
  };
};
