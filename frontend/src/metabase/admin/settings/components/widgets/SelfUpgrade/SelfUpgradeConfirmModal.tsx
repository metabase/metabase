import { c, t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { formatVersion } from "metabase/utils/version";

import { getUpgradeGuideUrl } from "./utils";

interface SelfUpgradeConfirmModalProps {
  opened: boolean;
  targetVersion: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function SelfUpgradeConfirmModal({
  opened,
  targetVersion,
  onConfirm,
  onClose,
}: SelfUpgradeConfirmModalProps) {
  const displayVersion = formatVersion(targetVersion);
  const upgradeGuideLink = (
    <ExternalLink key="upgrade-guide" href={getUpgradeGuideUrl(targetVersion)}>
      {t`upgrade guide`}
    </ExternalLink>
  );

  return (
    <ConfirmModal
      opened={opened}
      title={c("{0} is a version number")
        .t`Update to Metabase ${displayVersion}?`}
      content={c("{0} is a link to the upgrade guide")
        .jt`Metabase will download the latest version and restart on it. It will be unavailable for a while, possibly several minutes, and anyone using it will be interrupted. See the ${upgradeGuideLink} for details.`}
      message={t`Make sure you have a recent backup of your application database before continuing.`}
      confirmButtonText={t`Update now`}
      confirmButtonProps={{ color: "brand" }}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
