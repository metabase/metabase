import type { MantineThemeOverride } from "@mantine/core";

export type MetabaseTheme = MantineThemeOverride & {
  other: MetabaseThemeOptions;
};

/**
 * Theme options for Metabase components and visualizations.
 */
interface MetabaseThemeOptions {}
