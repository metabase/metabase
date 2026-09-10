import {
  constrainToAllowed,
  hintDecision,
  resolveLegacyDefault,
} from "../shared";
import type { VizDecision, VizInput } from "../types";

export function resolveLensHint(input: VizInput): VizDecision {
  if (input.hint == null) {
    return resolveLegacyDefault(input);
  }
  return constrainToAllowed(hintDecision(input), input);
}
