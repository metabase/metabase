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
  MetabotAgentChainOfThoughtMessage,
  MetabotAgentId,
  MetabotAgentTurnDisplayError,
  MetabotAgentTurnError,
  MetabotConverstationState,
  MetabotDebugToolCallMessage,
  MetabotSearchResults,
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

const ensureChain = (
  convo: WritableDraft<MetabotConverstationState>,
  nowMs?: number,
): WritableDraft<MetabotAgentChainOfThoughtMessage> => {
  const existing = convo.activeChainId
    ? convo.messages.find((m) => m.id === convo.activeChainId)
    : undefined;
  if (existing?.type === "chain_of_thought") {
    // the shell is created at turn start; the first real step stamps the clock
    if (existing.startedAtMs == null && nowMs != null) {
      existing.startedAtMs = nowMs;
    }
    // every step advances the end time, so the "Thought for Ns" duration lives
    // entirely in redux and survives navigating away and back (no local clock)
    if (nowMs != null) {
      existing.endedAtMs = nowMs;
    }
    return existing;
  }
  convo.messages.push({
    id: createMessageId(),
    role: "agent",
    type: "chain_of_thought",
    steps: [],
    startedAtMs: nowMs,
    endedAtMs: nowMs,
  });
  const chain = convo.messages[convo.messages.length - 1];
  if (chain.type !== "chain_of_thought") {
    throw new Error("just-pushed chain message is not a chain");
  }
  convo.activeChainId = chain.id;
  return chain;
};

// Open an empty chain at turn start so the "Thinking…" indicator shows
// immediately instead of a separate loader; the first step stamps the clock.
export const openChain = (convo: WritableDraft<MetabotConverstationState>) => {
  ensureChain(convo);
};

const dropChain = (
  convo: WritableDraft<MetabotConverstationState>,
  id: string,
) => {
  convo.messages = convo.messages.filter((m) => m.id !== id);
};

// A new reasoning block always starts its own step, so tool calls between blocks
// keep the timeline chronological.
export const startChainReasoning = (
  convo: WritableDraft<MetabotConverstationState>,
  nowMs?: number,
) => {
  ensureChain(convo, nowMs).steps.push({ kind: "reasoning", text: "" });
};

export const appendChainReasoning = (
  convo: WritableDraft<MetabotConverstationState>,
  text: string,
  nowMs?: number,
) => {
  const chain = ensureChain(convo, nowMs);
  const last = chain.steps.at(-1);
  if (last?.kind === "reasoning") {
    last.text += text;
  } else {
    chain.steps.push({ kind: "reasoning", text });
  }
};

export const addChainTool = (
  convo: WritableDraft<MetabotConverstationState>,
  {
    id,
    name,
    title,
    nowMs,
  }: { id: string; name: string; title?: string; nowMs?: number },
) => {
  const chain = ensureChain(convo, nowMs);
  const existing = chain.steps.find((s) => s.kind === "tool" && s.id === id);
  if (!existing) {
    chain.steps.push({ kind: "tool", id, name, title, status: "started" });
  } else if (title && existing.kind === "tool") {
    // tool-input-start may arrive without a title; tool-input-available fills it in
    existing.title = title;
  }
};

export const setChainToolSearchResults = (
  convo: WritableDraft<MetabotConverstationState>,
  toolCallId: string,
  searchResults: MetabotSearchResults,
) => {
  for (const message of convo.messages) {
    if (message.type === "chain_of_thought") {
      for (const step of message.steps) {
        if (step.kind === "tool" && step.id === toolCallId) {
          step.searchResults = searchResults;
          return;
        }
      }
    }
  }
};

export const endChainTool = (
  convo: WritableDraft<MetabotConverstationState>,
  id: string,
) => {
  const chain = convo.activeChainId
    ? convo.messages.find((m) => m.id === convo.activeChainId)
    : undefined;
  if (chain?.type === "chain_of_thought") {
    for (const step of chain.steps) {
      if (step.kind === "tool" && step.id === id) {
        step.status = "ended";
      }
    }
  }
};

// End the current chain so later reasoning/tools start a fresh one after the
// answer text (keeps chains chronological with interleaved answer segments). A
// chain that never gathered a step (e.g. a plain text answer) is dropped rather
// than persisted as an empty "Thinking…" row.
export const closeChain = (
  convo: WritableDraft<MetabotConverstationState>,
  nowMs?: number,
) => {
  const chain = convo.activeChainId
    ? convo.messages.find((m) => m.id === convo.activeChainId)
    : undefined;
  if (chain?.type === "chain_of_thought") {
    if (chain.steps.length === 0) {
      dropChain(convo, chain.id);
    } else if (nowMs != null) {
      // refine to the moment the answer begins; falls back to the last step's
      // stamp (from ensureChain) when the answer arrives without a clock
      chain.endedAtMs = nowMs;
    }
  }
  convo.activeChainId = undefined;
};

// Turn teardown: drop an empty chain left open (e.g. an aborted turn that never
// produced reasoning), and release the active id.
export const finalizeChain = (
  convo: WritableDraft<MetabotConverstationState>,
) => {
  const chain = convo.activeChainId
    ? convo.messages.find((m) => m.id === convo.activeChainId)
    : undefined;
  if (chain?.type === "chain_of_thought" && chain.steps.length === 0) {
    dropChain(convo, chain.id);
  }
  convo.activeChainId = undefined;
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
    activeChainId: undefined,
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
    savedChartCardIds: {},
  };
};
