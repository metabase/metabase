import type { QueryTransformSource } from "metabase-types/api";

import {
  type StepDraft,
  createStepDraft,
  draftToStep,
  getSourceWithSteps,
  getStepsError,
  stepToDraft,
} from "./utils";

const SOURCE_COLUMNS = ["ID", "BODY", "RATING"];

function createDraft(opts?: Partial<StepDraft>): StepDraft {
  return {
    ...createStepDraft("BODY"),
    question: "What is the complaint about?",
    answers: [
      { key: "shipping", description: "late or damaged delivery" },
      { key: "quality", description: "broke or defective" },
    ],
    column: "complaint",
    ...opts,
  };
}

describe("draftToStep / stepToDraft", () => {
  it("round-trips a choice step", () => {
    const step = draftToStep(createDraft());
    expect(step).toEqual({
      input: "BODY",
      question: "What is the complaint about?",
      kind: "choice",
      answers: {
        shipping: "late or damaged delivery",
        quality: "broke or defective",
      },
      "min-confidence": 0.6,
      output: { mode: "new-column", name: "complaint" },
    });
    expect(draftToStep(stepToDraft(step))).toEqual(step);
  });

  it("leaves answers and min-confidence off a noul step", () => {
    const step = draftToStep(createDraft({ kind: "noul", column: "anger" }));
    expect(step).not.toHaveProperty("answers");
    expect(step).not.toHaveProperty("min-confidence");
  });
});

describe("multiple input columns", () => {
  it("sends several columns as a list and one column as a string", () => {
    expect(
      draftToStep(createDraft({ inputs: ["BODY", "RATING"] })).input,
    ).toEqual(["BODY", "RATING"]);
    expect(draftToStep(createDraft()).input).toBe("BODY");
  });

  it("reads a saved list of columns", () => {
    const step = draftToStep(createDraft({ inputs: ["BODY", "RATING"] }));
    expect(stepToDraft(step).inputs).toEqual(["BODY", "RATING"]);
  });
});

describe("getSourceWithSteps", () => {
  const source: QueryTransformSource = {
    type: "query",
    query: { database: 1, type: "native", native: { query: "select 1" } },
  };

  it("adds steps to the source", () => {
    const step = draftToStep(createDraft());
    expect(getSourceWithSteps(source, [step])["jev-classify"]).toEqual([step]);
  });

  it("removes the key when there are no steps", () => {
    const withSteps = getSourceWithSteps(source, [draftToStep(createDraft())]);
    expect(getSourceWithSteps(withSteps, [])).not.toHaveProperty(
      "jev-classify",
    );
  });
});

describe("getStepsError", () => {
  it("accepts a valid step", () => {
    expect(getStepsError([createDraft()], SOURCE_COLUMNS)).toBeNull();
  });

  it.each<[string, Partial<StepDraft>]>([
    ["Pick the columns", { inputs: [] }],
    ["Write the question", { question: " " }],
    ["Name the output column", { column: "" }],
    ["already has a column", { column: "BODY" }],
    ["has no column", { mode: "overwrite", column: "missing" }],
    ["at least two answers", { answers: [{ key: "a", description: "" }] }],
    [
      "unique",
      {
        answers: [
          { key: "a", description: "" },
          { key: "a", description: "" },
        ],
      },
    ],
  ])("reports %s", (message, opts) => {
    expect(getStepsError([createDraft(opts)], SOURCE_COLUMNS)).toMatch(message);
  });

  it("does not require answers for a noul step", () => {
    expect(
      getStepsError(
        [createDraft({ kind: "noul", answers: [] })],
        SOURCE_COLUMNS,
      ),
    ).toBeNull();
  });

  it("reports two steps writing the same column", () => {
    expect(
      getStepsError([createDraft(), createDraft()], SOURCE_COLUMNS),
    ).toMatch("same output column");
  });
});
