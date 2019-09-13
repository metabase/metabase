import { getQuestionSteps } from "metabase/query_builder/components/notebook/lib/steps";
import { SAMPLE_DATASET, ORDERS } from "__support__/sample_dataset_fixture";

describe("getQuestionSteps", () => {
  it("should return data step with no actions for new query", () => {
    const steps = getQuestionSteps(SAMPLE_DATASET.question());
    expect(steps.length).toBe(1);
    expect(steps.map(s => s.type)).toEqual(["data"]);
    expect(steps.map(s => s.actions.map(a => a.type))).toEqual([[]]);
  });
  it("should return data step with actions for query with data selected", () => {
    const steps = getQuestionSteps(ORDERS.question());
    expect(steps.length).toBe(1);
    expect(steps.map(s => s.type)).toEqual(["data"]);
    expect(steps.map(s => s.actions.map(a => a.type))).toEqual([
      ["join", "expression", "filter", "summarize", "sort", "limit"],
    ]);
  });
});
