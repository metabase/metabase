import type { useUpgradeStatus } from "metabase/status/hooks/self-upgrade";
import { Loader } from "metabase/ui";

import { UpgradeCompletion } from "../UpgradeCompletion";
import { UpgradeProgress, getUpdateHeading } from "../UpgradeProgress";

import S from "./GameUpgradeStatus.module.css";

export function GameUpgradeStatus({
  status,
}: {
  status: ReturnType<typeof useUpgradeStatus>;
}) {
  const isComplete = status.phase === "done" || status.phase === "failed";
  return (
    <header className={S.root}>
      <div className={S.heading}>
        <h1>{getUpdateHeading(status.phase, status.operation)}</h1>
        {!isComplete && <Loader size="lg" aria-hidden />}
      </div>
      <UpgradeProgress status={status} />
      <UpgradeCompletion status={status} inline />
    </header>
  );
}
