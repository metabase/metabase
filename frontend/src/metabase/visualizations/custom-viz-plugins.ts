import { useEffect } from "react";

import { useListCustomVizPluginsQuery } from "metabase/api";
import { useEmbeddingEntityContext } from "metabase/embedding/context";

/**
 * Hook that fetches the list of active custom visualization plugins.
 * For PoC: logs available plugins to console.
 * This will later be used to register custom visualizations with the rendering pipeline.
 */
export function useCustomVizPlugins({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { token, uuid } = useEmbeddingEntityContext();
  const isPublicOrStaticEmbed = Boolean(token || uuid);
  const shouldLoad = enabled && !isPublicOrStaticEmbed;
  const { data: plugins } = useListCustomVizPluginsQuery(undefined, {
    skip: !shouldLoad,
  });

  useEffect(() => {
    if (plugins && plugins.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[custom-viz-plugins] Available plugins:", plugins);
    }
  }, [plugins]);

  return plugins;
}
