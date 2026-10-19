import { useEffect, useMemo, useState } from "react";

import { logUnavailableCustomVizMessage } from "embedding-sdk-bundle/lib/log-unavailable-custom-viz";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { getSensibleVisualizations } from "metabase/viz-core";
import type { CardDisplayType } from "metabase-types/api";

import { useSdkQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useSdkQuestionContext();
  const { plugins: customVizPlugins } = PLUGIN_CUSTOM_VIZ.useCustomVizPlugins();
  const [pluginsLoadedVersion, setPluginsLoadedVersion] = useState(0);

  // Eagerly load all custom-viz plugins so their displays register in the
  // visualizations Map and appear in the chart-type picker. Mirrors the
  // main-app ChartTypeSidebar.
  useEffect(() => {
    if (!customVizPlugins?.length) {
      return;
    }
    let cancelled = false;
    Promise.all(
      customVizPlugins.map((plugin) =>
        PLUGIN_CUSTOM_VIZ.loadCustomVizPlugin(plugin, {
          onMessage: logUnavailableCustomVizMessage,
        }),
      ),
    ).then(() => {
      if (!cancelled) {
        setPluginsLoadedVersion((version) => version + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [customVizPlugins]);

  const result = queryResults?.[0] ?? null;

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pluginsLoadedVersion` isn't read in the body; it's the signal that custom-viz plugins registered in the global `visualizations` Map, which `getSensibleVisualizations` reads.
    [result, pluginsLoadedVersion],
  );

  return {
    // Unjustified type cast. FIXME
    sensibleVisualizations: sensibleVisualizations as CardDisplayType[],
    // Unjustified type cast. FIXME
    nonSensibleVisualizations: nonSensibleVisualizations as CardDisplayType[],
  };
};
