import type Database from "metabase-lib/v1/metadata/Database";
import type { TableId } from "metabase-types/api";

export interface DataSourceSelectorProps {
  isInitiallyOpen: boolean;
  databases: Database[] | undefined;
  canChangeDatabase: boolean;
  selectedDatabaseId: number | null;
  selectedTableId: TableId | undefined;
  selectedCollectionId: number | null | undefined;
  databaseQuery: { saved: boolean };
  canSelectModel: boolean;
  canSelectTable: boolean;
  canSelectMetric: boolean;
  canSelectSavedQuestion: boolean;
  triggerElement: JSX.Element;
  setSourceTableFn: (tableId: TableId) => void;
}
