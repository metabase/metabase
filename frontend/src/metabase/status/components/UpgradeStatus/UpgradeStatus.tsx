/* eslint-disable metabase/no-literal-metabase-strings -- The panel is only rendered for admins and names the product being upgraded */
import { c, t } from "ttag";

import { useGetVersionInfoQuery } from "metabase/settings";
import { Button } from "metabase/ui";
import { reload } from "metabase/utils/dom";
import { formatVersion } from "metabase/utils/version";

import useStatusVisibility from "../../hooks/use-status-visibility";
import StatusLarge from "../StatusLarge";

import {
  type UpgradeStatusPhase,
  useUpgradeStatus,
} from "./use-upgrade-status";

export const UpgradeStatus = () => {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const targetVersion = versionInfo?.latest?.version;
  const {
    hasStatus,
    phase,
    downloadProgress,
    newVersion,
    errorMessage,
    reset,
  } = useUpgradeStatus(targetVersion);
  const isVisible = useStatusVisibility(hasStatus);

  if (!isVisible || !hasStatus) {
    return null;
  }

  const isInProgress = phase !== "done" && phase !== "failed";
  const status = {
    title: getTitle(phase),
    items: [
      {
        title: getItemTitle(targetVersion),
        icon: "gear",
        description: getDescription({
          phase,
          downloadProgress,
          newVersion,
          errorMessage,
        }),
        isInProgress,
        isCompleted: phase === "done",
        isAborted: phase === "failed",
      },
    ],
  };

  return (
    <StatusLarge
      status={status}
      isActive={hasStatus}
      onDismiss={isInProgress ? undefined : reset}
    />
  );
};

function getTitle(phase: UpgradeStatusPhase) {
  switch (phase) {
    case "done":
      return t`Done!`;
    case "failed":
      return t`Error updating`;
    default:
      return t`Updating Metabase…`;
  }
}

function getItemTitle(targetVersion: string | undefined) {
  if (!targetVersion) {
    return t`Metabase`;
  }
  return c("{0} is a version number")
    .t`Metabase ${formatVersion(targetVersion)}`;
}

function getDescription({
  phase,
  downloadProgress,
  newVersion,
  errorMessage,
}: {
  phase: UpgradeStatusPhase;
  downloadProgress: number | null;
  newVersion: string | null;
  errorMessage: string | undefined;
}) {
  switch (phase) {
    case "updating":
      return getDownloadDescription(downloadProgress);
    case "installing":
      return t`Installing the new version…`;
    case "restarting":
      return t`Restarting Metabase…`;
    case "done":
      return <DoneDescription newVersion={newVersion} />;
    case "failed":
      return errorMessage ?? t`Update failed`;
  }
}

function getDownloadDescription(downloadProgress: number | null) {
  if (downloadProgress == null) {
    return t`Downloading the new version…`;
  }
  const percent = Math.round(downloadProgress * 100);
  return c("{0} is a percentage").t`Downloading the new version… ${percent}%`;
}

function DoneDescription({ newVersion }: { newVersion: string | null }) {
  const displayVersion = formatVersion(newVersion ?? "");
  return (
    <>
      {c("{0} is a version number")
        .t`Updated to Metabase ${displayVersion}. Reload to use it.`}{" "}
      <Button variant="subtle" size="compact-xs" p={0} onClick={reload}>
        {t`Reload`}
      </Button>
    </>
  );
}
