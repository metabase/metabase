import { useState } from "react";

import { useEmbedTheme } from "metabase/dashboard/hoc/controls/hooks/use-embed-theme";
import type { EmbedDisplayControls } from "metabase/dashboard/hoc/controls/types";
import { isWithinIframe } from "metabase/lib/dom";

export function useEmbedDisplayOptions(): EmbedDisplayControls {
  const [bordered, setBordered] = useState<boolean>(isWithinIframe());
  const [titled, setTitled] = useState<boolean>(true);
  const [hideDownloadButton, setHideDownloadButton] = useState<boolean>(true);
  const [font, setFont] = useState<string | null>(null);
  const [hideParameters, setHideParameters] = useState<string | null>(null);
  const {
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    setTheme,
    theme,
  } = useEmbedTheme();

  return {
    bordered,
    setBordered,
    titled,
    setTitled,
    hideDownloadButton,
    setHideDownloadButton,
    hideParameters,
    setHideParameters,
    font,
    setFont,
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    setTheme,
    theme,
  };
}
