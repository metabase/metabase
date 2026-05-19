import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useListLogsQuery } from "metabase/api/logger";
import type { Log } from "metabase-types/api";

import { maybeMergeLogs } from "./utils";

export function usePollingLogsQuery(pollingDurationMs: number) {
  const {
    data: newLogs,
    isSuccess,
    error: queryError,
  } = useListLogsQuery(undefined, { pollingInterval: pollingDurationMs });

  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    if (newLogs) {
      setLogs((previousLogs) => maybeMergeLogs(previousLogs, newLogs));
    }
  }, [newLogs]);

  const error = useMemo(() => {
    if (!queryError) {
      return null;
    }
    const errorWithData = queryError as {
      data?: { message?: string };
      message?: string;
    };
    return errorWithData.data?.message ?? errorWithData.message ?? null;
  }, [queryError]);

  return { loaded: isSuccess, error, logs };
}

export function useTailLogs(logs: Log[]) {
  const scrollRef = useRef<any>();
  const shouldAutoFollow = useRef(true);

  function autoFollow() {
    const elem = scrollRef.current;
    if (elem && shouldAutoFollow.current) {
      elem.scrollTop = elem.scrollHeight;
    }
  }

  // auto-follow logs on update
  useEffect(() => {
    if (logs.length) {
      autoFollow();
    }
  }, [logs]);

  // recalculate if we should be auto-following based on if the
  // user is currently scrolled to the bottom of the container
  const onScroll = useCallback(() => {
    const elem = scrollRef.current;
    if (elem) {
      const isAtBottom =
        elem.scrollTop >= elem.scrollHeight - elem.offsetHeight;
      shouldAutoFollow.current = isAtBottom;
    }
  }, []);

  const refollow = () => {
    shouldAutoFollow.current = true;
  };

  return {
    scrollRef,
    onScroll,
    refollow,
  };
}
