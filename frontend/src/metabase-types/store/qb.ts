import { Dataset } from "metabase-types/api/dataset";

import { Card } from "metabase-types/types/Card";
import { Field } from "metabase-types/types/Field";
import { ParameterValueOrArray } from "metabase-types/types/Parameter";

export type QueryBuilderMode = "view" | "notebook" | "dataset";
export type DatasetEditorTab = "query" | "metadata";
export type QueryBuilderQueryStatus = "idle" | "running" | "complete";

export type ForeignKeyReference = {
  status: number;
  value: number;
};

export interface QueryBuilderUIControls {
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingNewbModal: boolean;
  isEditing: boolean;
  isRunning: boolean;
  isQueryComplete: boolean;
  isShowingSummarySidebar: boolean;
  isShowingChartTypeSidebar: boolean;
  isShowingChartSettingsSidebar: boolean;
  isShowingQuestionDetailsSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  initialChartSetting: null;
  isPreviewing: boolean;
  isShowingRawTable: boolean;
  queryBuilderMode: QueryBuilderMode;
  previousQueryBuilderMode: boolean;
  snippetCollectionId: number | null;
  datasetEditorTab: DatasetEditorTab;
}

export interface QueryBuilderLoadingControls {
  showLoadCompleteFavicon: boolean;
  documentTitle: string;
  timeoutId: string;
}

export interface QueryBuilderState {
  uiControls: QueryBuilderUIControls;

  loadingControls: QueryBuilderLoadingControls;
  queryStatus: QueryBuilderQueryStatus;
  queryResults: Dataset[] | null;
  queryStartTime: number | null;
  cancelQueryDeferred: Promise<void> | null;

  card: Card | null;
  originalCard: Card | null;
  lastRunCard: Card | null;

  parameterValues: Record<string, ParameterValueOrArray>;

  zoomedRowObjectId: number | string | null;
  tableForeignKeyReferences: Record<number, ForeignKeyReference> | null;

  visibleTimelineIds: number[];
  selectedTimelineEventIds: number[];

  metadataDiff: Record<string, Partial<Field>>;

  currentState: {
    card: Card;
    cardId?: number;
    serializedCard: string;
  } | null;
}
