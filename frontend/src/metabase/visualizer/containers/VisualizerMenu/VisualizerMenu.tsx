import { useState } from "react";

import { useSearchQuery } from "metabase/api";
import { Card, Input, Tabs } from "metabase/ui";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";
import { canCombineCardWithOthers } from "metabase/visualizer/utils";
import type { Card as ICard, RecentItem, Series } from "metabase-types/api";

import { VisualizerCompatibleCardsList } from "./VisualizerCompatibleCardsList";
import { VisualizerRecentsList } from "./VisualizerRecentsList";

interface VisualizerMenuProps {
  series: Series;
  onAdd: (item: ICard | RecentItem) => void;
  onReplace: (item: ICard | RecentItem) => void;
}

export function VisualizerMenu({
  series,
  onAdd,
  onReplace,
}: VisualizerMenuProps) {
  const [searchQuery, setSearchQuery] = useState<string>();
  const { data: searchResults } = useSearchQuery({
    q: searchQuery,
    models: ["card", "dataset", "metric"],
  });

  const hasCompatibleTab =
    series.length > 0 && canCombineCardWithOthers(series[0].card);

  return (
    <Card h="100%">
      <Input
        placeholder="Search"
        value={searchQuery}
        onChange={ev => setSearchQuery(ev.target.value)}
      />

      {searchQuery ? (
        <div>
          {searchResults?.data.map((item, index) => (
            <VisualizerMenuItem
              item={item}
              key={index}
              onAdd={onAdd}
              onReplace={onReplace}
              isAddable={item.model === "card"}
            />
          ))}
        </div>
      ) : (
        <>
          <Tabs defaultValue="recents">
            <Tabs.List>
              <Tabs.Tab value="recents">Recents</Tabs.Tab>
              {hasCompatibleTab && (
                <Tabs.Tab value="compatible">Compatible</Tabs.Tab>
              )}
            </Tabs.List>
            <Tabs.Panel value="recents">
              <VisualizerRecentsList onAdd={onAdd} onReplace={onReplace} />
            </Tabs.Panel>
            {hasCompatibleTab && (
              <Tabs.Panel value="compatible">
                <VisualizerCompatibleCardsList
                  series={series}
                  onAdd={onAdd}
                  onReplace={onReplace}
                />
              </Tabs.Panel>
            )}
          </Tabs>
        </>
      )}
    </Card>
  );
}
