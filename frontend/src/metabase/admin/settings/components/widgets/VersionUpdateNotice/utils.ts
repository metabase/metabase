import { c, t } from "ttag";

import { dayjs } from "metabase/dayjs";
import {
  getMajorVersion,
  newVersionAvailable,
  versionIsLatest,
} from "metabase/utils/version";

export function getVersionMessage(
  currentVersion: string,
  latestVersion: string | undefined,
  isEol: boolean,
) {
  const formattedCurrentVersion = formatVersion(currentVersion);

  if (latestVersion && versionIsLatest({ currentVersion, latestVersion })) {
    return c(`{0} is a version number`)
      .t`You're running Metabase ${formattedCurrentVersion}, which is the latest and greatest.`;
  }

  if (latestVersion && newVersionAvailable({ currentVersion, latestVersion })) {
    const formattedLatestVersion = formatVersion(latestVersion);
    if (isEol) {
      return c(`{0} and {1} are version numbers`)
        .t`Metabase ${formattedLatestVersion} is available. You're running ${formattedCurrentVersion}, which has reached end-of-life.`;
    }
    return c(`{0} and {1} are version numbers`)
      .t`Metabase ${formattedLatestVersion} is available. You're running ${formattedCurrentVersion}.`;
  }

  return c(`{0} is a version number`)
    .t`You're running Metabase ${formattedCurrentVersion}.`;
}

export function getEolMessage(
  currentVersion: string,
  eolDate: Date,
  isEol: boolean,
) {
  if (isEol) {
    return getEolReachedMessage();
  }
  const currentMajorVersion = getMajorVersion(currentVersion) ?? "";
  return c(`{0} is a major version number, {1} is a date`)
    .t`Metabase ${currentMajorVersion} will reach end-of-life on ${dayjs(eolDate).utc().format("LL")} and will receive bug and security fixes until then.`;
}

export function getEolReachedMessage() {
  return t`Upgrade to a supported version as soon as possible to keep your Metabase secure. Your current version has reached end-of-life and won't get any more updates.`;
}

function formatVersion(version: string) {
  return version.replace(/^v/, "");
}
