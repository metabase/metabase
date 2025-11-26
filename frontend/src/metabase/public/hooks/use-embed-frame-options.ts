import { useEffect, useState } from "react";

// Importing specifically metabase/common/hooks/use-docs-url to avoid circular dependency
import { useDocsUrl } from "metabase/common/hooks/use-docs-url";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";

import { DEFAULT_EMBED_DISPLAY_PARAMS } from "../constants";
import type { EmbeddingHashOptions } from "../lib/types";

export const useEmbedFrameOptions = ({
  location,
  listenToHashChangeEvents = false,
}: {
  location: { hash: string };
  listenToHashChangeEvents?: boolean;
}) => {
  const {
    background = true,
    bordered = isWithinIframe(),
    titled = DEFAULT_EMBED_DISPLAY_PARAMS.titled,
    theme: parsedTheme = DEFAULT_EMBED_DISPLAY_PARAMS.theme,
    hide_parameters = DEFAULT_EMBED_DISPLAY_PARAMS.hideParameters,
    hide_download_button = null,
    downloads = DEFAULT_EMBED_DISPLAY_PARAMS.downloadsEnabled,
    locale,
  } = parseHashOptions(location.hash) as EmbeddingHashOptions & {
    // this parameter is not supported anymore, but we access it in this hook to log an error
    hide_download_button?: boolean | null;
  };

  const [theme, setTheme] = useState<string>(parsedTheme);

  // eslint-disable-next-line no-unconditional-metabase-links-render -- this is a console.error for a deprecated parameter
  const { url: staticEmbedParametersDocsUrl } = useDocsUrl(
    "embedding/static-embedding-parameters",
    {
      anchor: "customizing-the-appearance-of-a-static-embed",
    },
  );

  useEffect(() => {
    if (hide_download_button !== null) {
      console.error(
        `%c⚠️ The \`hide_download_button\` option has been removed. Please use the \`downloads\` option instead: ${staticEmbedParametersDocsUrl}`,
        // eslint-disable-next-line no-color-literals
        "color: #FF2222; font-size: 16px; font-weight: bold;",
      );
    }
  }, [hide_download_button, staticEmbedParametersDocsUrl]);

  const downloadsEnabled = PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
    downloads,
  });

  useEffect(() => {
    if (listenToHashChangeEvents) {
      const onHashChange = () => {
        const { theme: newTheme } = parseHashOptions(
          window.location.hash,
        ) as EmbeddingHashOptions;

        // Update only if the theme has changed
        if (newTheme !== theme) {
          setTheme(newTheme);
        }
      };

      window.addEventListener("hashchange", onHashChange);

      return () => {
        window.removeEventListener("hashchange", onHashChange);
      };
    }
  }, [listenToHashChangeEvents, location.hash, theme]);

  return {
    background,
    bordered,
    titled,
    theme,
    hide_parameters,
    downloadsEnabled,
    locale,
  };
};
