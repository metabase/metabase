import { useEffect, useRef, useState } from "react";

type ReferenceFetchState = {
  loading: boolean;
  loadingError: unknown;
};

const INITIAL: ReferenceFetchState = { loading: true, loadingError: null };

/**
 * Tracks a one-shot fetch for the reference pages whose data comes from a
 * thunk rather than an RTK Query hook.
 *
 * Starts as loading, so the page renders its loading state on the first pass
 * rather than committing once with no data. See DEV-2430.
 */
export function useReferenceFetch(run: () => unknown): ReferenceFetchState {
  const [state, setState] = useState<ReferenceFetchState>(INITIAL);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    let isCancelled = false;

    // `dispatch` of a thunk is typed as `unknown`, and some of these fetches
    // are synchronous, so normalise before attaching handlers.
    Promise.resolve(runRef.current())
      .then(() => {
        if (!isCancelled) {
          setState({ loading: false, loadingError: null });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          console.error(error);
          setState({ loading: false, loadingError: error });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return state;
}
