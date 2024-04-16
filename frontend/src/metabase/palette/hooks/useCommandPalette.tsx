import { useRegisterActions } from "kbar";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getSectionsWithPlugins } from "metabase/admin/settings/selectors";
import { useRecentItemListQuery } from "metabase/common/hooks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { getIcon, getName } from "metabase/entities/recent-items";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  getDocsSearchUrl,
  getDocsUrl,
  getSettings,
} from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";

import type { PaletteAction } from "../types";

export type PalettePageId = "root" | "admin_settings";

export const useCommandPalette = ({
  query,
  debouncedSearchText,
}: {
  query: string;
  debouncedSearchText: string;
}) => {
  const dispatch = useDispatch();
  const docsUrl = useSelector(state => getDocsUrl(state, {}));
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  const hasQuery = query.length > 0;

  const { data: recentItems } = useRecentItemListQuery({
    enabled: !debouncedSearchText,
    reload: true,
  });

  const adminPaths = useSelector(getAdminPaths);
  const settingValues = useSelector(getSettings);
  const settingsSections = useMemo<Record<string, any>>(
    () => getSectionsWithPlugins(),
    [],
  );

  const docsAction = useMemo<PaletteAction[]>(() => {
    const ret: PaletteAction[] = [
      {
        id: "search_docs",
        name: query
          ? `Search documentation for "${query}"`
          : t`View documentation`,
        section: "docs",
        keywords: query, // Always match the query string
        icon: "document",
        perform: () => {
          if (query) {
            window.open(getDocsSearchUrl({ query }));
          } else {
            window.open(docsUrl);
          }
        },
      },
    ];
    return ret;
  }, [query, docsUrl]);

  const showDocsAction = showMetabaseLinks && hasQuery;

  useRegisterActions(showDocsAction ? docsAction : [], [
    docsAction,
    showDocsAction,
  ]);

  const recentItemsActions = useMemo<PaletteAction[]>(() => {
    return (
      recentItems?.map(item => ({
        id: `recent-item-${getName(item)}`,
        name: getName(item),
        icon: getIcon(item).name,
        section: "recent",
        perform: () => {
          dispatch(push(Urls.modelToUrl(item) ?? ""));
        },
        extra:
          item.model === "table"
            ? {
                database: item.model_object.database_name,
              }
            : {
                parentCollection:
                  item.model_object.collection_id === null
                    ? ROOT_COLLECTION.name
                    : item.model_object.collection_name,
                isVerified: item.model_object.moderated_status === "verified",
              },
      })) || []
    );
  }, [dispatch, recentItems]);

  useRegisterActions(hasQuery ? [] : recentItemsActions, [
    recentItemsActions,
    hasQuery,
  ]);

  const adminActions = useMemo<PaletteAction[]>(() => {
    return adminPaths.map(adminPath => ({
      id: `admin-page-${adminPath.key}`,
      name: `${adminPath.name}`,
      icon: "gear",
      perform: () => dispatch(push(adminPath.path)),
      section: "admin",
    }));
  }, [adminPaths, dispatch]);

  const adminSettingsActions = useMemo<PaletteAction[]>(() => {
    return Object.entries(settingsSections)
      .filter(([slug, section]) => {
        if (section.getHidden?.(settingValues)) {
          return false;
        }

        return !slug.includes("/");
      })
      .map(([slug, section]) => ({
        id: `admin-settings-${slug}`,
        name: `Settings - ${section.name}`,
        icon: "gear",
        perform: () => dispatch(push(`/admin/settings/${slug}`)),
        section: "admin",
      }));
  }, [settingsSections, settingValues, dispatch]);

  useRegisterActions(
    hasQuery ? [...adminActions, ...adminSettingsActions] : [],
    [adminActions, adminSettingsActions, hasQuery],
  );
};
