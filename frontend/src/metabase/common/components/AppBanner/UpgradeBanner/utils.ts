import { compareVersions } from "metabase/utils/version";
import type { AlertUpgradeVersion, VersionInfo } from "metabase-types/api";
import { isAlertUpgradeVersion } from "metabase-types/guards/settings";

export function getAlertUpgradeVersion(
  versionTag: string,
  versionInfo: VersionInfo,
): AlertUpgradeVersion | undefined {
  const matching = versionInfo.alert_upgrade_versions
    ?.filter(isAlertUpgradeVersion)
    .filter((v) => {
      const minResult = compareVersions(v.min, versionTag);
      const fixedResult = compareVersions(v.fixed, versionTag);
      return (
        minResult != null &&
        fixedResult != null &&
        minResult <= 0 &&
        fixedResult > 0
      );
    });

  if (!matching?.length) {
    return undefined;
  }

  return matching.reduce((highest, current) => {
    const cmp = compareVersions(current.fixed, highest.fixed);
    if (cmp == null) {
      return highest;
    }
    return cmp > 0 ? current : highest;
  });
}
