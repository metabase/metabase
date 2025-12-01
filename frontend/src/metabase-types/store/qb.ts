import type { Deferred } from "metabase/lib/promise";
import type { QueryModalType } from "metabase/query_builder/constants";
import type { Widget } from "metabase/visualizations/components/ChartSettings/types";
import type {
  Card,
  CollectionItemModel,
  Dataset,
  Field,
  ParameterValuesMap,
  TimelineEventId,
} from "metabase-types/api";

export type QueryBuilderMode = "view" | "notebook" | "dataset";
export type DatasetEditorTab = "query" | "columns" | "metadata";
export type QueryBuilderQueryStatus = "idle" | "running" | "complete";
export type InitialChartSettingState = {
  section?: string | null;
  widget?: Widget | null;
};

export type ForeignKeyReference = {
  status: number;
  value: number;
};

export interface QueryBuilderUIControls {
  isModifiedFromNotebook: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingNewbModal: boolean;
  isRunning: boolean;
  isShowingSummarySidebar: boolean;
  isShowingChartTypeSidebar: boolean;
  isShowingChartSettingsSidebar: boolean;
  isShowingQuestionDetailsSidebar: boolean;
  isShowingQuestionInfoSidebar: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isNativeEditorOpen: boolean;
  isShowingAIQuestionAnalysisSidebar: boolean;
  initialChartSetting: InitialChartSettingState;
  isShowingRawTable: boolean;
  queryBuilderMode: QueryBuilderMode | false;
  previousQueryBuilderMode: boolean;
  snippetCollectionId: number | null;
  datasetEditorTab: DatasetEditorTab;
  isShowingNotebookNativePreview: boolean;
  notebookNativePreviewSidebarWidth: number | null;
  showSidebarTitle: boolean;
  modal: QueryModalType | null;
  modalContext: TimelineEventId | null;
  dataReferenceStack: null;
  highlightedNativeQueryLineNumbers: number[];
  isShowingListViewConfiguration: boolean;
}

export interface QueryBuilderLoadingControls {
  showLoadCompleteFavicon: boolean;
  documentTitle: string;
  timeoutId: string;
}

export interface QueryBuilderParentEntityState {
  id: number | string | null;
  name: string | null;
  model: CollectionItemModel | null;
  isEditing: boolean;
}

export interface QueryBuilderState {
  uiControls: QueryBuilderUIControls;
  loadingControls: QueryBuilderLoadingControls;
  parentEntity: QueryBuilderParentEntityState;
  queryStatus: QueryBuilderQueryStatus;
  queryResults: Dataset[] | null;
  queryStartTime: number | null;
  cancelQueryDeferred: Deferred<void> | null;

  card: Card | null;
  originalCard: Card | null;
  lastRunCard: Card | null;

  parameterValues: ParameterValuesMap;

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
