import type { Ace } from "ace-builds";

import type { Widget } from "metabase/visualizations/components/ChartSettings";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import type {
  Card,
  DashboardId,
  Dataset,
  Field,
  NativeQuerySnippet,
  ParameterValueOrArray,
} from "metabase-types/api";

export type QueryBuilderMode = "view" | "notebook" | "dataset";
export type DatasetEditorTab = "query" | "metadata";
export type QueryBuilderQueryStatus = "idle" | "running" | "complete";
export type DataReferenceStack =
  | { type: "database"; item: Database }
  | { type: "schema"; item: Schema }
  | { type: "table"; item: Table }
  | { type: "question"; item: Question }
  | { type: "field"; item: Field };

export type ForeignKeyReference = {
  status: number;
  value: number;
};

export interface QueryBuilderUIControls {
  isModifiedFromNotebook: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingNewbModal: boolean;
  isRunning: boolean;
  isQueryComplete: boolean;
  isShowingSummarySidebar: boolean;
  isShowingChartTypeSidebar: boolean;
  isShowingChartSettingsSidebar: boolean;
  isShowingQuestionDetailsSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isNativeEditorOpen: boolean;
  initialChartSetting: { section: string; widget?: Widget } | null;
  isShowingRawTable: boolean;
  queryBuilderMode: QueryBuilderMode | null;
  isShowingQuestionInfoSidebar: boolean;
  isShowingQuestionSettingsSidebar: boolean;
  previousQueryBuilderMode: QueryBuilderMode | null;
  snippetCollectionId: number | null;
  modalSnippet: Partial<NativeQuerySnippet> | null;
  datasetEditorTab: DatasetEditorTab;
  isShowingNotebookNativePreview: boolean;
  notebookNativePreviewSidebarWidth: number | null;
  dataReferenceStack: DataReferenceStack | null;
  nativeEditorSelectedRange: Ace.Range | null;
  showSidebarTitle: boolean;
}

export interface QueryBuilderLoadingControls {
  showLoadCompleteFavicon: boolean;
  documentTitle: string;
  timeoutId: string;
}

export interface QueryBuilderDashboardState {
  dashboardId: DashboardId | null;
  isEditing: boolean;
}

export interface QueryBuilderState {
  uiControls: QueryBuilderUIControls;
  loadingControls: QueryBuilderLoadingControls;
  parentDashboard: QueryBuilderDashboardState;
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
