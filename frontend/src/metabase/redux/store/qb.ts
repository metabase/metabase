import type { Widget } from "metabase/viz-core";
import type {
  Card,
  CollectionItemModel,
  Dataset,
  Field,
  NativeQuerySnippet,
  ParameterValuesMap,
} from "metabase-types/api";

export type QueryModalType =
  | "save"
  | "add-to-dashboard"
  | "move"
  | "clone"
  | "archive"
  | "create-alert"
  | "save-question-before-embed"
  | "turn-into-dataset"
  | "can-not-create-model"
  | "new-event"
  | "edit-event"
  | "move-event"
  | "preview-query"
  | "question-embed";

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

type Position = {
  row: number;
  column: number;
};

export type Range = {
  start: Position;
  end: Position;
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
  focusedTimelineEventIds: number[] | null;
  isNativeEditorOpen: boolean;
  initialChartSetting: InitialChartSettingState;
  isShowingRawTable: boolean;
  queryBuilderMode: QueryBuilderMode;
  previousQueryBuilderMode: QueryBuilderMode | null;
  snippetCollectionId: number | null;
  datasetEditorTab: DatasetEditorTab;
  isShowingNotebookNativePreview: boolean;
  notebookNativePreviewSidebarWidth: number | null;
  showSidebarTitle: boolean;
  modal: QueryModalType | null;
  modalSnippet?:
    | NativeQuerySnippet
    | Partial<Omit<NativeQuerySnippet, "id">>
    | null;
  dataReferenceStack: unknown[] | null;
  highlightedNativeQueryLineNumbers: number[];
  isShowingListViewConfiguration: boolean;
  scrollToLastColumn?: boolean;
  questionDetailsTimelineDrawerState: string | null;
  recentlySaved?: boolean;
  nativeEditorSelectedRange: Range[];
}

/** The saveable parts of a native question, as `getMetabotCardBaseline` reads them. */
export type MetabotCardBaseline = Pick<
  Card,
  "dataset_query" | "display" | "visualization_settings" | "parameters"
>;

/** A question Metabot is opening, read and cleared by the next query builder init. */
export type PendingMetabotCard = {
  /** `pathname + hash` of the location the init must match. */
  url: string;
  /** Set when a sidebar turn opens its SQL card, which runs once on open. */
  autoRun?: MetabotAutoRun;
};

export type MetabotAutoRun = {
  /** The Metabot conversation that opened the question. */
  conversationId: string;
  isNativeEditorOpen: boolean;
  /** `false` with a pending Metabot diff: the question opens with no run. */
  shouldRun: boolean;
};

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
  pendingMetabotCard: PendingMetabotCard | null;
  /**
   * The native questions Metabot opened, as loaded and as the query builder has
   * adjusted them since. A question that still matches one is not unsaved work.
   */
  metabotCardBaselines: MetabotCardBaseline[];
  loadingControls: QueryBuilderLoadingControls;
  parentEntity: QueryBuilderParentEntityState;
  queryStatus: QueryBuilderQueryStatus;
  queryResults: Dataset[] | null;
  queryStartTime: number | null;
  cancelQueryController: AbortController | null;

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
