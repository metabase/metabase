import { Box, Skeleton } from "metabase/ui";

import S from "./TreeNodeSkeleton.module.css";

const SKELETON_ROW_COUNT = 2;

/**
 * Placeholder rows shown while a lazily loaded node fetches its children.
 */
export function TreeNodeSkeleton({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Box
          key={index}
          component="li"
          role="presentation"
          className={S.row}
          style={{ paddingLeft: `${depth}rem` }}
          data-testid="tree-node-skeleton"
        >
          <Skeleton className={S.icon} />
          <Skeleton className={S.name} />
        </Box>
      ))}
    </>
  );
}
