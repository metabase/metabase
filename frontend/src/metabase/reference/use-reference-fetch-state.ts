import { useEffect, useRef } from "react";

import { useDispatch } from "metabase/redux";

import { clearError, endLoading, setError, startLoading } from "./reference";

/**
 * The reference module keeps its own page-level loading and error state, which
 * its presentational components read from the store. These two hooks are the
 * only bridge between a fetch and that state.
 *
 * Both dispatch the start during render rather than from an effect. The
 * children read `loading` from the store, so it has to be true before their
 * first render. From an effect, even `useLayoutEffect`, the tree commits once
 * with no data and the reference header lays out wrong. See DEV-2430.
 */
function useFetchStart() {
  const dispatch = useDispatch();
  const hasStarted = useRef(false);

  if (!hasStarted.current) {
    hasStarted.current = true;
    dispatch(clearError());
    dispatch(startLoading());
  }
}

/** Drives the page state from an RTK Query result. */
export function useReferenceFetchState({
  isFetching,
  error,
}: {
  isFetching: boolean;
  error: unknown;
}) {
  const dispatch = useDispatch();
  useFetchStart();

  useEffect(() => {
    if (isFetching) {
      return;
    }
    if (error) {
      dispatch(setError(error));
    }
    dispatch(endLoading());
  }, [dispatch, isFetching, error]);
}

/**
 * Drives the page state from a one-shot async fetch, for the pages whose data
 * still comes from a thunk. Runs once on mount, matching the render-phase
 * dispatch it replaced.
 */
export function useReferenceFetch(run: () => unknown) {
  const dispatch = useDispatch();
  useFetchStart();
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    let isCancelled = false;

    // `dispatch` of a thunk is typed as `unknown`, and some of these fetches
    // are synchronous, so normalise before attaching handlers.
    Promise.resolve(runRef.current())
      .catch((error: unknown) => {
        if (!isCancelled) {
          console.error(error);
          dispatch(setError(error));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          dispatch(endLoading());
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [dispatch]);
}
