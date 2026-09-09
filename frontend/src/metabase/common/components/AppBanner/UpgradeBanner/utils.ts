import { compareVersions } from "metabase/utils/version";
import type { AlertUpgradeVersion, VersionInfo } from "metabase-types/api";
import { isAlertUpgradeVersion } from "metabase-types/guards/settings";

export function getAlertUpgradeVersion(
  versionTag: string,
  versionInfo: VersionInfo,
): AlertUpgradeVersion | undefined {
  return versionInfo.alert_upgrade_versions
    ?.filter(isAlertUpgradeVersion)
    .find(
      (v) =>
        compareVersions(v.min, versionTag) <= 0 &&
        compareVersions(v.fixed, versionTag) > 0,
    );
}
