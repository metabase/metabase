import type { PayloadAction } from "@reduxjs/toolkit";
import { merge } from "icepick";
import type { WritableDraft } from "immer";
import { match } from "ts-pattern";

import {
  METABOT_PROFILE_OVERRIDES,
  getToolMessage,
} from "metabase/metabot/constants";
import { uuid } from "metabase/utils/uuid";

import {
  type MetabotAgentChainOfThoughtMessage,
  type MetabotAgentId,
  type MetabotAgentState,
  type MetabotConversationState,
  type MetabotDebugToolCallMessage,
  type MetabotMessage,
  type MetabotMessagePart,
  type MetabotSearchResults,
  type MetabotState,
  fixedMetabotAgentIds,
} from "./types";
import { createMessageId } from "./utils";

export type ConvoPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ conversationId: string } & Value>;

export type AgentPayloadAction<
  Value extends Record<string, any> = Record<string, any>,
> = PayloadAction<{ agentId: MetabotAgentId } & Value>;

const isOpenAgentMessage = (
  message?: MetabotMessage,
): message is MetabotMessage =>
  message?.role === "agent" &&
  (message.status.type === "streaming" ||
    message.status.type === "in_progress");

export const openAgentMessage = (
  convo: WritableDraft<MetabotConversationState>,
): WritableDraft<MetabotMessage> => {
  const message = convo.messages.at(-1);
  if (!isOpenAgentMessage(message)) {
    throw new Error("Metabot conversation has no open agent message");
  }
  return message;
};

export const startUserMessage = (
  convo: WritableDraft<MetabotConversationState>,
  { id, externalId }: { id: string; externalId?: string },
) => {
  // push literal and access to prevent TS2589 / immer excessively deep type
  convo.messages.push({
    id,
    role: "user",
    externalId,
    parts: [],
    status: { type: "done" },
  });
  return convo.messages[convo.messages.length - 1];
};

export const startAgentMessage = (
  convo: WritableDraft<MetabotConversationState>,
  externalId?: string,
) => {
  convo.messages.push({
    id: createMessageId(),
    role: "agent",
    externalId,
    parts: [],
    status: { type: "streaming" },
  });
};

export const findLastToolCallPart = (
  convo: WritableDraft<MetabotConversationState>,
  toolCallId: string,
) =>
  openAgentMessage(convo).parts.findLast(
    (p): p is WritableDraft<MetabotDebugToolCallMessage> =>
      p.type === "tool_call" && p.id === toolCallId,
  );

export const pushNewToolCall = (
  convo: WritableDraft<MetabotConversationState>,
  {
    toolCallId,
    toolName,
    args,
  }: { toolCallId: string; toolName: string; args?: string },
) => {
  openAgentMessage(convo).parts.push({
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
    message: getToolMessage(toolName)?.active(),
    status: "started",
  });
};

const isOpenChain = (
  part: WritableDraft<MetabotMessagePart>,
): part is WritableDraft<MetabotAgentChainOfThoughtMessage> =>
  part.type === "chain_of_thought" && !part.finished;

const activeChain = (convo: WritableDraft<MetabotConversationState>) =>
  openAgentMessage(convo).parts.findLast(isOpenChain);

const stampChainSpan = (
  chain: WritableDraft<MetabotAgentChainOfThoughtMessage>,
  nowMs?: number,
) => {
  if (nowMs == null) {
    return;
  }
  chain.startedAtMs ??= nowMs;
  chain.endedAtMs = nowMs;
};

export const ensureChain = (
  convo: WritableDraft<MetabotConversationState>,
  nowMs?: number,
): WritableDraft<MetabotAgentChainOfThoughtMessage> => {
  const existing = activeChain(convo);
  if (existing) {
    stampChainSpan(existing, nowMs);
    return existing;
  }
  const chain: WritableDraft<MetabotAgentChainOfThoughtMessage> = {
    id: createMessageId(),
    role: "agent",
    type: "chain_of_thought",
    steps: [],
    finished: false,
    startedAtMs: nowMs,
    endedAtMs: nowMs,
  };
  openAgentMessage(convo).parts.push(chain);
  return chain;
};

const dropChain = (
  convo: WritableDraft<MetabotConversationState>,
  id: string,
) => {
  const message = openAgentMessage(convo);
  message.parts = message.parts.filter((p) => p.id !== id);
};

export const startChainReasoning = (
  convo: WritableDraft<MetabotConversationState>,
  nowMs?: number,
) => {
  ensureChain(convo, nowMs).steps.push({
    kind: "reasoning",
    text: "",
    startedAtMs: nowMs,
  });
};

export const appendChainReasoning = (
  convo: WritableDraft<MetabotConversationState>,
  text: string,
  nowMs?: number,
) => {
  const chain = ensureChain(convo, nowMs);
  const last = chain.steps.at(-1);
  if (last?.kind === "reasoning") {
    last.text += text;
  } else {
    chain.steps.push({ kind: "reasoning", text, startedAtMs: nowMs });
  }
};

export const addChainTool = (
  convo: WritableDraft<MetabotConversationState>,
  {
    id,
    name,
    title,
    nowMs,
  }: { id: string; name: string; title?: string; nowMs?: number },
) => {
  const existing = findChainToolStep(convo, id);
  if (!existing) {
    ensureChain(convo, nowMs).steps.push({
      kind: "tool",
      id,
      name,
      title,
      status: "started",
      startedAtMs: nowMs,
    });
    return;
  }
  if (title) {
    existing.step.title = title;
  }
  if (!existing.chain.finished) {
    stampChainSpan(existing.chain, nowMs);
  }
};

export const findChainToolStep = (
  convo: WritableDraft<MetabotConversationState>,
  toolCallId: string,
) => {
  for (const part of openAgentMessage(convo).parts) {
    if (part.type === "chain_of_thought") {
      const step = part.steps.find(
        (s) => s.kind === "tool" && s.id === toolCallId,
      );
      if (step?.kind === "tool") {
        return { chain: part, step };
      }
    }
  }
  return undefined;
};

export const setChainToolSearchResults = (
  convo: WritableDraft<MetabotConversationState>,
  toolCallId: string,
  searchResults: MetabotSearchResults,
) => {
  const found = findChainToolStep(convo, toolCallId);
  if (found) {
    found.step.searchResults = searchResults;
  }
};

export const setChainToolTitle = (
  convo: WritableDraft<MetabotConversationState>,
  toolCallId: string,
  title: string,
) => {
  const found = findChainToolStep(convo, toolCallId);
  if (found) {
    found.step.title = title;
  }
};

export const endChainTool = (
  convo: WritableDraft<MetabotConversationState>,
  id: string,
  nowMs?: number,
) => {
  const found = findChainToolStep(convo, id);
  if (!found) {
    return;
  }
  found.step.status = "ended";
  if (!found.chain.finished && nowMs != null) {
    found.chain.endedAtMs = nowMs;
  }
};

export const closeChain = (
  convo: WritableDraft<MetabotConversationState>,
  nowMs?: number,
) => {
  const chain = activeChain(convo);
  if (chain && chain.steps.length === 0) {
    dropChain(convo, chain.id);
  } else if (chain) {
    chain.finished = true;
    if (nowMs != null) {
      chain.endedAtMs = nowMs;
    }
  }
};

export const getRequestConversation = (
  state: WritableDraft<MetabotState>,
  action: { meta: { arg: { conversation_id: string; loadId: number } } },
) => {
  const { conversation_id, loadId } = action.meta.arg;
  const convo = state.conversations[conversation_id];

  if (!convo) {
    console.warn(`Unable to find metabot conversation ${conversation_id}`);
    return undefined;
  }

  if (convo.loadId !== loadId) {
    return undefined;
  }

  return convo;
};

const conversationDefaultsByAgentId: Partial<
  Record<MetabotAgentId, Partial<MetabotConversationState>>
> = {
  sql: {
    profileOverride: METABOT_PROFILE_OVERRIDES.SQL,
  },
  ask: {
    profileOverride: METABOT_PROFILE_OVERRIDES.NLQ,
  },
};

export const createConversation = (
  overrides?: Partial<MetabotConversationState>,
): MetabotConversationState => ({
  isProcessing: false,
  hasMessagedInSession: false,
  title: undefined,
  messages: [],
  state: {},
  activeToolCalls: [],
  loadId: 0,
  profileOverride: undefined,
  forkedFromConversationId: undefined,
  ...overrides,
  conversationId: overrides?.conversationId ?? uuid(),
  experimental: {
    developerMessage: "",
    metabotReqIdOverride: undefined,
    ...overrides?.experimental,
  },
});

export const createConversationForAgent = (
  agentId: MetabotAgentId,
  overrides?: Partial<MetabotConversationState>,
): MetabotConversationState =>
  createConversation(
    merge(conversationDefaultsByAgentId[agentId] ?? {}, overrides ?? {}),
  );

export const createAgentState = (
  conversationId: string,
  overrides?: Partial<MetabotAgentState>,
): MetabotAgentState => ({
  visible: false,
  ...overrides,
  conversationId,
});

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

export const resetReactionStateForConversation = (
  state: WritableDraft<MetabotState>,
  conversationId: string,
) =>
  fixedMetabotAgentIds.forEach((agentId) => {
    if (state.agents[agentId]?.conversationId === conversationId) {
      resetReactionState(state, agentId);
    }
  });

const isConversationReferenced = (
  state: WritableDraft<MetabotState>,
  conversationId: string,
) =>
  Object.values(state.agents).some(
    (agent) => agent?.conversationId === conversationId,
  );

export const evictConversationIfUnused = (
  state: WritableDraft<MetabotState>,
  conversationId: string,
) => {
  const convo = state.conversations[conversationId];
  if (
    convo &&
    !convo.hasMessagedInSession &&
    !isConversationReferenced(state, conversationId)
  ) {
    delete state.conversations[conversationId];
  }
};

export const getAgentOrThrow = (
  state: WritableDraft<MetabotState>,
  agentId: MetabotAgentId,
): WritableDraft<MetabotAgentState> => {
  const agent = state.agents[agentId];
  if (!agent) {
    throw new Error(`Could not find metabot agent: ${agentId}`);
  }
  return agent;
};

export const getConversationOrThrow = (
  state: WritableDraft<MetabotState>,
  conversationId: string,
): WritableDraft<MetabotConversationState> => {
  const convo = state.conversations[conversationId];
  if (!convo) {
    throw new Error(`Could not find metabot conversation: ${conversationId}`);
  }
  return convo;
};

export const convoReducer =
  <
    Action extends {
      payload: { conversationId: string };
    },
  >(
    convoReducerFn: (
      convo: WritableDraft<MetabotConversationState>,
      action: Action,
      state: WritableDraft<MetabotState>,
    ) => void,
  ) =>
  (state: WritableDraft<MetabotState>, action: Action) => {
    convoReducerFn(
      getConversationOrThrow(state, action.payload.conversationId),
      action,
      state,
    );
  };

export const agentReducer =
  <
    Action extends {
      payload: { agentId: MetabotAgentId };
    },
  >(
    agentReducerFn: (
      agent: WritableDraft<MetabotAgentState>,
      action: Action,
      state: WritableDraft<MetabotState>,
    ) => void,
  ) =>
  (state: WritableDraft<MetabotState>, action: Action) => {
    agentReducerFn(
      getAgentOrThrow(state, action.payload.agentId),
      action,
      state,
    );
  };

export const getMetabotInitialState = (): MetabotState => {
  const conversations: MetabotState["conversations"] = {};
  const agents: MetabotState["agents"] = {};

  fixedMetabotAgentIds.forEach((agentId) => {
    const convo = createConversationForAgent(agentId);
    conversations[convo.conversationId] = convo;
    agents[agentId] = createAgentState(convo.conversationId);
  });

  return {
    conversations,
    agents,
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
