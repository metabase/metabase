import type { QueryModalType } from "metabase/query_builder/constants";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import type {
  Card,
  DashboardId,
  Dataset,
  ParameterValueOrArray,
} from "metabase-types/api";

export type QueryBuilderMode = "view" | "notebook" | "dataset";
export type DatasetEditorTab = "query" | "metadata";
export type QueryBuilderQueryStatus = "idle" | "running" | "complete";

export type ForeignKeyReference = {
  status: number;
  value: number;
};

export type DataReferenceStackItem =
  | { type: "database"; item: Pick<Database, "id"> }
  | { type: "schema"; item: Pick<Schema, "id"> }
  | { type: "table"; item: Pick<Table, "id"> }
  | { type: "question"; item: Pick<Question, "id"> }
  | { type: "field"; item: Field };

export type DataReferenceStack = DataReferenceStackItem[];

export interface QueryBuilderUIControls {
  isModifiedFromNotebook: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingNewbModal: boolean;
  isRunning: boolean;
  isQueryComplete: boolean;
  isShowingSummarySidebar: boolean;
  isShowingChartTypeSidebar: boolean;
  isShowingChartSettingsSidebar: boolean;
  isShowingQuestionDetailsSidebar: boolean;
  isShowingQuestionInfoSidebar: boolean;
  isShowingTimelineSidebar: boolean;
  isNativeEditorOpen: boolean;
  initialChartSetting: null;
  isShowingRawTable: boolean;
  queryBuilderMode: QueryBuilderMode | false;
  previousQueryBuilderMode: boolean;
  snippetCollectionId: number | null;
  datasetEditorTab: DatasetEditorTab;
  isShowingNotebookNativePreview: boolean;
  notebookNativePreviewSidebarWidth: number | null;
  scrollToLastColumn?: boolean;
  modal: QueryModalType | null;
  dataReferenceStack: DataReferenceStack | null;
  initialChartSettings?: { section: string };
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
