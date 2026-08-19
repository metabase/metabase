import { useEffect, useState } from "react";

import { Box, Skeleton } from "metabase/ui";

import S from "./TreeNodeSkeleton.module.css";

const SKELETON_ROW_COUNT = 2;

/**
 * How long a fetch has to be outstanding before it is worth telling the user about. Most of these finish well inside
 * this, whether from the cache, a prefetch, or a level the server sent ahead of time, and showing placeholder rows
 * for a frame or two reads as a flicker rather than as loading.
 */
const DELAY_BEFORE_SHOWING = 250;

/**
 * Placeholder rows shown while a lazily loaded node fetches its children, once the fetch has taken long enough to be
 * worth acknowledging.
 */
export function TreeNodeSkeleton({ depth }: { depth: number }) {
  const [isSlowEnough, setIsSlowEnough] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(
      () => setIsSlowEnough(true),
      DELAY_BEFORE_SHOWING,
    );
    return () => clearTimeout(timeout);
  }, []);

  if (!isSlowEnough) {
    return null;
  }

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
