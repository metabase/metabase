import { DependencyList, useCallback, useRef, useState } from "react";
import useMountedState from "metabase/core/hooks/use-mounted-state";

interface AsyncInitialState {
  loading: boolean;
  error?: undefined;
  data?: undefined;
}

interface AsyncLoadedState<T> {
  loading: false;
  error?: undefined;
  data: T;
}

interface AsyncLoadingState<T> {
  loading: true;
  error?: Error;
  data?: T;
}

interface AsyncErrorState {
  loading: false;
  error: Error;
  data?: undefined;
}

export type AsyncState<T> =
  | AsyncInitialState
  | AsyncLoadingState<T>
  | AsyncErrorState
  | AsyncLoadedState<T>;

export type AsyncFnReturn<T> = [T, AsyncState<T>];

const useAsyncFn = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  deps: DependencyList = [],
  initialState: AsyncState<T> = { loading: false },
): AsyncFnReturn<T> => {
  const isMounted = useMountedState();
  const callIdRef = useRef(0);
  const [state, setState] = useState(initialState);

  const handleLoad = useCallback((...args: Parameters<T>) => {
    const callId = ++callIdRef.current;

    if (!state.loading) {
      setState(prevState => ({ ...prevState, loading: true }));
    }

    return fn(...args).then(
      (data: Awaited<ReturnType<T>>) => {
        if (isMounted() && callId === callIdRef.current) {
          setState({ data, loading: false });
        }

        return data;
      },
      (error: Error) => {
        if (isMounted() && callId === callIdRef.current) {
          setState({ error, loading: false });
        }

        throw error;
      },
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return [handleLoad as T, state];
};

export default useAsyncFn;
