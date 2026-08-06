import { useCallback, useEffect, useState } from "react";
import { useLatest } from "react-use";
import { c } from "ttag";

import { Box } from "metabase/ui";

import S from "./TreeLoadMore.module.css";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";

/** How far below the fold the end of a level can be and still start loading the next page. */
const PREFETCH_DISTANCE = 300;

/**
 * The scrolling box the tree sits in, or `null` when nothing between here and the viewport scrolls.
 *
 * The end of the list is measured against this box. An observer left to default watches the viewport instead, and a
 * margin against the viewport buys nothing: this box clips the sentinel out of the picture first, and that clipping
 * is not widened by the margin.
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
 * The end of a level the server cut short: loads the next page as it comes into reach, and says how much of the
 * level is on screen.
 *
 * There is no button, reaching the bottom of the list is the whole gesture. Where that bottom is gets measured
 * rather than observed, because an observer only reports the moments the end crosses in or out of view, and a fast
 * scroll can carry it across between two frames with nothing reported at all.
 */
export function TreeLoadMore({
  depth,
  isLoading,
  remaining = 0,
  total = 0,
  onLoadMore,
}: {
  depth: number;
  isLoading: boolean;
  /** How many rows the level holds beyond the ones already rendered. */
  remaining?: number;
  /** How many rows the level holds in all. */
  total?: number;
  onLoadMore: () => void;
}) {
  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);
  const loadMoreRef = useLatest(onLoadMore);

  const measure = useCallback(() => {
    const scroller = sentinel && findScrollingAncestor(sentinel);
    // Without layout there is nothing to measure, which is also the case under jsdom.
    if (!sentinel || !scroller || scroller.clientHeight === 0) {
      return;
    }
    const distanceBelowFold =
      sentinel.getBoundingClientRect().top -
      scroller.getBoundingClientRect().bottom;
    if (distanceBelowFold < PREFETCH_DISTANCE) {
      loadMoreRef.current();
    }
  }, [sentinel, loadMoreRef]);

  useEffect(() => {
    const scroller = sentinel && findScrollingAncestor(sentinel);
    if (!scroller || isLoading) {
      return;
    }
    // Listening whatever the box measures right now: it may have no height yet, and `measure` is the one that
    // decides whether there is anything to read from it.
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => scroller.removeEventListener("scroll", measure);
  }, [sentinel, isLoading, measure]);

  return (
    <>
      <Box
        component="li"
        ref={setSentinel}
        className={S.sentinel}
        role="presentation"
        data-testid="tree-load-more"
      />
      {isLoading && <TreeNodeSkeleton depth={depth} />}
      {remaining > 0 && (
        <Box
          component="li"
          role="presentation"
          className={S.count}
          style={{ paddingLeft: `${depth}rem` }}
          data-testid="tree-level-count"
        >
          {c("{0} is how many rows are shown, {1} how many there are in all")
            .t`${total - remaining} of ${total}`}
        </Box>
      )}
    </>
  );
}
