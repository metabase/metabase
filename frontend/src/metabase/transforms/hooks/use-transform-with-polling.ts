import { useEffect, useRef, useState } from "react";

import { skipToken, useGetTransformQuery } from "metabase/api";
import type { Transform } from "metabase-types/api";

import { POLLING_INTERVAL } from "../constants";
import {
  isTransformCanceling,
  isTransformRunning,
  isTransformSyncing,
} from "../utils";

const isPollingNeeded = (transform?: Transform) =>
  transform != null &&
  (isTransformRunning(transform) ||
    isTransformCanceling(transform) ||
    isTransformSyncing(transform));

export const useTransformWithPolling = (transformId: number | undefined) => {
  const [isPolling, setIsPolling] = useState(false);
  const wasPolling = useRef(false);

  const {
    data: transform,
    isLoading,
    error,
    refetch,
  } = useGetTransformQuery(transformId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  if (isPolling !== isPollingNeeded(transform)) {
    setIsPolling(isPollingNeeded(transform));
  }

  // When polling stops (run just finished), do a delayed refetch to pick up
  // post-execution changes like the updated checkpoint watermark.
  useEffect(() => {
    if (wasPolling.current && !isPolling) {
      const timer = setTimeout(() => refetch(), POLLING_INTERVAL);
      return () => clearTimeout(timer);
    }
    wasPolling.current = isPolling;
  }, [isPolling, refetch]);

  return { transform, isLoading, error };
};
