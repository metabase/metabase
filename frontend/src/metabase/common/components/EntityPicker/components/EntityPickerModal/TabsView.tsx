import { Icon, Tabs } from "metabase/ui";
import type { SearchResultId } from "metabase-types/api";

import type {
  EntityPickerTab,
  EntityPickerTabId,
  TypeWithModel,
} from "../../types";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  selectedTabId: EntityPickerTabId;
  tabs: EntityPickerTab<Id, Model, Item>[];
  onItemSelect: (item: Item, tabId: EntityPickerTabId) => void;
  onTabChange: (tabId: EntityPickerTabId) => void;
}

export const TabsView = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  selectedTabId,
  tabs,
  onItemSelect,
  onTabChange,
}: Props<Id, Model, Item>) => {
  return (
    <Tabs
      value={selectedTabId}
      style={{
        flexGrow: 1,
        height: 0,
        display: "flex",
        flexDirection: "column",
      }}
      data-testid="tabs-view"
    >
      <Tabs.List px="1rem">
        {tabs.map(tab => {
          const { id, icon, displayName } = tab;

          return (
            <Tabs.Tab
              key={id}
              value={id}
              icon={<Icon name={icon} />}
              onClick={() => onTabChange(id)}
            >
              {displayName}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>

      {tabs.map(tab => {
        const { id } = tab;

        return (
          <Tabs.Panel
            key={id}
            value={id}
            style={{
              flexGrow: 1,
              height: 0,
            }}
          >
            {tab.render({
              onItemSelect: item => onItemSelect(item, id),
            })}
          </Tabs.Panel>
        );
      })}
    </Tabs>
  );
};
