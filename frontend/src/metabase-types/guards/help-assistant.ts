import type {
  HelpAssistantStep,
  HelpAssistantStreamEvent,
} from "metabase-types/api";

import { isObject } from "./common";

const STEP_TYPES: ReadonlySet<unknown> = new Set<HelpAssistantStep["type"]>([
  "skill",
  "search",
  "read",
  "check",
  "limit",
]);

const isHelpAssistantStep = (value: unknown): value is HelpAssistantStep =>
  isObject(value) &&
  STEP_TYPES.has(value.type) &&
  typeof value.label === "string";

/** Checks an event parsed from the Help assistant's chat stream. */
export const isHelpAssistantStreamEvent = (
  value: unknown,
): value is HelpAssistantStreamEvent => {
  if (!isObject(value)) {
    return false;
  }
  switch (value.type) {
    case "step":
      return isHelpAssistantStep(value.step);
    case "answer":
      return (
        typeof value.reply === "string" &&
        Array.isArray(value.sources) &&
        Array.isArray(value.steps) &&
        value.steps.every(isHelpAssistantStep)
      );
    case "error":
      return (
        typeof value.message === "string" &&
        typeof value.status_code === "number"
      );
    default:
      return false;
  }
};
