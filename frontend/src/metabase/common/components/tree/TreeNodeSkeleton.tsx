import { useEffect, useState } from "react";

import { Box, Skeleton } from "metabase/ui";

import S from "./TreeNodeSkeleton.module.css";

const DEFAULT_ROW_COUNT = 2;

/**
 * How long a fetch has to be outstanding before it is worth telling the user about. Most of these finish well inside
 * this, whether from the cache, a prefetch, or a level the server sent ahead of time, and showing placeholder rows
 * for a frame or two reads as a flicker rather than as loading.
 */
const DELAY_BEFORE_SHOWING = 250;

/**
 * Placeholder rows shown while a lazily loaded node fetches its children, once the fetch has taken long enough to be
 * worth acknowledging. Callers that know how many rows are coming pass `rows`, so the list reserves the space they
 * will take rather than growing under the pointer when they land.
 */
export function TreeNodeSkeleton({
  depth,
  rows = DEFAULT_ROW_COUNT,
}: {
  depth: number;
  rows?: number;
}) {
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
      {Array.from({ length: rows }, (_, index) => (
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
