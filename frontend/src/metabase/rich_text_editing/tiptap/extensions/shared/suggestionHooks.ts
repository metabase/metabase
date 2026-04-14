import { useCallback } from "react";

import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import type { MenuItem } from "metabase/documents/components/Editor/shared/MenuComponents";
import { useGetIcon } from "metabase/hooks/use-icon";
import { getName } from "metabase/utils/name";
import { modelToUrl } from "metabase/utils/urls/modelToUrl";
import type { Database, RecentItem, SearchResult } from "metabase-types/api";

import { entityToUrlableModel } from "./suggestionUtils";
import type { SuggestionModel } from "./types";

export const useBuildSearchMenuItems = () => {
  const getIcon = useGetIcon();

  return useCallback(
    (
      searchResults: SearchResult[],
      onSelect: (result: SearchResult) => void,
    ): MenuItem[] =>
      searchResults.map((result) => {
        const iconData = getIcon({
          model: result.model,
          display: result.display,
        });
        const urlableModel = entityToUrlableModel(result, result.model);
        const href = modelToUrl(urlableModel);
        return {
          icon: iconData.name,
          iconUrl: iconData.iconUrl,
          label: result.name,
          id: result.id,
          model: result.model,
          href: href || undefined,
          action: () => onSelect(result),
        };
      }),
    [getIcon],
  );
};

export const useBuildRecentsMenuItems = () => {
  const getIcon = useGetIcon();

  return useCallback(
    (
      recents: RecentItem[],
      onSelect: (recent: RecentItem) => void,
    ): MenuItem[] =>
      recents.map((recent) => {
        const iconData = getIcon(recent);
        const urlableModel = entityToUrlableModel(recent, recent.model);
        const href = modelToUrl(urlableModel);
        return {
          icon: iconData.name,
          iconUrl: iconData.iconUrl,
          label: getName(recent),
          id: recent.id,
          model: recent.model as SuggestionModel,
          href: href || undefined,
          action: () => onSelect(recent),
        };
      }),
    [getIcon],
  );
};

export const useBuildDbMenuItems = () => {
  const getIcon = useGetIcon();

  return useCallback(
    (dbs: Database[], onSelect: (db: Database) => void): MenuItem[] =>
      dbs.map((db) => {
        const iconData = getIcon({ model: "database" });
        return {
          icon: iconData.name,
          label: db.name,
          id: db.id,
          model: "database",
          action: () => onSelect(db),
        };
      }),
    [getIcon],
  );
};

export const useBuildSearchModelMenuItems = () => {
  const getIcon = useGetIcon();

  return useCallback(
    (
      searchModels: SuggestionModel[],
      onSelect: (model: SuggestionModel) => void,
    ): MenuItem[] =>
      searchModels.map((model) => ({
        icon: getIcon({ model }).name,
        label: getTranslatedEntityName(model) || model,
        model,
        action: () => onSelect(model),
        hasSubmenu: true,
      })),
    [getIcon],
  );
};
