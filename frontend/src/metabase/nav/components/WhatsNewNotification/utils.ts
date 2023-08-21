import { VersionInfoRecord } from "metabase-types/api";
import MetabaseUtils from "metabase/lib/utils";
// //
export const getLatestEligibleReleaseNotes = ({
  versions,
  currentVersion,
  lastAcknowledgedVersion,
}: {
  versions: VersionInfoRecord[];
  currentVersion: string;
  lastAcknowledgedVersion: string | null;
}): VersionInfoRecord | undefined => {
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

  return (
    eligibleVersions
      // .sort((a, z) => z.version - a.version)
      .find(({ releaseNotesUrl }) => releaseNotesUrl)
  );
};
