import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { useMantineTheme } from "metabase/ui";

export const useEmbeddingThemeOptions = () => {
  const theme: EmbeddingTheme = useMantineTheme();

  return theme.other ?? {};
};
