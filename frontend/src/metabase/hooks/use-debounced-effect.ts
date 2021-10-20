import { useEffect } from "react";

type AsyncFn = (...args: any[]) => Promise<any>;

export function useDebouncedEffect(fn: AsyncFn, deps: any[], wait: number) {
  useEffect(
    () => {
      const timeout = setTimeout(fn, wait);

      return () => clearTimeout(timeout);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps ? [...deps, wait] : [wait],
  );
}
