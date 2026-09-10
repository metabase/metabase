import {
  type DefaultVizDecision,
  chooseDefaultViz,
  chooseDefaultVizTwoStage,
  constrainToAllowed,
  resolveLegacyDefault,
  switchToScalarIfOneByOne,
} from "../shared";
import type { VizDecision, VizInput } from "../types";

import { STAGE_INDEX } from "./constants";

interface ChosenViz {
  decision: DefaultVizDecision;
  trace: unknown;
}

function choose(
  input: VizInput,
  query: NonNullable<VizInput["query"]>,
): ChosenViz {
  const base = { query, stageIndex: STAGE_INDEX, resultCols: input.cols };
  if (input.rows) {
    const { stage1, stage2, final, timings } = chooseDefaultVizTwoStage({
      ...base,
      rows: input.rows,
    });
    return {
      decision: final,
      trace: {
        stage1: stage1.trace,
        stage2: stage2.trace,
        final: final.trace,
        timings,
      },
    };
  }
  const decision = chooseDefaultViz(base);
  return { decision, trace: decision.trace };
}

export function resolveDefaultVizV1(input: VizInput): VizDecision {
  if (input.query == null) {
    return resolveLegacyDefault(input);
  }
  try {
    const { decision, trace } = choose(input, input.query);
    const chosen: VizDecision = {
      display: decision.display,
      settings: decision.settings,
      trace,
    };
    const alternatives: VizDecision[] = decision.alternatives.map(
      (alternative) => ({
        display: alternative.display,
        settings: alternative.settings,
      }),
    );
    return constrainToAllowed(
      switchToScalarIfOneByOne(chosen, input),
      input,
      alternatives,
    );
  } catch {
    return resolveLegacyDefault(input);
  }
}
