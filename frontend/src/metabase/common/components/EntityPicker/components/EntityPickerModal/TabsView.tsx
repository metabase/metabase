import { useState, useEffect } from "react";
import { useMount, usePrevious } from "react-use";

import { Icon, Tabs } from "metabase/ui";
import type { SearchResult, SearchResultId } from "metabase-types/api";

import type { EntityTab, TypeWithModel } from "../../types";
import {
  EntityPickerSearchResults,
  EntityPickerSearchTab,
} from "../EntityPickerSearch";

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
}: {
  tabs: EntityTab<Model>[];
  onItemSelect: (item: Item) => void;
  searchQuery: string;
  searchResults: SearchResult[] | null;
  selectedItem: Item | null;
  initialValue?: Partial<Item>;
}) => {
  const hasSearchTab = !!searchQuery;
  const previousSearchQuery = usePrevious(searchQuery);
  const defaultTab = hasSearchTab ? { model: "search" } : tabs[0];
  const [selectedTab, setSelectedTab] = useState<string>(defaultTab.model);

  useMount(() => {
    if (
      initialValue?.model &&
      tabs.some(tab => tab.model === initialValue.model)
    ) {
      setSelectedTab(initialValue.model);
    }
  });

  useEffect(() => {
    // when the searchQuery changes, switch to the search tab
    if (!!searchQuery && searchQuery !== previousSearchQuery) {
      setSelectedTab("search");
    } else if (selectedTab === "search") {
      setSelectedTab(defaultTab.model);
    }
  }, [searchQuery, previousSearchQuery, selectedTab, defaultTab.model]);

  return (
    <Tabs
      defaultValue={defaultTab.model}
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
