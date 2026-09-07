import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { MiniPickerTableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  CardDisplayType,
  CardType,
  Database,
  Dataset,
  DatasetQuery,
  NativeQuerySnippet,
  RecentCollectionItem,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

export type Location = {
  row: number;
  column: number;
};

export type SelectionRange = {
  start: Location;
  end: Location;
};

export type SidebarFeatures = {
  dataReference?: boolean;
  variables?: boolean;
  snippets?: boolean;
  promptInput?: boolean;
  formatQuery?: boolean;
};

export type QueryEditorSidebarType =
  | "data-reference"
  | "snippet"
  | "native-query"
  | "template-tags";

export type QueryEditorModalType = "preview-query";

export type QueryEditorDataPickerItem =
  | OmniPickerItem
  | RecentCollectionItem
  | MiniPickerTableItem;

export type QueryEditorDatabasePickerItem = Pick<Database, "id">;

export type QueryEditorModalSnippet =
  | NativeQuerySnippet
  | Partial<Omit<NativeQuerySnippet, "id">>;

export type QueryEditorUiState = {
  lastRunResult: Dataset | null;
  lastRunQuery: DatasetQuery | null;
  selectionRange: SelectionRange[];
  modalSnippet: QueryEditorModalSnippet | null;
  modalType: QueryEditorModalType | null;
  sidebarType: QueryEditorSidebarType | null;
};

export type QueryEditorUiOptions = {
  cardType?: CardType;
  cardDisplay?: CardDisplayType;
  cardVizSettings?: VisualizationSettings;
  canChangeDatabase?: boolean;
  readOnly?: boolean;
  canConvertToNative?: boolean;
  convertToNativeTitle?: string;
  convertToNativeButtonLabel?: string;
  shouldDisableDataPickerItem?: (item: QueryEditorDataPickerItem) => boolean;
  getDataPickerItemTooltip?: (
    item: QueryEditorDataPickerItem,
  ) => string | undefined;
  shouldDisableDatabasePickerItem?: (
    item: QueryEditorDatabasePickerItem,
  ) => boolean;
  editorHeight?: number;
  canUseSampleDatabase?: boolean;
  shouldShowLibrary?: false;
  hidePreview?: boolean;
  hideRunButton?: boolean;
  resizable?: boolean;
};

/**
 * The component always renders content, because NativeQuerySidebar draws the sidebar panel around it before it runs.
 */
export type TemplateTagsSidebarProps = {
  question: Question;
  query: Lib.Query;
  parameterValues: Record<string, RowValue>;
  parametersAreUserVisible?: boolean;
  canUseSampleDatabase?: boolean;
  onChangeQuery: (newQuery: Lib.Query) => void;
  setParameterValues: (newParameterValues: Record<string, RowValue>) => void;
  onClose: () => void;
};
