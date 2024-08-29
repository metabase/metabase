import { Icon, Tabs } from "metabase/ui";

import type { EntityTab, EntityTabRenderProps } from "../../types";

interface Props<Model extends string> {
  selectedTab: Model | "recents" | "search";
  tabs: EntityTab<Model | "recents" | "search">[];
  onItemSelect: EntityTabRenderProps["onItemSelect"];
  onTabChange: (model: Model | "recents" | "search") => void;
}

export const TabsView = <Model extends string>({
  selectedTab,
  tabs,
  onItemSelect,
  onTabChange,
}: Props<Model>) => {
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
            {tab.render({ onItemSelect })}
          </Tabs.Panel>
        );
      })}
    </Tabs>
  );
};
