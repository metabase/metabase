import { Card } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

export function VisualizerCanvas({
  used,
}: {
  used: SearchResult[] | undefined;
}) {
  return (
    <Card w="100%" h="100%">
      Visualizer canvas would show {used?.map(u => u.name)}
    </Card>
  );
}
