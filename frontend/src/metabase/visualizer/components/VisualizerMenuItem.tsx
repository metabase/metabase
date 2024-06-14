import { Box } from "metabase/ui";

export function VisualizerMenuItem({ item }: { item: any }) {
  return <Box>{item.displayName || item.name}</Box>;
}
