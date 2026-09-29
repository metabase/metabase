import { getMajorVersion } from "metabase/utils/version";
import type { VersionInfo } from "metabase-types/api";

export function getEolDate(
  versionInfo: VersionInfo,
  version: string,
): Date | null {
  const majorVersion = getMajorVersion(version);
  const eol = versionInfo.major_version_support
    ?.filter((support) => support.major === majorVersion)
    .reduce<string | null>(
      (maxEol, { eol }) => (maxEol == null || eol > maxEol ? eol : maxEol),
      null,
    );
  if (!eol) {
    return null;
  }
  const eolDate = new Date(eol);
  if (isNaN(eolDate.valueOf())) {
    return null;
  }
  return eolDate;
}
