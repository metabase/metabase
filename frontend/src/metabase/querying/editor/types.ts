import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { MiniPickerTableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type {
  CardDisplayType,
  CardType,
  Database,
  Dataset,
  DatasetQuery,
  NativeQuerySnippet,
  RecentCollectionItem,
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
  disableDefaultLimit?: boolean;
  shouldDisableDataPickerItem?: (item: QueryEditorDataPickerItem) => boolean;
  shouldDisableDatabasePickerItem?: (
    item: QueryEditorDatabasePickerItem,
  ) => boolean;
  editorHeight?: number;
  shouldShowLibrary?: false;
  hidePreview?: boolean;
  hideRunButton?: boolean;
  resizable?: boolean;
};
