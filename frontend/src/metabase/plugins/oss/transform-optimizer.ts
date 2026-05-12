import type { ComponentType } from "react";

import type { Transform } from "metabase-types/api";

export type TransformOptimizerRunPageSectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

export type TransformOptimizerPlugin = {
  isEnabled: boolean;
  RunPageSection: ComponentType<TransformOptimizerRunPageSectionProps> | null;
};

const getDefaultPlugin = (): TransformOptimizerPlugin => ({
  isEnabled: false,
  RunPageSection: null,
});

export const PLUGIN_TRANSFORM_OPTIMIZER = getDefaultPlugin();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_TRANSFORM_OPTIMIZER, getDefaultPlugin());
}
