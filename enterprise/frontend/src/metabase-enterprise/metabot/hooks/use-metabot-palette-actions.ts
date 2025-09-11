import { useMemo } from "react";
import { t } from "ttag";

import type { PaletteAction } from "metabase/palette/types";

import { useMetabotAgent } from "./use-metabot-agent";

export const useMetabotPaletteActions = (searchText: string) => {
  const { startNewConversation, isEnabled } = useMetabotAgent();

  return useMemo(() => {
    if (!isEnabled) {
      return [];
    }

    const ret: PaletteAction[] = [
      {
        id: "initialize_metabot",
        name: searchText
          ? t`Ask Metabot, "${searchText}"`
          : t`Ask me to do something, or ask me a question`,
        section: "metabot",
        keywords: searchText,
        icon: "metabot",
        perform: () => startNewConversation(searchText),
      },
    ];
    return ret;
  }, [searchText, startNewConversation, isEnabled]);
};
