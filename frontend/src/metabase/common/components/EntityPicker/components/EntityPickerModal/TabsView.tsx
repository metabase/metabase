import { useState, useEffect, useMemo } from "react";

import { Icon, Tabs } from "metabase/ui";
import type {
  SearchResult,
  SearchResultId,
  SearchRequest,
} from "metabase-types/api";

import type { EntityTab, TypeWithModel } from "../../types";
import {
  EntityPickerSearchResults,
  EntityPickerSearchTab,
} from "../EntityPickerSearch";

const computeInitialTab = <
  Item extends TypeWithModel<SearchResultId, Model>,
  Model extends string,
>({
  initialValue,
  tabs,
  hasRecents,
  defaultToRecentTab,
}: {
  initialValue?: Partial<Item>;
  tabs: EntityTab<Model>[];
  hasRecents: boolean;
  defaultToRecentTab: boolean;
}) => {
  if (hasRecents && defaultToRecentTab) {
    return { model: "recents" };
  }
  if (
    initialValue?.model &&
    tabs.some(tab => tab.model === initialValue.model)
  ) {
    return { model: initialValue.model };
  } else {
    return { model: tabs[0].model };
  }
};

export const TabsView = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  tabs,
  onItemSelect,
  searchQuery,
  searchResults,
  selectedItem,
  initialValue,
  defaultToRecentTab,
  setShowActionButtons,
}: {
  tabs: EntityTab<Model>[];
  onItemSelect: (item: Item) => void;
  searchQuery: string;
  searchResults: SearchResult[] | null;
  selectedItem: Item | null;
  initialValue?: Partial<Item>;
  searchParams?: Partial<SearchRequest>;
  defaultToRecentTab: boolean;
  setShowActionButtons: (showActionButtons: boolean) => void;
}) => {
  const hasSearchTab = !!searchQuery;
  const hasRecentsTab = tabs.some(tab => tab.model === "recents");

  const defaultTab = useMemo(
    () =>
      computeInitialTab({
        initialValue,
        tabs,
        hasRecents: hasRecentsTab,
        defaultToRecentTab,
      }),
    [initialValue, tabs, hasRecentsTab, defaultToRecentTab],
  );

  const [selectedTab, setSelectedTab] = useState<string>(defaultTab.model);

  useEffect(() => {
    // when the searchQuery changes, switch to the search tab
    if (searchQuery) {
      setSelectedTab("search");
    } else {
      setSelectedTab(defaultTab.model);
    }
  }, [searchQuery, defaultTab.model]);

  useEffect(() => {
    // we don't want to show bonus actions on recents or search tabs
    if (["search", "recents"].includes(selectedTab)) {
      setShowActionButtons(false);
    } else {
      setShowActionButtons(true);
    }
  }, [selectedTab, setShowActionButtons]);

  return (
    <Tabs
      value={selectedTab}
      style={{
        flexGrow: 1,
        height: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Tabs.List px="1rem">
        {tabs.map(tab => {
          const { model, icon, displayName } = tab;

          return (
            <Tabs.Tab
              key={model}
              value={model}
              icon={<Icon name={icon} />}
              onClick={() => setSelectedTab(model)}
            >
              {displayName}
            </Tabs.Tab>
          );
        })}
        {hasSearchTab && (
          <EntityPickerSearchTab
            onClick={() => setSelectedTab("search")}
            searchResults={searchResults}
            searchQuery={searchQuery}
          />
        )}
      </Tabs.List>

      {tabs.map(tab => {
        const { model } = tab;

        return (
          <Tabs.Panel
            key={model}
            value={model}
            style={{
              flexGrow: 1,
              height: 0,
            }}
          >
            {tab.element}
          </Tabs.Panel>
        );
      })}
      {hasSearchTab && (
        <Tabs.Panel
          key="search"
          value="search"
          style={{
            flexGrow: 1,
            height: 0,
          }}
        >
          <EntityPickerSearchResults
            searchResults={searchResults}
            onItemSelect={onItemSelect}
            selectedItem={selectedItem}
          />
        </Tabs.Panel>
      )}
    </Tabs>
  );
};
