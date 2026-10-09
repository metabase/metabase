import { useReducer } from "react";

import type { DatePickerValue } from "metabase/querying/common/types";

import { PROTOTYPE_RANGE_DAYS } from "./config";
import { defaultSpec } from "./defaults";
import type { AnalysisKind, AnalysisSpec, Grain } from "./spec/types";

export type AnalysisPanel = "setup" | "advanced";

export const DEFAULT_DATE_FILTER: DatePickerValue = {
  type: "relative",
  value: -PROTOTYPE_RANGE_DAYS,
  unit: "day",
};

export type AnalysisState = {
  spec: AnalysisSpec;
  dateFilter: DatePickerValue;
  panel: AnalysisPanel;
};

type AnalysisAction =
  | { type: "set-spec"; spec: AnalysisSpec }
  | { type: "set-date-filter"; dateFilter: DatePickerValue }
  | { type: "set-panel"; panel: AnalysisPanel }
  | { type: "set-grain"; grain: Grain };

const reducer = (
  state: AnalysisState,
  action: AnalysisAction,
): AnalysisState => {
  switch (action.type) {
    case "set-spec":
      return { ...state, spec: action.spec };
    case "set-date-filter":
      return { ...state, dateFilter: action.dateFilter };
    case "set-panel":
      return { ...state, panel: action.panel };
    case "set-grain":
      return { ...state, spec: { ...state.spec, grain: action.grain } };
  }
};

export const useAnalysisState = (kind: AnalysisKind) => {
  const [state, dispatch] = useReducer(reducer, {
    spec: defaultSpec(kind),
    dateFilter: DEFAULT_DATE_FILTER,
    panel: "setup",
  });

  return { state, dispatch };
};
