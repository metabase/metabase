import { DependencyList, useEffect } from "react";
import useAsyncFn from "metabase/core/hooks/use-async-fn";

const useAsync = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  deps: DependencyList,
) => {
  const [load, state] = useAsyncFn(fn, deps, { loading: true });

  useEffect(() => {
    load();
  }, [load]);

  return state;
};

export default useAsync;
