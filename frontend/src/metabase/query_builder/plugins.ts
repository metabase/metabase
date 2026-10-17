import type { ComponentType } from "react";

import { definePluginSlot } from "metabase/plugins";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type QueryBuilderMetricsExplorerDescription = {
  seriesNames: string[];
  breakoutLabel: string | null;
};

export type QueryBuilderMetricsExplorerProps = {
  /** Encoded metrics viewer state to start from. Read once, on mount. */
  initialHash: string;
  /** Receives the encoded state whenever the user changes it. */
  onHashChange: (hash: string) => void;
  /** Receives the series and breakout shown whenever they change. */
  onDescriptionChange?: (
    description: QueryBuilderMetricsExplorerDescription,
  ) => void;
};

type QueryBuilderPlugin = {
  /** The metrics explorer shown in the compare sheet; the app fills it in from the metrics viewer. */
  MetricsExplorer: ComponentType<QueryBuilderMetricsExplorerProps>;
};

export const PLUGIN_QUERY_BUILDER = definePluginSlot(
  (): QueryBuilderPlugin => ({
    MetricsExplorer: PluginPlaceholder<QueryBuilderMetricsExplorerProps>,
  }),
);
