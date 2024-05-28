import { isNotFalsy } from "metabase/lib/types";
import { compareVersions } from "metabase/lib/utils";
import type { VersionInfoRecord } from "metabase-types/api";
import type { VersionInfo } from "metabase-types/api/settings";
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
  isWhiteLabeling = false,
}: {
  versionInfo: VersionInfo | null;
  currentVersion: string | undefined;
  lastAcknowledgedVersion: string | null;
  isEmbedded: boolean;
  isWhiteLabeling: boolean;
}): VersionInfoRecord | undefined => {
  if (isWhiteLabeling || isEmbedded || currentVersion === undefined) {
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
      //             version <= currentVersion
      compareVersions(version, currentVersion) !== 1 &&
      // shortcircuit lower bound if lastAcknowledgedVersion is null
      (lastAcknowledgedVersion == null ||
        //              version > lastAcknowledgedVersion
        compareVersions(version, lastAcknowledgedVersion) === 1)
    );
  });

  return eligibleVersions
    .sort((a, b) => compareVersions(b.version, a.version))
    .find(({ announcement_url }) => announcement_url);
};
