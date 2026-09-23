import { t } from "ttag";
import _ from "underscore";

import type {
  JevClassifyKind,
  JevClassifyOutputMode,
  JevClassifyStep,
  QueryTransformSource,
} from "metabase-types/api";

export type AnswerDraft = {
  key: string;
  description: string;
};

export type StepDraft = {
  id: string;
  inputs: string[];
  question: string;
  kind: JevClassifyKind;
  answers: AnswerDraft[];
  mode: JevClassifyOutputMode;
  column: string;
  minConfidence: number | null;
};

export const DEFAULT_MIN_CONFIDENCE = 0.6;

export const CONFIDENCE_COLUMN_SUFFIX = "_confidence";

export function createStepDraft(input?: string): StepDraft {
  return {
    id: _.uniqueId("jev-step-"),
    inputs: input != null ? [input] : [],
    question: "",
    kind: "choice",
    answers: [
      { key: "", description: "" },
      { key: "", description: "" },
    ],
    mode: "new-column",
    column: "",
    minConfidence: DEFAULT_MIN_CONFIDENCE,
  };
}

export function stepToDraft(step: JevClassifyStep): StepDraft {
  return {
    id: _.uniqueId("jev-step-"),
    inputs: Array.isArray(step.input) ? step.input : [step.input],
    question: step.question,
    kind: step.kind ?? "choice",
    answers: Object.entries(step.answers ?? {}).map(([key, description]) => ({
      key,
      description,
    })),
    mode: step.output.mode,
    column: step.output.name,
    minConfidence: step["min-confidence"] ?? null,
  };
}

export function draftToStep(draft: StepDraft): JevClassifyStep {
  const isChoice = draft.kind === "choice";
  return {
    input: getStepInput(draft.inputs),
    question: draft.question.trim(),
    kind: draft.kind,
    ...(isChoice && {
      answers: Object.fromEntries(
        draft.answers.map(({ key, description }) => [
          key.trim(),
          description.trim(),
        ]),
      ),
      "min-confidence": draft.minConfidence,
    }),
    output: { mode: draft.mode, name: draft.column.trim() },
  };
}

// A single column stays a string, matching what older saved steps look like.
function getStepInput(inputs: string[]): string | string[] {
  const [firstInput] = inputs;
  return inputs.length === 1 && firstInput != null ? firstInput : inputs;
}

export function getStepDrafts(source: QueryTransformSource): StepDraft[] {
  return (source["jev-classify"] ?? []).map(stepToDraft);
}

export function getSourceWithSteps(
  source: QueryTransformSource,
  steps: JevClassifyStep[],
): QueryTransformSource {
  const sourceWithoutSteps = _.omit(source, "jev-classify");
  return steps.length > 0
    ? { ...sourceWithoutSteps, "jev-classify": steps }
    : sourceWithoutSteps;
}

/** Columns a step adds to the target table, in the order the backend writes them. */
export function getOutputColumnNames(draft: StepDraft): string[] {
  if (draft.mode !== "new-column") {
    return [];
  }
  return draft.kind === "choice"
    ? [draft.column, `${draft.column}${CONFIDENCE_COLUMN_SUFFIX}`]
    : [draft.column];
}

export function getStepError(
  draft: StepDraft,
  sourceColumnNames: readonly string[],
): string | null {
  if (draft.inputs.length === 0) {
    return t`Pick the columns Jev should read.`;
  }
  if (draft.question.trim() === "") {
    return t`Write the question Jev should answer.`;
  }
  const column = draft.column.trim();
  if (column === "") {
    return t`Name the output column.`;
  }
  if (draft.mode === "new-column" && sourceColumnNames.includes(column)) {
    return t`The source already has a column named ${column}.`;
  }
  if (draft.mode !== "new-column" && !sourceColumnNames.includes(column)) {
    return t`The source has no column named ${column}.`;
  }
  if (draft.kind === "choice") {
    const keys = draft.answers.map(({ key }) => key.trim());
    if (keys.filter((key) => key !== "").length < 2) {
      return t`Add at least two answers.`;
    }
    if (keys.includes("")) {
      return t`Every answer needs a value.`;
    }
    if (new Set(keys).size !== keys.length) {
      return t`Answers must be unique.`;
    }
  }
  return null;
}

export function getStepsError(
  drafts: readonly StepDraft[],
  sourceColumnNames: readonly string[],
): string | null {
  for (const draft of drafts) {
    const error = getStepError(draft, sourceColumnNames);
    if (error != null) {
      return error;
    }
  }
  const outputNames = drafts.flatMap(getOutputColumnNames);
  if (new Set(outputNames).size !== outputNames.length) {
    return t`Two steps write the same output column.`;
  }
  return null;
}
