import { useEmbedFont } from "metabase/dashboard/hooks/use-embed-font";
import { useEmbedTheme } from "metabase/dashboard/hooks/use-embed-theme";

import type { EmbedDisplayParams } from "../types";

export const DEFAULT_EMBED_DISPLAY_OPTIONS: EmbedDisplayParams = {
  bordered: false,
  titled: true,
  cardTitled: true,
  hideDownloadButton: null,
  hideParameters: null,
  font: null,
  theme: "light",
};

export const useEmbedDisplayOptions = () => {
  const { font, setFont } = useEmbedFont();

  const {
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    setTheme,
    theme,
  } = useEmbedTheme();

  return {
    font,
    setFont,
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    setTheme,
    theme,
  };
};
