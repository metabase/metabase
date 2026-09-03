import type { CardId } from "./card";
import type { MeasureId } from "./measure";

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

export type GoalForeignEntityRef =
  | { type: "card"; id: CardId }
  | { type: "measure"; id: MeasureId };

export type GoalForeignColumnRef = GoalForeignEntityRef & { column: string };

export type GoalSegment = {
  // the pre-2022 segments editor could persist segments without a color
  color?: string | null;
  label?: string;
  min: GoalValue | null;
  max: GoalValue | null;
};

// Unlike gauge segments, number chart segments were never persisted without a color.
export type ScalarSegment = {
  min: GoalValue | null;
  max: GoalValue | null;
  color: string;
  label?: string;
};
