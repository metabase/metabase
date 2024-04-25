import { useInterval } from "@mantine/hooks";
import { useState, useEffect, useRef, useCallback } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { UtilApi } from "metabase/services";
import type { Log } from "metabase-types/api";

import { maybeMergeLogs } from "./utils";

export function usePollingLogsQuery(pollingDurationMs: number) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<any>(null);
  const [logs, setLogs] = useState<Log[]>([]);

  const isMountedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const fetchLogs = async () => {
    if (isFetchingRef.current) {
      console.warn("skipping logs request as a request is currently in flight");
      return;
    }

    try {
      isFetchingRef.current = true;
      const newLogs: Log[] = await UtilApi.logs();
      if (isMountedRef.current) {
        setLoaded(true);
        setError(null);
        setLogs(logs => maybeMergeLogs(logs, newLogs));
        isFetchingRef.current = false;
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.data?.message ?? err.messsage ?? t`An error occurred.`;
      if (isMountedRef.current) {
        setError(msg);
        isFetchingRef.current = false;
      }
    }
  };

  const pollingInterval = useInterval(fetchLogs, pollingDurationMs);

  // keep track of mounted state to avoid settings state after unmount
  // clear timeout that is polling for logs
  useMount(() => {
    isMountedRef.current = true;
    fetchLogs();
    pollingInterval.start();
    return () => {
      isMountedRef.current = false;
      pollingInterval.stop();
    };
  });

  return { loaded, error, logs };
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
