import { DependencyList, useCallback, useRef, useState } from "react";
import useMountedState from "metabase/core/hooks/use-mounted-state";

interface AsyncInitialState {
  data?: undefined;
  error?: undefined;
  isLoading: boolean;
}

interface AsyncLoadedState<T> {
  data: T;
  error?: undefined;
  isLoading: false;
}

interface AsyncLoadingState<T> {
  data?: T;
  error?: Error;
  isLoading: true;
}

interface AsyncErrorState {
  data?: undefined;
  error: Error;
  isLoading: false;
}

export type AsyncState<T> =
  | AsyncInitialState
  | AsyncLoadingState<T>
  | AsyncErrorState
  | AsyncLoadedState<T>;

export type AsyncFnReturn<T extends (...args: any[]) => any> = [
  T,
  AsyncState<Awaited<ReturnType<T>>>,
];

const useAsyncFn = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  deps: DependencyList = [],
  initialState: AsyncState<Awaited<ReturnType<T>>> = { isLoading: false },
): AsyncFnReturn<T> => {
  const isMounted = useMountedState();
  const callIdRef = useRef(0);
  const [state, setState] = useState(initialState);

  const handleLoad = useCallback((...args: Parameters<T>) => {
    const callId = ++callIdRef.current;

    if (!state.isLoading) {
      setState(prevState => ({ ...prevState, isLoading: true }));
    }

    return fn(...args).then(
      (data: Awaited<ReturnType<T>>) => {
        if (isMounted() && callId === callIdRef.current) {
          setState({ data, isLoading: false });
        }

        return data;
      },
      (error: Error) => {
        if (isMounted() && callId === callIdRef.current) {
          setState({ error, isLoading: false });
        }

        throw error;
      },
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return [handleLoad as T, state];
};

export default useAsyncFn;
