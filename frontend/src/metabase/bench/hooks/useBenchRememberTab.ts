import { useCallback } from "react";

const LAST_VIEWED_BENCH_TAB = "metabase-bench-last-viewed-tab";

export const useRememberBenchTab = () => {
  return {
    setTab: useCallback((tabId: string) => {
      localStorage.setItem(LAST_VIEWED_BENCH_TAB, tabId);
    }, []),
    getTab: useCallback(() => localStorage.getItem(LAST_VIEWED_BENCH_TAB), []),
  };
};
