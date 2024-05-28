import type { FC, ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";

const defaultIncreaseFunction = (prev: number) => {
  const increasedValue = prev * 1.5;
  return increasedValue > 300 ? prev + 300 : Math.floor(increasedValue);
};

type NoProps = Record<string, never>;

/** Lazily render a list of items in chunks */
export const RenderGradually = <T,>({
  items,
  children,
  Loading,
  key,
  increaseFunction = defaultIncreaseFunction,
  initialBatchSize = 30,
  wait = 1000,
  enabled = true,
}: {
  items: T[];
  children: (items: T[]) => ReactNode;
  Loading: FC<NoProps>;
  key?: string;
  initialBatchSize?: number;
  increaseFunction?: (prev: number) => number;
  wait?: number;
  enabled?: boolean;
}) => {
  if (!enabled) {
    initialBatchSize = items.length;
  }
  const [visibleItems, setVisibleItems] = useState([] as T[]);
  useEffect(() => {
    setVisibleItems(items.slice(0, initialBatchSize));
  }, [items, initialBatchSize]);

  useEffect(() => {
    if (visibleItems.length >= items.length) {
      return;
    }
    const timerId = setInterval(() => {
      setVisibleItems(prev => {
        if (prev.length >= items.length) {
          return prev;
        }
        return items.slice(0, increaseFunction(prev.length));
      });
    }, wait);
    return () => clearInterval(timerId);
  }, [visibleItems.length, items, increaseFunction, wait]);

  return (
    <Fragment key={key}>
      {children(visibleItems)}
      {visibleItems.length < items.length && <Loading />}
    </Fragment>
  );
};
