import type { CardId } from "./card";
import type { DashCardId, DashboardId } from "./dashboard";
import type { DatasetColumn, RowValues } from "./dataset";
import type { MeasureId } from "./measure";
import type { GoalForeignEntityRef } from "./visualization-settings";

export type GoalSourceResults = {
  card?: Record<CardId, GoalSourceResult>;
  measure?: Record<MeasureId, GoalSourceResult>;
};

export type GoalSourceResult = {
  status: "completed" | "failed";
  error?: string;
  error_type?: GoalSourceErrorType;
  data?: {
    cols: DatasetColumn[];
    rows: RowValues[];
  };
};

export type GoalSourceErrorType =
  | "too-many-rows"
  | "not-found"
  | "has-parameters"
  | "withheld"
  | "too-many-sources";

/**
 * Where a chart gets its goal source results from. Signed-in users send the
 * sources. Anonymous routes take the chart identity, and the backend reads the
 * sources from the saved chart.
 */
export type GoalSourcesScope =
  | { type: "signed-in"; dashboard_id?: DashboardId }
  | { type: "public-card"; uuid: string }
  | {
      type: "public-dashcard";
      uuid: string;
      dashcardId: DashCardId;
      cardId: CardId;
    }
  | { type: "public-document-card"; uuid: string; cardId: CardId }
  | { type: "embed-card"; token: string }
  | {
      type: "embed-dashcard";
      token: string;
      dashcardId: DashCardId;
      cardId: CardId;
    };

export type GoalSourceResultsRequest = GoalSourcesScope & {
  sources: GoalForeignEntityRef[];
  ignore_cache?: boolean;
};

export type GoalSourceType = GoalForeignEntityRef["type"];
