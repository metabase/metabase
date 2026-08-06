import { useCallback, useEffect, useState } from "react";
import { useLatest } from "react-use";

import { Box } from "metabase/ui";

import S from "./TreeLoadMore.module.css";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";

/** How far below the fold the end of a level can be and still start loading the next page. */
const PREFETCH_DISTANCE = 300;

/** Height of one tree row, which the reserved space is a multiple of. Matches `TreeNode` and `TreeNodeSkeleton`. */
export const ROW_HEIGHT = 32;

/**
 * The scrolling box the tree sits in, or `null` when nothing between here and the viewport scrolls.
 *
 * Everything here is measured against this box. Left to default, an observer watches the viewport instead, and a
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
 * The end of a level, and the height of everything in it the reader has not read.
 *
 * Reserving that height makes the list as tall as it will ever be, so its scrollbar does not move as pages arrive.
 * It also means the reader can scroll to a part of the level that was never fetched, which is most of it: a level
 * the size of this instance reserves close to a million pixels, and the whole of that is reachable with a flick.
 *
 * So loading follows the scroll position rather than the end of the list. Reaching the end grows the level by a
 * page, which is the ordinary case. Landing somewhere in the reserved space instead reads the page that covers it,
 * which is one request wherever the reader ends up.
 */
export function TreeLoadMore({
  depth,
  isLoading,
  pageSize = 0,
  startOffset = 0,
  loadedCount,
  remaining = 0,
  onLoadMore,
  onJumpTo,
}: {
  depth: number;
  isLoading: boolean;
  /** How many rows the next page brings, shown as placeholders inside the space already reserved for them. */
  pageSize?: number;
  /** Rows of this level sitting above the ones rendered. */
  startOffset?: number;
  /** How many rows of this level are rendered. */
  loadedCount: number;
  /** Rows of this level sitting below the ones rendered. */
  remaining?: number;
  onLoadMore: () => void;
  /** Reads the page covering a row of this level, wherever in it the reader has scrolled to. */
  onJumpTo?: (rowIndex: number) => void;
}) {
  const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);
  const loadMoreRef = useLatest(onLoadMore);
  const jumpToRef = useLatest(onJumpTo);

  const measure = useCallback(() => {
    const list = sentinel?.parentElement;
    const scroller = sentinel && findScrollingAncestor(sentinel);
    // Without layout there is nothing to measure, which is also the case under jsdom.
    if (!sentinel || !list || !scroller || scroller.clientHeight === 0) {
      return;
    }

    const fold = scroller.getBoundingClientRect().top;
    const sentinelTop = sentinel.getBoundingClientRect().top;

    // The rows above the window are reserved as padding on the list itself, so the list starts that many rows before
    // its first rendered row.
    const windowTop = list.getBoundingClientRect().top;
    const rowsAbove = (fold - windowTop) / ROW_HEIGHT;
    if (startOffset > 0 && rowsAbove < startOffset) {
      jumpToRef.current?.(Math.floor(rowsAbove));
      return;
    }

    // Past the end by more than a page, so growing the level would be several requests to reach the reader. Under
    // that, growing it is both cheaper and keeps the rows they scrolled through.
    const rowsBelow = (fold - sentinelTop) / ROW_HEIGHT;
    if (remaining > 0 && rowsBelow > pageSize) {
      jumpToRef.current?.(startOffset + loadedCount + Math.floor(rowsBelow));
      return;
    }

    if (
      sentinelTop - scroller.getBoundingClientRect().bottom <
      PREFETCH_DISTANCE
    ) {
      loadMoreRef.current();
    }
  }, [
    sentinel,
    pageSize,
    startOffset,
    loadedCount,
    remaining,
    jumpToRef,
    loadMoreRef,
  ]);

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

  // The placeholder rows stand in the reserved space rather than adding to it, so showing them moves nothing.
  const placeholderRows = isLoading ? Math.min(pageSize, remaining) : 0;
  const reservedRows = Math.max(remaining - placeholderRows, 0);

  return (
    <>
      <Box
        component="li"
        ref={setSentinel}
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
