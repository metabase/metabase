import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "metabase/common/hooks";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type { CardDisplayType } from "metabase-types/api";

import { useSdkQuestionContext } from "../context";

export const useSensibleVisualizations = () => {
  const { queryResults } = useSdkQuestionContext();
  const [sendToast] = useToast();
  const { plugins: customVizPlugins } = PLUGIN_CUSTOM_VIZ.useCustomVizPlugins();
  const [pluginsLoadedVersion, setPluginsLoadedVersion] = useState(0);

  const onInfo = useCallback(
    (message: string) => sendToast({ message }),
    [sendToast],
  );

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
        PLUGIN_CUSTOM_VIZ.loadCustomVizPlugin(plugin, { onInfo }),
      ),
    ).then(() => {
      if (!cancelled) {
        setPluginsLoadedVersion((version) => version + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [customVizPlugins, onInfo]);

  const result = queryResults?.[0] ?? null;

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pluginsLoadedVersion` isn't read in the body; it's the signal that custom-viz plugins registered in the global `visualizations` Map, which `getSensibleVisualizations` reads.
    [result, pluginsLoadedVersion],
  );

  return {
    sensibleVisualizations: sensibleVisualizations as CardDisplayType[],
    nonSensibleVisualizations: nonSensibleVisualizations as CardDisplayType[],
  };
};
