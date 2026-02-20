import { useForceUpdate } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import { msgid, ngettext } from "ttag";

import { Progress, Stack, Text } from "metabase/ui";
import { useGetReplaceSourceRunQuery } from "metabase-enterprise/api/replacement";
import type { ReplaceSourceRun, ReplaceSourceRunId } from "metabase-types/api";

const POLLING_INTERVAL = 1000;

type ProgressModalContentProps = {
  runId: ReplaceSourceRunId;
  onReplaceSuccess: () => void;
  onReplaceFailure: () => void;
};

export function ProgressModalContent({
  runId,
  onReplaceSuccess,
  onReplaceFailure,
}: ProgressModalContentProps) {
  const { data: run } = useGetReplaceSourceRunQuery(runId, {
    pollingInterval: POLLING_INTERVAL,
  });
  const elapsedSeconds = useElapsedSeconds();

  useEffect(() => {
    if (run != null && run.status !== "started") {
      if (run.status === "succeeded") {
        onReplaceSuccess();
      } else {
        onReplaceFailure();
      }
    }
  }, [run, onReplaceSuccess, onReplaceFailure]);

  return (
    <Stack gap="sm">
      <Text c="text-secondary">{getProgressLabel(elapsedSeconds)}</Text>
      <Progress value={getProgressValue(run)} />
    </Stack>
  );
}

function getProgressValue(run: ReplaceSourceRun | undefined): number {
  if (run == null) {
    return 0;
  }
  return run.progress * 100;
}

function getProgressLabel(elapsedSeconds: number): string {
  return ngettext(
    msgid`It's been ${elapsedSeconds} second so far`,
    `It's been ${elapsedSeconds} seconds so far`,
    elapsedSeconds,
  );
}

function useElapsedSeconds(): number {
  const startTimeRef = useRef(new Date());
  const elapsedSecondsRef = useRef(0);
  const update = useForceUpdate();

  useEffect(() => {
    let handle: number;
    function tick() {
      const startTime = startTimeRef.current;
      const currentTime = new Date();
      const elapsedSeconds = getElapsedSeconds(startTime, currentTime);
      if (elapsedSecondsRef.current !== elapsedSeconds) {
        elapsedSecondsRef.current = elapsedSeconds;
        update();
      }
      handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [update]);

  return elapsedSecondsRef.current;
}

function getElapsedSeconds(startTime: Date, currentTime: Date): number {
  return Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);
}
