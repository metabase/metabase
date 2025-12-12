import { Skeleton, rem } from "metabase/ui";

interface TreeTableLoadingRowProps {
  width?: number;
}

const DEFAULT_LOADING_WIDTH = 150;

export function TreeTableLoadingRow({
  width = DEFAULT_LOADING_WIDTH,
}: TreeTableLoadingRowProps) {
  return <Skeleton height={rem(16)} width={width} radius="sm" />;
}
