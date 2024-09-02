import { t } from "ttag";

import type {
  RecentItem,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import { RECENTS_TAB_ID, SEARCH_TAB_ID } from "../../constants";
import type {
  EntityPickerModalOptions,
  EntityPickerTab,
  TypeWithModel,
} from "../../types";
import { getSearchTabText } from "../../utils";
import { EntityPickerSearchResults } from "../EntityPickerSearch";
import { RecentsTab } from "../RecentsTab";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  defaultToRecentTab: boolean;
  isLoadingRecentItems: boolean;
  options: EntityPickerModalOptions;
  recents: RecentItem[];
  passedTabs: EntityPickerTab<Id, Model, Item>[];
  searchQuery: string;
  searchResults: SearchResult[] | null;
  selectedItem: Item | null;
}

export function getTabs<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  defaultToRecentTab,
  isLoadingRecentItems,
  options,
  passedTabs,
  recents,
  searchQuery,
  searchResults,
  selectedItem,
}: Props<Id, Model, Item>): EntityPickerTab<Id, Model, Item>[] {
  const computedTabs: EntityPickerTab<Id, Model, Item>[] = [];
  const hasRecentsTab = options.hasRecents && recents.length > 0;
  const hasSearchTab = !!searchQuery;
  // This is to prevent different tab being initially open and then flickering back
  // to recents tab once recents have loaded (due to computeInitialTab)
  const shouldOptimisticallyAddRecentsTabWhileLoading =
    defaultToRecentTab && isLoadingRecentItems;

  if (hasRecentsTab || shouldOptimisticallyAddRecentsTabWhileLoading) {
    computedTabs.push({
      id: RECENTS_TAB_ID,
      model: null,
      folderModels: [],
      displayName: t`Recents`,
      icon: "clock",
      render: ({ onItemSelect }) => (
        <RecentsTab
          isLoading={isLoadingRecentItems}
          recentItems={recents}
          onItemSelect={onItemSelect}
          selectedItem={selectedItem}
        />
      ),
    });
  }

  computedTabs.push(...passedTabs);

  if (hasSearchTab) {
    computedTabs.push({
      id: SEARCH_TAB_ID,
      model: null,
      folderModels: [],
      displayName: getSearchTabText(searchResults, searchQuery),
      icon: "search",
      render: ({ onItemSelect }) => (
        <EntityPickerSearchResults
          searchResults={searchResults}
          onItemSelect={onItemSelect}
          selectedItem={selectedItem}
        />
      ),
    });
  }

  return computedTabs;
}
