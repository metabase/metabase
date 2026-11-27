import type {
  CardId,
  GoalSourceResult,
  GoalSourceResults,
  MeasureId,
  RowValue,
} from "metabase-types/api";

import { createMockColumn } from "./dataset";

type MockGoalSourceResultOpts = {
  column?: string;
  value?: RowValue;
};

type MockFailedGoalSourceResultOpts = Pick<
  GoalSourceResult,
  "error" | "error_type"
>;

type MockGoalSourceRef =
  | { type?: "card"; id?: CardId }
  | { type: "measure"; id?: MeasureId };

type MockGoalSourceResultsOpts = MockGoalSourceResultOpts & MockGoalSourceRef;

type MockFailedGoalSourceResultsOpts = MockFailedGoalSourceResultOpts &
  MockGoalSourceRef;

type GoalSourceResultsOpts = {
  result: GoalSourceResult;
} & ({ type: "card"; id: CardId } | { type: "measure"; id: MeasureId });

export function createMockGoalSourceResults({
  column,
  id = 9,
  type = "card",
  value,
}: MockGoalSourceResultsOpts = {}): GoalSourceResults {
  return createGoalSourceResults({
    id,
    result: createMockGoalSourceResult({ column, value }),
    type,
  });
}

export function createMockFailedGoalSourceResults({
  error,
  error_type,
  id = 9,
  type = "card",
}: MockFailedGoalSourceResultsOpts = {}): GoalSourceResults {
  return createGoalSourceResults({
    id,
    result: createMockFailedGoalSourceResult({ error, error_type }),
    type,
  });
}

export function createMockGoalSourceResult({
  column = "goal",
  value = 250,
}: MockGoalSourceResultOpts = {}): GoalSourceResult {
  return {
    status: "completed",
    data: {
      cols: [createMockColumn({ name: column })],
      rows: [[value]],
    },
  };
}

export function createMockFailedGoalSourceResult({
  error,
  error_type,
}: MockFailedGoalSourceResultOpts = {}): GoalSourceResult {
  return {
    status: "failed",
    error,
    error_type,
  };
}

function createGoalSourceResults({
  id,
  result,
  type,
}: GoalSourceResultsOpts): GoalSourceResults {
  const results = { [id]: result };

  return type === "card" ? { card: results } : { measure: results };
}
