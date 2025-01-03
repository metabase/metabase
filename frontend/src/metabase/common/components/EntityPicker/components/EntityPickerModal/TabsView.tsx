import { Flex, Icon, Tabs } from "metabase/ui";
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
      <Flex
        justify="space-between"
        align="center"
        px="2.5rem"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
        }}
        pb="1px" // Keeps the selected tab underline above the border
      >
        <Tabs.List
          h="2.5rem"
          style={{
            borderBottom: "none",
          }}
        >
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
        {tabs.find(tab => tab.id === selectedTabId)?.extraButtons || null}
      </Flex>

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
