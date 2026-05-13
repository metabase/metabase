import { useCallback } from "react";

import type { IconData, ObjectWithModel } from "metabase/common/utils/icon";
import { modelIconMap } from "metabase/common/utils/icon";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { PLUGIN_COLLECTIONS, PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { getIconForVisualizationType } from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

export const useGetIconForVisualizationType = () => {
  const getCustomVizIcon = PLUGIN_CUSTOM_VIZ.useCustomVizPluginsIcon();

  return useCallback(
    (display: VisualizationDisplay): IconData => {
      if (PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(display)) {
        const { icon, isLoading } = getCustomVizIcon(display);
        if (isLoading || !icon) {
          return { name: "unknown" };
        }
        return icon;
      }
      return getIconForVisualizationType(display);
    },
    [getCustomVizIcon],
  );
};

export const useGetIconBase = () => {
  const getIconForVizType = useGetIconForVisualizationType();

  return useCallback(
    /** get an Icon for any entity object, doesn't depend on the entity system */
    (item: ObjectWithModel, _opts?: { isTenantUser?: boolean }): IconData => {
      if (item.model === "card" && item.display) {
        return getIconForVizType(item.display);
      }

      if (item.model === "collection" && item.id === PERSONAL_COLLECTIONS.id) {
        return { name: "group" };
      }

      if (
        item.model === "collection" &&
        item.is_personal &&
        item.location === "/"
      ) {
        return { name: "person" };
      }

      if (item.model === "collection" && item.id === "databases") {
        return { name: "database" };
      }

      if (item.model === "collection" && item.is_library_root === true) {
        switch (item.type) {
          case "library":
            return { name: "repository" };
          case "library-data":
            return { name: "table" };
          case "library-metrics":
            return { name: "metric" };
        }
      }

      return { name: modelIconMap?.[item.model] ?? "unknown" };
    },
    [getIconForVizType],
  );
};

/**
 * relies mainly on the `model` property to determine the icon to return
 * also handle special collection icons and visualization types for cards
 */
export const useGetIcon = () => PLUGIN_COLLECTIONS.useGetIcon();
