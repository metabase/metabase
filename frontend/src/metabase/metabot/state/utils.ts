import { nanoid } from "@reduxjs/toolkit";
import { match } from "ts-pattern";
import { t } from "ttag";

import type {
  MetabotAgentChainOfThoughtMessage,
  MetabotAgentTextChatMessage,
  MetabotGeneratedCardPart,
  MetabotIncompleteMessageStatus,
  MetabotIncompleteReason,
  MetabotMessage,
  MetabotMessagePart,
  MetabotUserTextChatMessage,
  SlashCommand,
} from "./types";

export const createMessageId = () => {
  return `msg_${nanoid()}`;
};

export const isChainOfThoughtMessage = (
  part: MetabotMessagePart,
): part is MetabotAgentChainOfThoughtMessage =>
  part.type === "chain_of_thought";

export const isTextPart = (
  part: MetabotMessagePart,
): part is MetabotUserTextChatMessage | MetabotAgentTextChatMessage =>
  part.type === "text";

export const isGeneratedCardPart = (
  part: MetabotMessagePart,
): part is MetabotGeneratedCardPart =>
  part.type === "data_part" &&
  part.part.type === "data-generated_entity" &&
  part.part.data.type === "card";

export const hasInProgressMessage = (messages: MetabotMessage[]): boolean =>
  messages.some((message) => message.status.type === "in_progress");

export const parseSlashCommand = (
  message: string,
): SlashCommand | undefined => {
  const { cmd, args } =
    message.match(/^\/(?<cmd>\w+)(?:\s(?<args>.+))?/)?.groups || {};

  if (!cmd) {
    return undefined;
  }

  return {
    cmd,
    args: args ? args.split(" ") : [],
  };
};

export const getIncompleteTurnReason = ({
  finishReason,
  contextWindowFull,
}: MetabotIncompleteMessageStatus): MetabotIncompleteReason =>
  match(finishReason)
    .with("tool-calls", () => "step-limit" as const)
    .with("length", () =>
      contextWindowFull
        ? ("context-window-full" as const)
        : ("max-length" as const),
    )
    .with("content-filter", () => "content-filter" as const)
    .with("other", () => "other" as const)
    .exhaustive();

export const getIncompleteTurnMessage = (
  reason: MetabotIncompleteReason,
  metabotName: string,
): string =>
  match(reason)
    .with(
      "step-limit",
      () =>
        t`${metabotName} paused after reaching its step limit for this response`,
    )
    .with(
      "max-length",
      () =>
        t`Response from ${metabotName} was cut off because it hit the maximum length`,
    )
    .with(
      "context-window-full",
      () =>
        t`This conversation has reached its maximum length and can't continue. Please start a new chat.`,
    )
    .with(
      "content-filter",
      () =>
        t`Response from ${metabotName} was stopped by a content filter. Try rephrasing your question.`,
    )
    .with(
      "other",
      () => t`Response from ${metabotName} stopped before it finished`,
    )
    .exhaustive();

export const getIncompleteTurnResumePrompt = (
  reason: MetabotIncompleteReason,
): string | undefined =>
  match(reason)
    .with("step-limit", () => t`Continue working on my last request.`)
    .with(
      "max-length",
      () =>
        t`Your last response was cut off. Pick up exactly where you left off. Don't repeat anything you already wrote.`,
    )
    .with("context-window-full", "content-filter", "other", () => undefined)
    .exhaustive();
