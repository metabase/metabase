import { useIntersection } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import { Box } from "metabase/ui";

import S from "./TreeLoadMore.module.css";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";

/** How far below the fold the end of a level can be and still start loading the next page. */
const PREFETCH_DISTANCE = 300;

/** Height of one tree row, which the reserved space is a multiple of. Matches `TreeNode` and `TreeNodeSkeleton`. */
const ROW_HEIGHT = 32;

/**
 * How far the end of a level may sit *above* the fold and still load the next page, counted in pages.
 *
 * Reserving the whole level's height means the reader can scroll past the end of what is loaded. A fast scroll can
 * also carry that end clean through the viewport between two frames, so the observer only ever sees it leave. Either
 * way the list would sit there with nothing to bring it back. Reaching this far up instead lets it catch up, one
 * page per request, until the loaded end is back under the reader.
 */
const CATCH_UP_PAGES = 10;

/**
 * The scrolling box the tree sits in, or `null` when nothing between here and the viewport scrolls.
 *
 * An observer has to be told which box to watch. Left to default it watches the viewport, and a margin against the
 * viewport buys nothing: a scrolling ancestor clips the sentinel out of the picture first, and that clipping is not
 * widened by the margin. So the sentinel would only ever register while genuinely on screen, which is exactly when
 * it is too late to load ahead or to catch up.
 */
function findScrollingAncestor(element: Element): Element | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
  }
  return null;
}

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
  const [scrollingAncestor, setScrollingAncestor] = useState<Element | null>(
    null,
  );
  const catchUpDistance = pageSize * ROW_HEIGHT * CATCH_UP_PAGES;
  const { ref, entry } = useIntersection<HTMLLIElement>({
    root: scrollingAncestor,
    // Below the fold: start fetching early, so the next page is usually there by the time the reader arrives.
    // Above it: keep fetching after the reader has gone past, so the list can catch up rather than stall.
    rootMargin: `${catchUpDistance}px 0px ${PREFETCH_DISTANCE}px 0px`,
    threshold: 0,
  });
  const isInView = entry?.isIntersecting ?? false;

  // Resolved from the sentinel itself, which is the only way to know what it hangs under. Setting it re-runs this
  // callback with the observer rebuilt around the right box.
  const observeSentinel = useCallback(
    (element: HTMLLIElement | null) => {
      if (element) {
        setScrollingAncestor(findScrollingAncestor(element));
      }
      ref(element);
    },
    [ref],
  );

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
        ref={observeSentinel}
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
