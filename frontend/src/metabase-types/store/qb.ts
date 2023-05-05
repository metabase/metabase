import {
  Card,
  Dataset,
  Field,
  ParameterValueOrArray,
} from "metabase-types/api";

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
  isRunning: boolean;
  isQueryComplete: boolean;
  isShowingSummarySidebar: boolean;
  isShowingChartTypeSidebar: boolean;
  isShowingChartSettingsSidebar: boolean;
  isShowingQuestionDetailsSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  initialChartSetting: null;
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

  selectedTimelineEventIds: number[];

  metadataDiff: Record<string, Partial<Field>>;

  currentState: {
    card: Card;
    cardId?: number;
    serializedCard: string;
  } | null;
}
