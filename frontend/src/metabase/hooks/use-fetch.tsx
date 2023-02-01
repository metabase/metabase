import { useEffect, useReducer } from "react";

interface State<TResult> {
  data?: TResult;
  error?: Error;
  isLoading?: boolean;
}

type Action<TResult> =
  | { type: "loading" }
  | { type: "fetched"; payload: TResult }
  | { type: "error"; payload: Error };

const fetchReducer = <TResult,>(
  state: State<TResult>,
  action: Action<TResult>,
) => {
  switch (action.type) {
    case "loading":
      return { isLoading: true, data: undefined, error: undefined };
    case "fetched":
      return {
        ...state,
        data: action.payload,
        error: undefined,
        isLoading: false,
      };
    case "error":
      return { data: undefined, error: action.payload, isLoading: false };
    default:
      return state;
  }
};

const useFetch = <TResult,>(url?: string, options?: RequestInit) => {
  const [state, dispatch] = useReducer(fetchReducer, {
    error: undefined,
    data: undefined,
    isLoading: false,
  });

  useEffect(() => {
    if (url == null) {
      return;
    }

    let isCanceled = false;

    const performFetch = async () => {
      dispatch({ type: "loading" });

      try {
        const response = await fetch(url, options);

        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const data = (await response.json()) as TResult;

        if (!isCanceled) {
          dispatch({ type: "fetched", payload: data });
        }
      } catch (error) {
        if (!isCanceled) {
          dispatch({ type: "error", payload: error as Error });
        }
      }
    };

    performFetch();

    return () => {
      isCanceled = true;
    };
  }, [options, url]);

  return state as State<TResult>;
};

export default useFetch;
