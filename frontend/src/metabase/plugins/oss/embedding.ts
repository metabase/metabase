import type { ReactNode } from "react";

import type {
  DataSource,
  DataSourceSelectorProps,
} from "metabase/embedding-sdk/types/components/data-picker";
import type { State } from "metabase/redux/store";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";

import { definePluginSlot } from "../slot";

export interface SimpleDataPickerProps {
  filterByDatabaseId: number | null;
  selectedSource?: DataSource;
  isInitiallyOpen: boolean;
  triggerElement: ReactNode;
  setSourceFn: (source: DataSource) => void;
  entityTypes: EmbeddingEntityType[];
}

const getDefaultPluginEmbedding = () => ({
  isEnabled: () => false,
  isInteractiveEmbeddingEnabled: (_state: State) => false,
  SimpleDataPicker: (_props: SimpleDataPickerProps): ReactNode => null,
  DataSourceSelector: (_props: DataSourceSelectorProps): ReactNode => null,
});

export const PLUGIN_EMBEDDING = definePluginSlot(getDefaultPluginEmbedding);
