import type { Query } from "history";
import { useRegisterActions, useKBar, Priority } from "kbar";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getSectionsWithPlugins } from "metabase/admin/settings/selectors";
import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import Search from "metabase/entities/search";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  getDocsSearchUrl,
  getDocsUrl,
  getSettings,
} from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import type { IconName } from "metabase/ui";

import type { PaletteAction } from "../types";
import { filterRecentItems } from "../utils";

export const useCommandPalette = ({
  locationQuery,
}: {
  locationQuery: Query;
}) => {
  const dispatch = useDispatch();
  const docsUrl = useSelector(state => getDocsUrl(state, {}));
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const isSearchTypeaheadEnabled = useSetting("search-typeahead-enabled");

  // Used for finding actions within the list
  const { searchQuery } = useKBar(state => ({
    searchQuery: state.searchQuery,
  }));
  const trimmedQuery = searchQuery.trim();

  // Used for finding objects across the Metabase instance
  const [debouncedSearchText, setDebouncedSearchText] = useState(trimmedQuery);

  useDebounce(
    () => {
      setDebouncedSearchText(trimmedQuery);
    },
    SEARCH_DEBOUNCE_DURATION,
    [trimmedQuery],
  );

  const hasQuery = searchQuery.length > 0;

  const {
    currentData: searchResults,
    isFetching: isSearchLoading,
    error: searchError,
  } = useSearchQuery(
    {
      q: debouncedSearchText,
      context: "command-palette",
      limit: 20,
    },
    {
      skip: !debouncedSearchText || !isSearchTypeaheadEnabled,
      refetchOnMountOrArgChange: true,
    },
  );

  const { data: recentItems } = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
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
        name: debouncedSearchText
          ? t`Search documentation for "${debouncedSearchText}"`
          : t`View documentation`,
        section: "docs",
        keywords: debouncedSearchText, // Always match the debouncedSearchText string
        icon: "document",
        perform: () => {
          if (debouncedSearchText) {
            window.open(getDocsSearchUrl({ debouncedSearchText }));
          } else {
            window.open(docsUrl);
          }
        },
      },
    ];
    return ret;
  }, [debouncedSearchText, docsUrl]);

  const showDocsAction = showMetabaseLinks && hasQuery;

  useRegisterActions(showDocsAction ? docsAction : [], [
    docsAction,
    showDocsAction,
  ]);

  const searchResultActions = useMemo<PaletteAction[]>(() => {
    const searchLocation = {
      pathname: "search",
      query: {
        ...locationQuery,
        q: debouncedSearchText,
      },
    };
    if (!isSearchTypeaheadEnabled) {
      return [
        {
          id: `search-disabled`,
          name: t`View search results for "${debouncedSearchText}"`,
          section: "search",
          keywords: debouncedSearchText,
          icon: "link" as const,
          perform: () => {
            dispatch(push(searchLocation));
          },
          priority: Priority.HIGH,
          extra: {
            href: searchLocation,
          },
        },
      ];
    } else if (isSearchLoading) {
      return [
        {
          id: "search-is-loading",
          name: t`Loading...`,
          keywords: searchQuery,
          section: "search",
        },
      ];
    } else if (searchError) {
      return [
        {
          id: "search-error",
          name: t`Could not load search results`,
          section: "search",
        },
      ];
    } else if (debouncedSearchText) {
      if (searchResults?.data.length) {
        return [
          {
            id: `search-results-metadata`,
            name: t`View and filter all ${searchResults?.total} results`,
            section: "search",
            keywords: debouncedSearchText,
            icon: "link" as IconName,
            perform: () => {
              dispatch(push(searchLocation));
            },
            priority: Priority.HIGH,
            extra: {
              href: searchLocation,
            },
          },
        ].concat(
          searchResults.data.map(result => {
            const wrappedResult = Search.wrapEntity(result, dispatch);
            return {
              id: `search-result-${result.model}-${result.id}`,
              name: result.name,
              subtitle: result.description || "",
              icon: getIcon(result).name,
              section: "search",
              keywords: debouncedSearchText,
              priority: Priority.NORMAL,
              perform: () => {
                dispatch(push(wrappedResult.getUrl()));
              },
              extra: {
                parentCollection: wrappedResult.getCollection().name,
                isVerified: result.moderated_status === "verified",
                database: result.database_name,
                href: wrappedResult.getUrl(),
              },
            };
          }),
        );
      } else {
        return [
          {
            id: "no-search-results",
            name: t`No results for “${debouncedSearchText}”`,
            keywords: debouncedSearchText,
            section: "search",
          },
        ];
      }
    }
    return [];
  }, [
    dispatch,
    debouncedSearchText,
    searchQuery,
    isSearchLoading,
    searchError,
    searchResults,
    locationQuery,
    isSearchTypeaheadEnabled,
  ]);

  useRegisterActions(searchResultActions, [searchResultActions]);

  const recentItemsActions = useMemo<PaletteAction[]>(() => {
    return (
      filterRecentItems(recentItems ?? []).map(item => ({
        id: `recent-item-${getName(item)}-${item.model}-${item.id}`,
        name: getName(item),
        icon: getIcon(item).name,
        section: "recent",
        perform: () => {
          // Need to keep this logic here for when user selects via keyboard
          const href = Urls.modelToUrl(item);
          if (href) {
            dispatch(push(href));
          }
        },
        extra:
          item.model === "table"
            ? {
                database: item.database.name,
                href: Urls.modelToUrl(item),
              }
            : {
                parentCollection:
                  item.parent_collection.id === null
                    ? ROOT_COLLECTION.name
                    : item.parent_collection.name,
                isVerified: item.moderated_status === "verified",
                href: Urls.modelToUrl(item),
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
