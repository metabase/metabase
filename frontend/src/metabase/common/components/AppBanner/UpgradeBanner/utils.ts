import { compareVersions } from "metabase/utils/version";
import type { AlertUpgradeVersion, VersionInfo } from "metabase-types/api";
import { isAlertUpgradeVersion } from "metabase-types/guards/settings";

export function getAlertUpgradeVersion(
  versionTag: string,
  versionInfo: VersionInfo,
): AlertUpgradeVersion | undefined {
  return versionInfo.alert_upgrade_versions
    ?.filter(isAlertUpgradeVersion)
    .find((v) => {
      const minResult = compareVersions(v.min, versionTag);
      const fixedResult = compareVersions(v.fixed, versionTag);
      return (
        minResult != null &&
        fixedResult != null &&
        minResult <= 0 &&
        fixedResult > 0
      );
    });
}
