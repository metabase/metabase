import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";

import { useSdkIframeEmbedSetupContext } from "../context";
import { getEmbedSnippet } from "../utils/embed-snippet";

export function useSdkIframeEmbedSnippet() {
  const instanceUrl = useSetting("site-url");
  const { settings, experience } = useSdkIframeEmbedSetupContext();

  return useMemo(
    () => getEmbedSnippet({ settings, instanceUrl, experience }),
    [instanceUrl, settings, experience],
  );
}
