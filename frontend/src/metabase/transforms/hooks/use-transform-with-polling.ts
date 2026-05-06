import { useState } from "react";

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

  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  if (isPolling !== isPollingNeeded(transform)) {
    setIsPolling(isPollingNeeded(transform));
  }

  return { transform, isLoading, error };
};
