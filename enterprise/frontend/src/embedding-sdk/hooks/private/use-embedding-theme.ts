import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { useMantineTheme } from "metabase/ui";

export const useEmbeddingTheme: () => EmbeddingTheme = useMantineTheme;
