import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseProgressiveLoaderOptions<T> = {
  items: T[];
  getItemId: (item: T) => string;
  chunkSize: number;
};

export const useProgressiveLoader = <T>({
  items,
  getItemId,
  chunkSize,
}: UseProgressiveLoaderOptions<T>) => {
  const getItemIdRef = useRef(getItemId);
  getItemIdRef.current = getItemId;
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const readyIdsRef = useRef(new Set<string>());

  const chunks = useMemo(() => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      result.push(items.slice(i, i + chunkSize));
    }
    return result;
  }, [items, chunkSize]);

  useEffect(() => {
    readyIdsRef.current = new Set<string>();
    setCurrentChunkIndex(0);
  }, [items]);

  const markItemAsReady = useCallback(
    (id: string) => {
      readyIdsRef.current.add(id);
      setCurrentChunkIndex((prev) => {
        let nextIndex = prev;
        while (nextIndex < chunks.length) {
          const chunk = chunks[nextIndex];
          const allReady = chunk.every((item) =>
            readyIdsRef.current.has(getItemIdRef.current(item)),
          );
          if (!allReady) {
            break;
          }
          nextIndex++;
        }
        return nextIndex === prev ? prev : nextIndex;
      });
    },
    [chunks],
  );

  const visibleItems = useMemo(
    () => items.slice(0, (currentChunkIndex + 1) * chunkSize),
    [items, currentChunkIndex, chunkSize],
  );

  return [visibleItems, markItemAsReady] as const;
};
