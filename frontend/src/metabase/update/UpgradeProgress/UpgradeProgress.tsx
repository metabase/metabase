import { c, t } from "ttag";

import type {
  UpgradeStatusPhase,
  useUpgradeStatus,
} from "metabase/status/hooks/self-upgrade";
import { Progress, Stack, Text } from "metabase/ui";

export function UpgradeProgress({
  status,
}: {
  status: ReturnType<typeof useUpgradeStatus>;
}) {
  const { hasStatus, phase, downloadProgress } = status;
  if (!hasStatus || phase === "done" || phase === "failed") {
    return null;
  }
  const isIndeterminate = downloadProgress == null || phase !== "updating";
  const progress = isIndeterminate ? 100 : Math.round(downloadProgress * 100);
  const description = getDescription(phase, downloadProgress);
  return (
    <Stack w="100%" maw="24rem" gap="md">
      <Text role="status" c="text-secondary-inverse">
        {description}
      </Text>
      <Progress
        value={progress}
        animated={isIndeterminate}
        aria-label={t`Update progress`}
        aria-valuetext={isIndeterminate ? description : `${progress}%`}
      />
    </Stack>
  );
}

function getDescription(phase: UpgradeStatusPhase, progress: number | null) {
  if (phase === "restarting") {
    return t`Restarting…`;
  }
  if (phase === "installing") {
    return t`Installing the new version…`;
  }
  if (progress == null) {
    return t`Downloading the new version…`;
  }
  const percent = Math.round(progress * 100);
  return c("{0} is a percentage").t`Downloading the new version… ${percent}%`;
}

export function getUpdateHeading(phase: UpgradeStatusPhase) {
  if (phase === "done") {
    return t`Update complete`;
  }
  if (phase === "failed") {
    return t`Error updating`;
  }
  return t`Update in progress…`;
}
