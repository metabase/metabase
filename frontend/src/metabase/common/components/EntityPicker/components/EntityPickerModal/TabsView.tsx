import { Icon, Tabs } from "metabase/ui";
import type { SearchResultId } from "metabase-types/api";

import type {
  EntityTab,
  EntityTabRenderProps,
  TypeWithModel,
} from "../../types";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  selectedTab: Model | "recents" | "search";
  tabs: EntityTab<Id, Model | "recents" | "search", Item>[];
  onItemSelect: EntityTabRenderProps<Id, Model, Item>["onItemSelect"];
  onTabChange: (model: Model | "recents" | "search") => void;
}

export const TabsView = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  selectedTab,
  tabs,
  onItemSelect,
  onTabChange,
}: Props<Id, Model, Item>) => {
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
