import { useCallback } from "react";

import { getLibraryCollectionType } from "metabase/data-studio/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { PLUGIN_COLLECTIONS, PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import type { IconData, ObjectWithModel } from "metabase/utils/icon";
import { modelIconMap } from "metabase/utils/icon";
import { getIconForVisualizationType } from "metabase/visualizations";
import type { CollectionType, VisualizationDisplay } from "metabase-types/api";

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

      if (item.model === "collection") {
        switch (
          getLibraryCollectionType(item.type as unknown as CollectionType)
        ) {
          case "root":
            return { name: "repository" };
          case "data":
            return { name: "table" };
          case "metrics":
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
