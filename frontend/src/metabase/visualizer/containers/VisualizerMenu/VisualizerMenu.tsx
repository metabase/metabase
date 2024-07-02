import { useState } from "react";

import { useSearchQuery } from "metabase/api";
import { Card, Input, Tabs } from "metabase/ui";
import { VisualizerMenuItem } from "metabase/visualizer/components/VisualizerMenuItem";
import type { Card as ICard } from "metabase-types/api";

import { VisualizerMetricsList } from "./VisualizerMetricsList";
import { VisualizerModelsList } from "./VisualizerModelsList";
import { VisualizerRecentsList } from "./VisualizerRecentsList";

export function VisualizerMenu({
  setUsed,
}: {
  setUsed: (card: ICard) => void;
}) {
  const [searchQuery, setSearchQuery] = useState<string>();
  const { data: searchResults } = useSearchQuery({
    q: searchQuery,
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
            <VisualizerMenuItem item={item} key={index} onClick={setUsed} />
          ))}
        </div>
      ) : (
        <>
          <Tabs defaultValue="metrics">
            <Tabs.List>
              <Tabs.Tab value="metrics">Metrics</Tabs.Tab>
              <Tabs.Tab value="models">Models</Tabs.Tab>
              <Tabs.Tab value="recents">Recents</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="metrics">
              <VisualizerMetricsList />
            </Tabs.Panel>
            <Tabs.Panel value="models">
              <VisualizerModelsList onClick={setUsed} />
            </Tabs.Panel>
            <Tabs.Panel value="recents">
              <VisualizerRecentsList onClick={setUsed} />
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Card>
  );
}
