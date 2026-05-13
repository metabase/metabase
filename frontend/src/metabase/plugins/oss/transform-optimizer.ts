import type { ComponentType } from "react";

import type { Transform } from "metabase-types/api";

export type TransformOptimizerRunPageSectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

export type FindSlowToolProps = {
  thresholdSec: number | undefined;
  onThresholdChange: (sec: number | undefined) => void;
  /**
   * The transform ids that currently match the threshold. The "Hammer
   * time" button POSTs these to the bulk-optimize endpoint. Empty when
   * no threshold is set OR no transform's last_run survives the filter.
   */
  matchingTransformIds: number[];
};

export type TransformOptimizerPlugin = {
  isEnabled: boolean;
  RunPageSection: ComponentType<TransformOptimizerRunPageSectionProps> | null;
  FindSlowTool: ComponentType<FindSlowToolProps> | null;
};

const getDefaultPlugin = (): TransformOptimizerPlugin => ({
  isEnabled: false,
  RunPageSection: null,
  FindSlowTool: null,
});

export const PLUGIN_TRANSFORM_OPTIMIZER = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_TRANSFORM_OPTIMIZER, getDefaultPlugin());
}
