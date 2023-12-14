import { Tabs } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

import {
  EntityPickerSearchTab,
  EntityPickerSearchResults,
} from "../../EntityPickerSearch";

import { tabOptions } from "../../utils";

import type { EntityPickerModalOptions } from "../../types";

type ValidTab = keyof typeof tabOptions;

export const TabsView = ({
  tabs,
  onItemSelect,
  value,
  options,
  searchQuery,
  searchResults,
  selectedItem,
}: {
  tabs: ValidTab[];
  onItemSelect: (item: any) => void;
  value?: any;
  options: EntityPickerModalOptions;
  searchQuery: string;
  searchResults: any[] | null;
  selectedItem: any;
}) => {
  const hasSearchTab = !!searchQuery;
  const defaultTab = hasSearchTab ? "search" : tabs[0];

  return (
    <Tabs
      defaultValue={defaultTab}
      style={{
        flexGrow: 1,
        height: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Tabs.List px="md">
        {tabs.map(tabName => {
          const { label } = tabOptions[tabName];

          return (
            <Tabs.Tab
              key={tabName}
              value={tabName}
              icon={<Icon name={tabName} />}
            >
              {label}
            </Tabs.Tab>
          );
        })}
        {hasSearchTab && (
          <EntityPickerSearchTab
            searchResults={searchResults}
            searchQuery={searchQuery}
          />
        )}
      </Tabs.List>

      {tabs.map(tabName => {
        const { component: TabComponent } = tabOptions[tabName];

        return (
          <Tabs.Panel
            key={tabName}
            value={tabName}
            style={{
              flexGrow: 1,
              height: 0,
            }}
          >
            <TabComponent
              onItemSelect={onItemSelect}
              value={value}
              options={options}
            />
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
