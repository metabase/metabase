import { t } from "ttag";

import StatusLarge from "metabase/status/components/StatusLarge";
import { StatusListing } from "metabase/status/components/StatusListing";
import type { useUpgradeStatus } from "metabase/status/hooks/self-upgrade";

import { UpgradeCompletion } from "../UpgradeCompletion";
import { UpgradeProgress, getUpdateHeading } from "../UpgradeProgress";

export function GameUpgradeStatus({
  status,
}: {
  status: ReturnType<typeof useUpgradeStatus>;
}) {
  if (!status.hasStatus) {
    return null;
  }
  const isComplete = status.phase === "done" || status.phase === "failed";
  return (
    <StatusListing>
      <StatusLarge
        isActive
        status={{
          title: getUpdateHeading(status.phase),
          items: [
            {
              title: t`Software update`,
              icon: "gear",
              description: isComplete ? (
                <UpgradeCompletion status={status} compact />
              ) : (
                <UpgradeProgress status={status} />
              ),
              isInProgress: !isComplete,
              isCompleted: status.phase === "done",
              isAborted: status.phase === "failed",
            },
          ],
        }}
      />
    </StatusListing>
  );
}
