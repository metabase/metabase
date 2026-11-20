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

export const createMockGoalSourceResults = ({
  column,
  id = 9,
  type = "card",
  value,
}: MockGoalSourceResultsOpts = {}): GoalSourceResults =>
  createGoalSourceResults({
    id,
    result: createMockGoalSourceResult({ column, value }),
    type,
  });

export const createMockFailedGoalSourceResults = ({
  error,
  error_type,
  id = 9,
  type = "card",
}: MockFailedGoalSourceResultsOpts = {}): GoalSourceResults =>
  createGoalSourceResults({
    id,
    result: createMockFailedGoalSourceResult({ error, error_type }),
    type,
  });

export const createMockGoalSourceResult = ({
  column = "goal",
  value = 250,
}: MockGoalSourceResultOpts = {}): GoalSourceResult => ({
  status: "completed",
  data: {
    cols: [createMockColumn({ name: column })],
    rows: [[value]],
  },
});

export const createMockFailedGoalSourceResult = ({
  error,
  error_type,
}: MockFailedGoalSourceResultOpts = {}): GoalSourceResult => ({
  status: "failed",
  error,
  error_type,
});

function createGoalSourceResults({
  id,
  result,
  type,
}: GoalSourceResultsOpts): GoalSourceResults {
  const results = { [id]: result };

  return type === "card" ? { card: results } : { measure: results };
}
