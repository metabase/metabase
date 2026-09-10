// Rules every heuristic must satisfy. Returns human-readable violations; the
// contract unit test expects [] for every registered heuristic × every fixture
// input.
import { isAllowedDisplay, isOneByOne } from "./shared";
import type { VizDecision, VizHeuristic, VizInput } from "./types";

/** Heuristics that return an explicit hint verbatim, even for a 1×1 result. */
const HINT_VERBATIM_HEURISTIC_IDS: readonly string[] = ["lens-hint"];

export function getContractViolations(
  heuristic: VizHeuristic,
  inputs: readonly VizInput[],
): string[] {
  const violations: string[] = [];
  const fail = (message: string) =>
    violations.push(`[${heuristic.id}] ${message}`);

  inputs.forEach((input, index) => {
    const where = `input ${index} (${input.context})`;
    const decision = tryResolve(heuristic, input, (error) =>
      fail(`${where}: threw ${error}`),
    );
    if (!decision) {
      return;
    }
    checkDecision(decision, input, heuristic, where, fail);

    const again = tryResolve(heuristic, input, (error) =>
      fail(`${where}: threw on second call ${error}`),
    );
    if (again && decisionKey(decision) !== decisionKey(again)) {
      fail(`${where}: not deterministic`);
    }
  });

  return violations;
}

function tryResolve(
  heuristic: VizHeuristic,
  input: VizInput,
  onError: (error: unknown) => void,
): VizDecision | null {
  try {
    return heuristic.resolve(input);
  } catch (error) {
    onError(error);
    return null;
  }
}

function checkDecision(
  decision: VizDecision,
  input: VizInput,
  heuristic: VizHeuristic,
  where: string,
  fail: (message: string) => void,
) {
  if (typeof decision.display !== "string" || decision.display.length === 0) {
    fail(`${where}: no display`);
    return;
  }
  const { allowed, hint } = input;
  if (
    allowed != null &&
    allowed.length > 0 &&
    !isAllowedDisplay(decision.display, allowed)
  ) {
    fail(`${where}: display ${decision.display} not in allowed`);
  }
  const honorsHintVerbatim =
    hint != null && HINT_VERBATIM_HEURISTIC_IDS.includes(heuristic.id);
  if (
    isOneByOne(input) &&
    allowed == null &&
    !honorsHintVerbatim &&
    decision.display !== "scalar"
  ) {
    fail(`${where}: 1×1 result resolved to ${decision.display}, not scalar`);
  }
}

/** Trace is excluded: it may carry timings. */
function decisionKey({ display, settings }: VizDecision): string {
  return JSON.stringify({ display, settings: settings ?? null });
}
