import type { CardId } from "./card";

// SmartScalar (Trend Chart)
export type SmartScalarComparisonType =
  | "anotherColumn"
  | "previousValue"
  | "previousPeriod"
  | "periodsAgo"
  | "staticNumber";

interface BaseSmartScalarComparison {
  id: string; // client-side generated, used for sorting
  type: SmartScalarComparisonType;
}

export interface SmartScalarComparisonAnotherColumn extends BaseSmartScalarComparison {
  type: "anotherColumn";
  column: string;
  label: string;
}

export interface SmartScalarComparisonPeriodsAgo extends BaseSmartScalarComparison {
  type: "periodsAgo";
  value: number;
}

export interface SmartScalarComparisonPreviousPeriod extends BaseSmartScalarComparison {
  type: "previousPeriod";
}

export interface SmartScalarComparisonPreviousValue extends BaseSmartScalarComparison {
  type: "previousValue";
}

export interface SmartScalarComparisonStaticNumber extends BaseSmartScalarComparison {
  type: "staticNumber";
  value: number;
  label: string;
}

export type SmartScalarComparison =
  | SmartScalarComparisonAnotherColumn
  | SmartScalarComparisonPreviousValue
  | SmartScalarComparisonPreviousPeriod
  | SmartScalarComparisonPeriodsAgo
  | SmartScalarComparisonStaticNumber;

export interface PieRow {
  key: string;
  name: string;
  originalName: string;
  color: string;
  defaultColor: boolean;
  enabled: boolean;
  hidden: boolean;
  isOther: boolean;
}

export interface TreemapRow {
  key: string;
  name: string;
  originalName: string;
  color: string;
  defaultColor: boolean;
  enabled: boolean;
  hidden: boolean;
}

export type GoalValue =
  | GoalStaticValue
  | GoalSelfColumnRef
  | GoalForeignColumnRef;

export type GoalStaticValue = number;

// name of another column in the same question
export type GoalSelfColumnRef = string;

export type GoalForeignColumnRef = {
  card_id: CardId;
  column: string;
};

export type GoalSegment = {
  color: string;
  label?: string;
  min: GoalValue | null;
  max: GoalValue | null;
};

export type ScalarSegment = {
  min: GoalStaticValue | null;
  max: GoalStaticValue | null;
  color: string;
  label?: string;
};

export type ResolvedGoalSegment = {
  color?: string; // TODO: why optional?
  label?: string;
  min: number;
  max: number;
};
