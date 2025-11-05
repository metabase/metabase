import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker/types";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker/types";
import type { SelectionRange } from "metabase/query_builder/components/NativeQueryEditor/types";
import type {
  CardDisplayType,
  CardType,
  Database,
  DatasetQuery,
  NativeQuerySnippet,
  RecentCollectionItem,
  VisualizationSettings,
} from "metabase-types/api";

export type QueryEditorSidebarType =
  | "data-reference"
  | "snippet"
  | "native-query";

export type QueryEditorModalType = "preview-query";

export type QueryEditorDataPickerItem =
  | DataPickerItem
  | CollectionPickerItem
  | RecentCollectionItem;

export type QueryEditorDatabasePickerItem = Omit<
  Database,
  "tables" | "schemas"
>;

export type QueryEditorUiState = {
  lastRunQuery: DatasetQuery | null;
  selectionRange: SelectionRange[];
  modalSnippet:
    | NativeQuerySnippet
    | Partial<Omit<NativeQuerySnippet, "id">>
    | null;
  modalType: QueryEditorModalType | null;
  sidebarType: QueryEditorSidebarType | null;
};

export type QueryEditorUiOptions = {
  cardType?: CardType;
  cardDisplay?: CardDisplayType;
  cardVizSettings?: VisualizationSettings;
  convertToNativeTitle?: string;
  convertToNativeButtonLabel?: string;
  shouldDisableDataPickerItem?: (item: QueryEditorDataPickerItem) => boolean;
  shouldDisableDatabasePickerItem?: (
    item: QueryEditorDatabasePickerItem,
  ) => boolean;
};
