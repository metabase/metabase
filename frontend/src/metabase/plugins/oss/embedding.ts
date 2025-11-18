import type { ReactNode } from "react";

import type { DataSourceSelectorProps } from "metabase/embedding-sdk/types/components/data-picker";
import type { TableId } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

export interface SimpleDataPickerProps {
  filterByDatabaseId: number | null;
  selectedEntity?: TableId;
  isInitiallyOpen: boolean;
  triggerElement: ReactNode;
  setSourceTableFn: (tableId: TableId) => void;
  entityTypes: EmbeddingEntityType[];
}

export const PLUGIN_EMBEDDING = {
  isEnabled: () => false,
  isInteractiveEmbeddingEnabled: (_state: State) => false,
  SimpleDataPicker: (_props: SimpleDataPickerProps): ReactNode => null,
  DataSourceSelector: (_props: DataSourceSelectorProps): ReactNode => null,
};
