import { useIntersection } from "@mantine/hooks";
import { useEffect } from "react";

import { Box } from "metabase/ui";

import S from "./TreeLoadMore.module.css";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";

/**
 * Marks the end of a level the server cut short, and loads the next page once it is on screen.
 *
 * There is no button: reaching the bottom of the list is the whole gesture. The element still occupies a sliver of
 * height so that it can be observed at all, and turns into skeleton rows while the next page is in flight.
 */
export function TreeLoadMore({
  depth,
  isLoading,
  onLoadMore,
}: {
  depth: number;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const { ref, entry } = useIntersection<HTMLLIElement>({ threshold: 0 });
  const isInView = entry?.isIntersecting ?? false;

  useEffect(() => {
    if (isInView && !isLoading) {
      onLoadMore();
    }
  }, [isInView, isLoading, onLoadMore]);

  return (
    <>
      <Box
        component="li"
        ref={ref}
        className={S.sentinel}
        role="presentation"
        data-testid="tree-load-more"
      />
      {isLoading && <TreeNodeSkeleton depth={depth} />}
    </>
  );
}
