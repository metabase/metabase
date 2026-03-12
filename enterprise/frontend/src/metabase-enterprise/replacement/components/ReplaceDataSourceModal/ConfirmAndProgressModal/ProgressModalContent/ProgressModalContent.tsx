import { useForceUpdate } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import { msgid, ngettext } from "ttag";

import { Api } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { Progress, Stack, Text } from "metabase/ui";
import { useGetSourceReplacementRunQuery } from "metabase-enterprise/api/replacement";
import type {
  SourceReplacementRun,
  SourceReplacementRunId,
} from "metabase-types/api";

import { INVALIDATE_TAGS } from "../../constants";

const POLLING_INTERVAL = 1000;

type ProgressModalContentProps = {
  runId: SourceReplacementRunId;
  onReplaceSuccess: () => void;
  onReplaceFailure: () => void;
};

export function ProgressModalContent({
  runId,
  onReplaceSuccess,
  onReplaceFailure,
}: ProgressModalContentProps) {
  const { data: run } = useGetSourceReplacementRunQuery(runId, {
    pollingInterval: POLLING_INTERVAL,
  });
  const elapsedSeconds = useElapsedSeconds();
  const dispatch = useDispatch();

  useEffect(() => {
    if (run != null && run.status !== "started") {
      dispatch(Api.util.invalidateTags(INVALIDATE_TAGS));
      if (run.status === "succeeded") {
        onReplaceSuccess();
      } else {
        onReplaceFailure();
      }
    }
  }, [run, dispatch, onReplaceSuccess, onReplaceFailure]);

  return (
    <Stack gap="sm">
      <Text c="text-secondary">{getProgressLabel(elapsedSeconds)}</Text>
      <Progress value={getProgressValue(run)} />
    </Stack>
  );
}

function getProgressValue(run: SourceReplacementRun | undefined): number {
  if (run == null || run.progress == null) {
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
