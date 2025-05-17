import type { TableId } from "metabase-types/api";

export interface DataSourceSelectorProps {
  isInitiallyOpen: boolean;
  isQuerySourceModel: boolean;
  /** false when joining data, true otherwise */
  canChangeDatabase: boolean;
  selectedDatabaseId: number | null;
  selectedTableId?: TableId;
  selectedCollectionId?: number | null;
  canSelectModel: boolean;
  canSelectTable: boolean;
  triggerElement: JSX.Element;
  setSourceTableFn: (tableId: TableId) => void;
}
