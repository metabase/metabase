import {
  DEFAULT_DISPLAY_BY_DIMENSION_TYPE,
  constrainToAllowed,
  hintDecision,
  resolveLegacyDefault,
  switchToScalarIfOneByOne,
} from "../shared";
import type { VizDecision, VizInput } from "../types";

export function resolveByDimensionType(input: VizInput): VizDecision {
  if (input.dimensionType == null) {
    return input.hint
      ? constrainToAllowed(
          switchToScalarIfOneByOne(hintDecision(input), input),
          input,
        )
      : resolveLegacyDefault(input);
  }
  const decision: VizDecision = {
    display: DEFAULT_DISPLAY_BY_DIMENSION_TYPE[input.dimensionType],
  };
  return constrainToAllowed(switchToScalarIfOneByOne(decision, input), input);
}
