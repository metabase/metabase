import type { Query } from "history";
import { Priority, VisualState, useKBar, useRegisterActions } from "kbar";
import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { jt, t } from "ttag";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getPerformanceAdminPaths } from "metabase/admin/performance/constants/complex";
import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import { Search } from "metabase/entities/search";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { getIcon } from "metabase/lib/icon";
import { getName } from "metabase/lib/name";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { modelToUrl } from "metabase/lib/urls";
import { PLUGIN_CACHING } from "metabase/plugins";
import { trackSearchClick } from "metabase/search/analytics";
import {
  getDocsSearchUrl,
  getDocsUrl,
  getSettings,
} from "metabase/selectors/settings";
import { canAccessSettings, getUserIsAdmin } from "metabase/selectors/user";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Icon, Text } from "metabase/ui";
import {
  type RecentItem,
  isRecentCollectionItem,
  isRecentTableItem,
} from "metabase-types/api";

import { getAdminSettingsSections } from "../constants";
import type { PaletteAction } from "../types";
import { filterRecentItems } from "../utils";

export const useCommandPalette = ({
  disabled = false,
  locationQuery,
}: {
  disabled: boolean;
  locationQuery: Query;
}) => {
  const dispatch = useDispatch();
  const docsUrl = useSelector((state) => getDocsUrl(state, {}));
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const { isVisible } = useKBar((s) => ({
    isVisible: s.visualState !== VisualState.hidden,
  }));

  const isAdmin = useSelector(getUserIsAdmin);
  const canUserAccessSettings = useSelector(canAccessSettings);

  const isSearchTypeaheadEnabled = useSetting("search-typeahead-enabled");

  // Used for finding actions within the list
  const { searchQuery } = useKBar((state) => ({
    searchQuery: state.searchQuery,
  }));
  const trimmedQuery = searchQuery.trim();

  // Used for finding objects across the Metabase instance
  const [debouncedSearchText, setDebouncedSearchText] = useState(trimmedQuery);

  useDebounce(
    () => {
      setDebouncedSearchText(isVisible ? trimmedQuery : "");
    },
    isVisible ? SEARCH_DEBOUNCE_DURATION : 0,
    [trimmedQuery, isVisible],
  );

  const hasQuery = searchQuery.length > 0;

  const {
    currentData: searchResults,
    isFetching: isSearchLoading,
    error: searchError,
    requestId: searchRequestId,
  } = useSearchQuery(
    {
      q: debouncedSearchText,
      context: "command-palette",
      include_dashboard_questions: true,
      limit: 20,
    },
    {
      skip: !debouncedSearchText || !isSearchTypeaheadEnabled || disabled,
      refetchOnMountOrArgChange: true,
    },
  );

  const { data: recentItems, refetch: refetchRecents } = useListRecentsQuery(
    undefined,
    { skip: disabled },
  );
  useEffect(() => {
    if (isVisible && !disabled) {
      refetchRecents();
    }
  }, [isVisible, refetchRecents, disabled]);

  const adminPaths = useSelector(getAdminPaths);
  const settingValues = useSelector(getSettings);

  const docsAction = useMemo<PaletteAction[]>(() => {
    const link = debouncedSearchText
      ? getDocsSearchUrl({ query: debouncedSearchText })
      : docsUrl;
    const ret: PaletteAction[] = [
      {
        id: "search_docs",
        name: debouncedSearchText
          ? t`Search documentation for "${debouncedSearchText}"`
          : t`View documentation`,
        section: "docs",
        keywords: debouncedSearchText, // Always match the debouncedSearchText string
        icon: "document",
        extra: {
          href: link,
        },
      },
    ];
    return ret;
  }, [debouncedSearchText, docsUrl]);

  const showDocsAction = showMetabaseLinks && hasQuery && !disabled;

  useRegisterActions(showDocsAction ? docsAction : [], [
    docsAction,
    showDocsAction,
  ]);

  const searchResultActions = useMemo<PaletteAction[]>(() => {
    if (disabled) {
      return [];
    }

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
          id: `search-without-typeahead`,
          name: t`View search results for "${debouncedSearchText}"`,
          section: "search",
          keywords: debouncedSearchText,
          icon: "link" as const,
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
          disabled: true,
        },
      ];
    } else if (searchError) {
      return [
        {
          id: "search-error",
          name: t`Could not load search results`,
          section: "search",
          disabled: true,
        },
      ];
    } else if (debouncedSearchText) {
      if (searchResults?.data.length) {
        return searchResults.data.map((result, index) => {
          const wrappedResult = Search.wrapEntity(result, dispatch);
          const icon = getIcon(wrappedResult);
          return {
            id: `search-result-${result.model}-${result.id}`,
            name: result.name,
            subtitle: result.description || "",
            icon: icon.name,
            section: "search",
            keywords: debouncedSearchText,
            priority: Priority.NORMAL - index,
            perform: () => {
              trackSearchClick({
                itemType: "item",
                position: index,
                context: "command-palette",
                searchEngine: searchResults?.engine || "unknown",
                requestId: searchRequestId,
                entityModel: result.model,
                entityId: typeof result.id === "number" ? result.id : null,
                searchTerm: debouncedSearchText,
              });
            },
            extra: {
              moderatedStatus: result.moderated_status,
              href: modelToUrl(wrappedResult),
              iconColor: icon.color,
              subtext: getSearchResultSubtext(wrappedResult),
            },
          };
        });
      } else {
        return [
          {
            id: "no-search-results",
            name: t`No results for “${debouncedSearchText}”`,
            keywords: debouncedSearchText,
            section: "search",
            disabled: true,
          },
        ];
      }
    }
    return [];
  }, [
    disabled,
    dispatch,
    debouncedSearchText,
    searchQuery,
    isSearchLoading,
    searchError,
    searchResults,
    locationQuery,
    isSearchTypeaheadEnabled,
    searchRequestId,
  ]);

  useRegisterActions(searchResultActions, [searchResultActions]);

  const recentItemsActions = useMemo<PaletteAction[]>(() => {
    if (disabled) {
      return [];
    }

    return (
      filterRecentItems(recentItems ?? []).map((item) => {
        const icon = getIcon(item);
        return {
          id: `recent-item-${getName(item)}-${item.model}-${item.id}`,
          name: getName(item),
          icon: icon.name,
          section: "recent",
          perform: () => {},
          extra: {
            moderatedStatus: isRecentCollectionItem(item)
              ? item.moderated_status
              : null,
            href: Urls.modelToUrl(item),
            iconColor: icon.color,
            subtext: getRecentItemSubtext(item),
          },
        };
      }) || []
    );
  }, [disabled, recentItems]);

  useRegisterActions(hasQuery ? [] : recentItemsActions, [
    recentItemsActions,
    hasQuery,
  ]);

  const adminActions = useMemo<PaletteAction[]>(() => {
    if (disabled) {
      return [];
    }

    // Subpaths - i.e. paths to items within the main Admin tabs - are needed
    // in the command palette but are not part of the main list of admin paths
    const adminSubpaths = isAdmin
      ? getPerformanceAdminPaths(PLUGIN_CACHING.getTabMetadata())
      : [];

    const paths = [...adminPaths, ...adminSubpaths];
    return paths.map((adminPath) => ({
      id: `admin-page-${adminPath.key}`,
      name: `${adminPath.name}`,
      icon: "gear",
      perform: () => {},
      section: "admin",
      extra: {
        href: adminPath.path,
      },
    }));
  }, [disabled, isAdmin, adminPaths]);

  const settingsActions = useMemo<PaletteAction[]>(() => {
    if (disabled || !canUserAccessSettings) {
      return [];
    }

    return Object.entries(getAdminSettingsSections(settingValues))
      .filter(([_slug, section]) => {
        if (section.hidden) {
          return false;
        }

        if (section.adminOnly && !isAdmin) {
          return false;
        }

        return true;
      })
      .map(([slug, section]) => ({
        id: `admin-settings-${slug}`,
        name: `${t`Settings`} - ${section.name}`,
        icon: "gear",
        perform: () => {},
        section: "admin",
        extra: {
          href: `/admin/settings/${slug}`,
        },
      }));
  }, [disabled, canUserAccessSettings, isAdmin, settingValues]);

  useRegisterActions(hasQuery ? [...adminActions, ...settingsActions] : [], [
    adminActions,
    settingsActions,
    hasQuery,
  ]);

  return {
    searchRequestId,
    searchResults,
    searchTerm: debouncedSearchText,
  };
};

export const getSearchResultSubtext = (wrappedSearchResult: any) => {
  if (wrappedSearchResult.model === "indexed-entity") {
    return (
      <SubtitleText>{jt`a record in ${(
        <Icon
          flex="0 0 auto"
          key="icon"
          name="model"
          style={{
            verticalAlign: "bottom",
            marginInlineStart: "0.25rem",
          }}
        />
      )} ${wrappedSearchResult.model_name}`}</SubtitleText>
    );
  } else if (wrappedSearchResult.model === "table") {
    return wrappedSearchResult.collection?.name ? (
      <SubtitleText>{wrappedSearchResult.collection.name}</SubtitleText>
    ) : (
      <SubtitleText>
        {wrappedSearchResult.table_schema
          ? `${wrappedSearchResult.database_name} (${wrappedSearchResult.table_schema})`
          : wrappedSearchResult.database_name}
      </SubtitleText>
    );
  } else if (
    wrappedSearchResult.model === "card" &&
    wrappedSearchResult.dashboard
  ) {
    return (
      <>
        <Icon
          flex="0 0 auto"
          name="dashboard"
          style={{
            verticalAlign: "bottom",
            marginInline: "0.25rem",
          }}
        />
        <SubtitleText>{wrappedSearchResult.dashboard.name}</SubtitleText>
      </>
    );
  } else {
    return (
      <SubtitleText>{wrappedSearchResult.getCollection?.()?.name}</SubtitleText>
    );
  }
};

export const getRecentItemSubtext = (item: RecentItem) => {
  if (isRecentTableItem(item)) {
    return (
      <SubtitleText>
        {item.table_schema
          ? `${item.database.name} (${item.table_schema})`
          : item.database.name}
      </SubtitleText>
    );
  } else if (item.dashboard) {
    return (
      <>
        <Icon flex="0 0 auto" name="dashboard" size={12} />
        <SubtitleText>{item.dashboard.name}</SubtitleText>
      </>
    );
  } else if (item.parent_collection.id === null) {
    return (
      <>
        <Icon flex="0 0 auto" name="collection" size={12} />
        <SubtitleText>{ROOT_COLLECTION.name}</SubtitleText>
      </>
    );
  } else {
    return (
      <>
        <Icon flex="0 0 auto" name="collection" size={12} />
        <SubtitleText>{item.parent_collection.name}</SubtitleText>
      </>
    );
  }
};

const SubtitleText = ({ children }: PropsWithChildren) => (
  <Text
    lineClamp={1}
    fz="inherit"
    lh="inherit"
    c="inherit"
    style={{ lineBreak: "anywhere" }}
  >
    {children}
  </Text>
);
