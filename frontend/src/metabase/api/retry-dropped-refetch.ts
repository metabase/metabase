import type {
  Middleware,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";
import { isFulfilled, isRejected } from "@reduxjs/toolkit";

import { Api } from "./api";

type QueryThunkArg = {
  forceRefetch?: boolean;
  queryCacheKey: string;
};

function isQueryThunkArg(arg: unknown): arg is QueryThunkArg {
  return (
    typeof arg === "object" &&
    arg !== null &&
    "type" in arg &&
    arg.type === "query" &&
    "queryCacheKey" in arg &&
    typeof arg.queryCacheKey === "string"
  );
}

function getQueryThunkArg(action: unknown): QueryThunkArg | undefined {
  if (!isFulfilled(action) && !isRejected(action)) {
    return undefined;
  }

  const { arg } = action.meta;

  return isQueryThunkArg(arg) ? arg : undefined;
}

/**
 * RTK Query drops an invalidation's refetch while another request for the same
 * cache entry is in flight, so the older response wins and the cache keeps data
 * the server has already replaced. Nothing re-queues it, so hold on to the
 * request that displaced it and refetch once it settles.
 * Works around https://github.com/reduxjs/redux-toolkit/issues/5405.
 */
export const retryDroppedRefetches: Middleware<
  object,
  unknown,
  ThunkDispatch<unknown, unknown, UnknownAction>
> = ({ dispatch }) => {
  const displacedBy = new Map<string, { refetch: () => void }>();

  return (next) => (action) => {
    const result = next(action);
    const arg = getQueryThunkArg(action);

    if (!arg) {
      return result;
    }

    if (isRejected(action) && action.meta.condition) {
      if (arg.forceRefetch && !displacedBy.has(arg.queryCacheKey)) {
        const inFlight = dispatch(Api.util.getRunningQueriesThunk()).find(
          (query) => query.queryCacheKey === arg.queryCacheKey,
        );

        if (inFlight) {
          displacedBy.set(arg.queryCacheKey, inFlight);
        }
      }

      return result;
    }

    const dropped = displacedBy.get(arg.queryCacheKey);

    if (dropped) {
      displacedBy.delete(arg.queryCacheKey);
      dropped.refetch();
    }

    return result;
  };
};
