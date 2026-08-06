import { useIntersection } from "@mantine/hooks";
import { useEffect } from "react";

import { Box } from "metabase/ui";

import S from "./TreeLoadMore.module.css";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";

/** How far below the fold the end of a level can be and still start loading the next page. */
const PREFETCH_DISTANCE = 300;

/** Height of one tree row, which the reserved space is a multiple of. Matches `TreeNode` and `TreeNodeSkeleton`. */
const ROW_HEIGHT = 32;

/**
 * Marks the end of a level the server cut short, and loads the next page once it is on screen.
 *
 * There is no button: reaching the bottom of the list is the whole gesture. The rows the level still holds are given
 * their height straight away, so the list is as tall as it will ever be and its scrollbar does not move as pages
 * arrive. Each page swaps its share of that reserved height for real rows.
 */
export function TreeLoadMore({
  depth,
  isLoading,
  pageSize = 0,
  remaining = 0,
  onLoadMore,
}: {
  depth: number;
  isLoading: boolean;
  /** How many rows the next page brings, shown as placeholders inside the space already reserved for them. */
  pageSize?: number;
  /** How many rows the level holds beyond the ones already rendered. */
  remaining?: number;
  onLoadMore: () => void;
}) {
  const { ref, entry } = useIntersection<HTMLLIElement>({
    // Start fetching while the end of the list is still below the fold, so the next page is usually there by the
    // time the user scrolls to it.
    rootMargin: `${PREFETCH_DISTANCE}px`,
    threshold: 0,
  });
  const isInView = entry?.isIntersecting ?? false;

  useEffect(() => {
    if (isInView && !isLoading) {
      onLoadMore();
    }
  }, [isInView, isLoading, onLoadMore]);

  // The placeholder rows stand in the reserved space rather than adding to it, so showing them moves nothing.
  const placeholderRows = isLoading ? Math.min(pageSize, remaining) : 0;
  const reservedRows = Math.max(remaining - placeholderRows, 0);

  return (
    <>
      <Box
        component="li"
        ref={ref}
        className={S.sentinel}
        role="presentation"
        data-testid="tree-load-more"
      />
      {placeholderRows > 0 && (
        <TreeNodeSkeleton depth={depth} rows={placeholderRows} />
      )}
      {reservedRows > 0 && (
        <Box
          component="li"
          role="presentation"
          style={{ height: `${reservedRows * ROW_HEIGHT}px` }}
          data-testid="tree-reserved-space"
        />
      )}
    </>
  );
}
