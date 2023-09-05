import type { VersionInfoRecord } from "metabase-types/api";
import MetabaseUtils from "metabase/lib/utils";
import type { VersionInfo } from "metabase-types/api/settings";
import { isNotFalsy } from "metabase/core/utils/types";
/**
 * Helper function that:
 * - gets versions > lastAcknowledgedVersion (if not null) & <= currentVersion
 * - gets the last (more recent) one that has a release notes url and returns it if present
 */
export const getLatestEligibleReleaseNotes = ({
  versionInfo,
  currentVersion,
  lastAcknowledgedVersion,
  isEmbedded = false,
}: {
  versionInfo: VersionInfo | null;
  currentVersion?: string;
  lastAcknowledgedVersion: string | null;
  isEmbedded?: boolean;
}): VersionInfoRecord | undefined => {
  if (isEmbedded || currentVersion === undefined) {
    return undefined;
  }

  const versions = [versionInfo?.latest]
    .concat(versionInfo?.older)
    .filter(isNotFalsy);

  const versionInVersionInfo = versions.find(v => v.version === currentVersion);
  if (!versionInVersionInfo) {
    return undefined;
  }

  const eligibleVersions = versions.filter(({ version }) => {
    return (
      //                            version <= currentVersion
      MetabaseUtils.compareVersions(version, currentVersion) !== 1 &&
      // shortcircuit lower bound if lastAcknowledgedVersion is null
      (lastAcknowledgedVersion == null ||
        //                            version > lastAcknowledgedVersion
        MetabaseUtils.compareVersions(version, lastAcknowledgedVersion) === 1)
    );
  });

  return eligibleVersions
    .sort((a, b) => MetabaseUtils.compareVersions(b.version, a.version))
    .find(({ announcement_url }) => announcement_url);
};
