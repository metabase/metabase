import { createMockColumn } from "metabase-types/api/mocks";

import { getAnalysisConfig } from "../analyses/config";
import { createFlagAllocator } from "../events/allocate-flags";
import { createMockEventDefinition } from "../events/mocks";
import { computeSettings } from "../settings/compute";
import type { AnalysisSpec } from "../spec/types";

import { getClickedTransition } from "./clicked-transition";
import type { Insight } from "./types";
import type { FunnelInsightsState } from "./use-funnel-insights";

type SpecOpts = {
  view?: "steps" | "overTime" | "timeToConvert";
};

const getFunnelSpec = ({ view = "steps" }: SpecOpts = {}): AnalysisSpec => {
  const config = getAnalysisConfig("funnel");
  const computed = computeSettings(
    config.settings,
    { table: undefined, usersTable: undefined },
    {
      "funnel.steps": ["Viewed pricing", "Started trial", "Purchased"].map(
        (name) => createMockEventDefinition({ name }),
      ),
      "funnel.view": view,
    },
  );
  const result = config.toSpec(computed, createFlagAllocator());
  if (result.status !== "ready") {
    throw new Error("The funnel settings should be ready to run");
  }
  return result.spec;
};

const insightAt = (transition: number): Insight => ({
  transition,
  conditions: [{ attributeId: "os", value: "iOS" }],
  reached: 1000,
  converted: 140,
  rate: 0.14,
  restRate: 0.32,
  excess: -180,
  pValue: 0.001,
});

const doneState = (insights: Insight[]): FunnelInsightsState => ({
  status: "done",
  insights,
  attributes: [],
  transitions: [],
  isFindingPairs: false,
  pairsError: undefined,
});

const clickOn = (label: string) => ({
  dimensions: [{ column: createMockColumn({ name: "label" }), value: label }],
});

describe("getClickedTransition", () => {
  const state = doneState([insightAt(2)]);

  it("is the transition into the clicked step when it has insights", () => {
    expect(
      getClickedTransition(getFunnelSpec(), state, clickOn("3. Purchased")),
    ).toBe(2);
  });

  it("is undefined when the transition into the step has no insights", () => {
    expect(
      getClickedTransition(getFunnelSpec(), state, clickOn("2. Started trial")),
    ).toBeUndefined();
  });

  it("is undefined for the first step, which no transition enters", () => {
    const everyTransition = doneState([insightAt(1), insightAt(2)]);
    expect(
      getClickedTransition(
        getFunnelSpec(),
        everyTransition,
        clickOn("1. Viewed pricing"),
      ),
    ).toBeUndefined();
  });

  it("is undefined outside the step by step view", () => {
    expect(
      getClickedTransition(
        getFunnelSpec({ view: "timeToConvert" }),
        state,
        clickOn("3. Purchased"),
      ),
    ).toBeUndefined();
  });

  it("is undefined until insights are found", () => {
    expect(
      getClickedTransition(
        getFunnelSpec(),
        { status: "loading" },
        clickOn("3. Purchased"),
      ),
    ).toBeUndefined();
  });
});
