import { useState } from "react";

import { useSearchQuery } from "metabase/api";
import { Card, Input, Tabs } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { VisualizerMetricsList } from "./VisualizerMetricsList";
import { VisualizerModelsList } from "./VisualizerModelsList";
import { VisualizerRecentsList } from "./VisualizerRecentsList";

export function VisualizerMenu({
  setUsed,
}: {
  setUsed: (used: SearchResult) => void;
}) {
  const [searchQuery, setSearchQuery] = useState<string>();
  const { data: searchResults } = useSearchQuery({
    q: searchQuery,
  });

  return (
    <Card>
      <Input
        placeholder="Search"
        value={searchQuery}
        onChange={ev => setSearchQuery(ev.target.value)}
      />

      {searchQuery ? (
        <div>
          <pre>{JSON.stringify(searchResults?.data, null, 2)}</pre>
        </div>
      ) : (
        <>
          <Tabs>
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
