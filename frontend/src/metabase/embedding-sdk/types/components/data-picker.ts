import type { TableId } from "metabase-types/api";

export interface DataSourceSelectorProps {
  isInitiallyOpen: boolean;
  canChangeDatabase: boolean;
  selectedDatabaseId: number | null;
  selectedTableId: TableId | undefined;
  selectedCollectionId: number | null | undefined;
  canSelectModel: boolean;
  canSelectTable: boolean;
  triggerElement: JSX.Element;
  setSourceTableFn: (tableId: TableId) => void;
}
