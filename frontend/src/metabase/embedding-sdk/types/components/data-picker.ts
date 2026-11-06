import type { JSX } from "react";

import type {
  CardId,
  CardType,
  CollectionId,
  TableId,
} from "metabase-types/api";

export type DataSource =
  | { type: "table"; id: TableId }
  | { type: "card"; id: CardId };

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
  selectedCardId?: CardId;
  selectedCollectionId?: CollectionId | null;
  canSelectModel: boolean;
  canSelectTable: boolean;
  canSelectQuestion: boolean;
  triggerElement: JSX.Element;
  setSourceFn: (source: DataSource) => void;
  /**
   * Accessible name applied to the popover dropdown. Lets consumers that
   * render more than one picker (e.g. the notebook's data and join steps)
   * give each popover a distinct, queryable name.
   */
  popoverAriaLabel?: string;
}
