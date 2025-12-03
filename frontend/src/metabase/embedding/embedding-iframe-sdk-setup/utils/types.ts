import type { MetabaseColor } from "metabase/embedding-sdk/theme";
import type { DynamicColorDefinition } from "metabase/embedding-sdk/types/private/css-variables";

/**
 * A mapping of SDK color names to their dynamic color definition.
 *
 * This is currently only used in the embed flow to provide better out-of-the-box defaults.
 **/
export type EmbedFlowDerivedDefaultColorConfig = Partial<
  Record<MetabaseColor, DynamicColorDefinition>
>;
