import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import type { ColorOperation } from "metabase/styled-components/theme/dynamic-css-vars-config";

type DynamicColorDefinition = {
  light?: ColorOperation & { source: MetabaseColor };
  dark?: ColorOperation & { source: MetabaseColor };
};

/**
 * A mapping of SDK color names to their dynamic color definition.
 *
 * This is currently only used in the embed flow to provide better out-of-the-box defaults.
 **/
export type EmbedFlowDerivedDefaultColorConfig = Partial<
  Record<MetabaseColor, DynamicColorDefinition>
>;
