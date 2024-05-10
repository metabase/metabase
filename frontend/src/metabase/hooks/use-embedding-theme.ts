import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { useMantineTheme } from "metabase/ui";

/**
 * Get the Mantine theme from context.
 * The embedding theme options are available in `theme.other`
 */
export const useEmbeddingTheme: () => EmbeddingTheme = useMantineTheme;
