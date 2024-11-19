import { t } from "ttag";

import type { LongTaskStatus } from "metabase-types/api";
import type { Download } from "metabase-types/store";

import StatusSmall from "../StatusSmall";
import { isErrored, isInProgress } from "../utils/downloads";
import { getIconName, isSpinnerVisible } from "../utils/status";

export interface DownloadsStatusSmallProps {
  downloads: Download[];
  onExpand?: () => void;
}

export const DownloadsStatusSmall = ({
  downloads,
  onExpand,
}: DownloadsStatusSmallProps): JSX.Element => {
  const status = getStatus(downloads);
  const statusLabel = getStatusLabel(status);
  const hasSpinner = isSpinnerVisible(status);
  const icon = getIconName(status);

  return (
    <StatusSmall
      status={status}
      statusLabel={statusLabel}
      hasSpinner={hasSpinner}
      icon={icon}
      onExpand={onExpand}
    />
  );
};

const getStatus = (downloads: Download[]): LongTaskStatus => {
  if (downloads.some(isInProgress)) {
    return "incomplete";
  } else if (downloads.some(isErrored)) {
    return "aborted";
  } else {
    return "complete";
  }
};

const getStatusLabel = (status: LongTaskStatus): string => {
  switch (status) {
    case "incomplete":
      return t`Downloading…`;
    case "complete":
      return t`Done!`;
    case "aborted":
      return t`Download error`;
  }
};
