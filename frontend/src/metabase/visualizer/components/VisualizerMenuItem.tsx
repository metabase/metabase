import { Box } from "metabase/ui";

export function VisualizerMenuItem({
  item,
  onClick,
}: {
  item: any;
  onClick: (item: any) => void;
}) {
  return (
    <Box onClick={() => onClick(item)}>{item.displayName || item.name}</Box>
  );
}
