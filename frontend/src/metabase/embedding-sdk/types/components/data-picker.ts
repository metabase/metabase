import type { CardType, CollectionId, TableId } from "metabase-types/api";

export interface DataSourceSelectorProps {
  isInitiallyOpen: boolean;
  /** Type of the the query's first stage */
  querySourceType:
    | Extract<CardType, "model" | "question">
    | undefined
    // This allows the predefined values to still be there, so TypeScript doesn't reduce the type to just `string`
    | (string & NonNullable<unknown>);
  /** false when joining data, true otherwise */
  canChangeDatabase: boolean;
  selectedDatabaseId: number | null;
  selectedTableId?: TableId;
  selectedCollectionId?: CollectionId | null;
  canSelectModel: boolean;
  canSelectTable: boolean;
  canSelectQuestion: boolean;
  triggerElement: JSX.Element;
  setSourceTableFn: (tableId: TableId) => void;
}
