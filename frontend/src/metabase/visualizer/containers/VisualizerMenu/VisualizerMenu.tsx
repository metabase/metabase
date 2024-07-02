import { useState } from "react";

import { useSearchQuery } from "metabase/api";
import { Card, Input, Tabs } from "metabase/ui";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";
import type { RecentItem } from "metabase-types/api";

import { VisualizerMetricsList } from "./VisualizerMetricsList";
import { VisualizerModelsList } from "./VisualizerModelsList";
import { VisualizerRecentsList } from "./VisualizerRecentsList";

export function VisualizerMenu({
  defaultTab = "metrics",
  onAdd,
  onReplace,
}: {
  onAdd: (item: RecentItem) => void;
  onReplace: (item: RecentItem) => void;
  defaultTab?: "metrics" | "models" | "recents";
}) {
  const [searchQuery, setSearchQuery] = useState<string>();
  const { data: searchResults } = useSearchQuery({
    q: searchQuery,
    models: ["card", "dataset", "metric"],
  });

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
          <Tabs defaultValue={defaultTab}>
            <Tabs.List>
              <Tabs.Tab value="metrics">Metrics</Tabs.Tab>
              <Tabs.Tab value="models">Models</Tabs.Tab>
              <Tabs.Tab value="recents">Recents</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="metrics">
              <VisualizerMetricsList />
            </Tabs.Panel>
            <Tabs.Panel value="models">
              <VisualizerModelsList onReplace={onReplace} />
            </Tabs.Panel>
            <Tabs.Panel value="recents">
              <VisualizerRecentsList onAdd={onAdd} onReplace={onReplace} />
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Card>
  );
}
