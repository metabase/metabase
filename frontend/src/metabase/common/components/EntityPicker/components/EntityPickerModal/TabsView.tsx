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
  searchQuery,
  searchResults,
  selectedItem,
  selectedTab,
  tabs,
  onItemSelect,
  onTabChange,
}: {
  searchQuery: string;
  searchResults: SearchResult[] | null;
  selectedItem: Item | null;
  selectedTab: Model | "recents" | "search";
  tabs: EntityTab<Model | "recents" | "search">[];
  onItemSelect: (item: Item) => void;
  onTabChange: (model: Model | "recents" | "search") => void;
}) => {
  const hasSearchTab = !!searchQuery;

  return (
    <Tabs
      keepMounted
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
              onClick={() => onTabChange(model)}
            >
              {displayName}
            </Tabs.Tab>
          );
        })}
        {hasSearchTab && (
          <EntityPickerSearchTab
            onClick={() => onTabChange("search")}
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
