import fetch from "node-fetch";

import { getChangelogUrl } from "./release-notes";
import type {
  MajorVersionSupport,
  ReleaseProps,
  VersionInfo,
  VersionInfoFile,
} from "./types";
import {
  getVersionType,
  isEnterpriseVersion,
  isPatchVersion,
} from "./version-helpers";

const generateVersionInfo = ({
  version,
}: {
  version: string;
}): VersionInfo => {
  return {
    version,
    released: new Date().toISOString().slice(0, 10),
    patch: ["patch", "minor"].includes(getVersionType(version)),
    highlights: [ `see ${getChangelogUrl(version)}` ],
  };
};

export const generateVersionInfoJson = ({
  version,
  existingVersionInfo,
}: {
  version: string;
  existingVersionInfo: VersionInfoFile;
}) => {
  const isAlreadyReleased =
    existingVersionInfo?.latest?.version === version ||
    existingVersionInfo?.older?.some(
      (info: VersionInfo) => info.version === version,
    );

  if (isAlreadyReleased) {
    console.warn(`Version ${version} already released`);
    return existingVersionInfo;
  }

  const newVersionInfo = generateVersionInfo({ version });

  return {
    ...existingVersionInfo,
    latest: existingVersionInfo.latest,
    older: [newVersionInfo, ...existingVersionInfo.older],
  };
};

export const updateVersionInfoLatestJson = ({
  newLatestVersion,
  existingVersionInfo,
  rollout,
}: {
  newLatestVersion: string;
  existingVersionInfo: VersionInfoFile;
  rollout?: number;
}) => {
  if (isPatchVersion(newLatestVersion)) {
    // currently we don't support patch versions as latest, or store them
    // in the version-info.json
    console.warn(`Version ${newLatestVersion} is a patch version, skipping`);
    return existingVersionInfo;
  }

  if (existingVersionInfo.latest.version === newLatestVersion) {
    console.warn(`Version ${newLatestVersion} already latest, updating rollout % only`);
    return {
      ...existingVersionInfo,
      latest: {
        ...existingVersionInfo.latest,
        rollout,
      },
    };
  }

  const newLatestVersionInfo = existingVersionInfo.older
    .find((info: VersionInfo) => info.version === newLatestVersion);

  if (!newLatestVersionInfo) {
    throw new Error(`${newLatestVersion} not found version-info.json`);
  }

  // remove the new latest version from the older versions
  const oldLatestVersionInfo = existingVersionInfo.latest;
  const newOldVersionInfo = existingVersionInfo.older.filter(
    (info: VersionInfo) => info.version !== newLatestVersion,
  );

  oldLatestVersionInfo.rollout = undefined;

  return {
    ...existingVersionInfo,
    latest: {
      ...newLatestVersionInfo,
      rollout,
    },
    older: [oldLatestVersionInfo, ...newOldVersionInfo],
  };
};

export const getVersionInfoUrl = (version: string) => {
  return isEnterpriseVersion(version)
    ? `http://${process.env.AWS_S3_STATIC_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/version-info-ee.json`
    : `http://${process.env.AWS_S3_STATIC_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/version-info.json`;
};

// for adding a new release to version info
export async function getVersionInfo({
  version,
}: ReleaseProps) {
  const url = getVersionInfoUrl(version);
  const existingFile = (await fetch(url).then(r =>
    r.json(),
  )) as VersionInfoFile;

  const newVersionJson = generateVersionInfoJson({
    version,
    existingVersionInfo: existingFile,
  });

  return newVersionJson;
}

// A major version line is in support — and therefore an eligible backport and
// auto-release target — if and only if its end-of-life date is today or later.
// `lts` is display-only and intentionally ignored here. `major_version_support`
// is append-only, so support is computed from `eol`, never from list membership.
export const getSupportedMajorVersions = (
  versionInfo: VersionInfoFile,
  today: string = new Date().toISOString().slice(0, 10),
): number[] => {
  const lines: MajorVersionSupport[] | undefined =
    versionInfo?.major_version_support;

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error(
      "version-info.json has no `major_version_support` — cannot determine supported major versions",
    );
  }

  const supported = [
    ...new Set(lines.filter(line => line.eol >= today).map(line => line.major)),
  ].sort((a, b) => b - a);

  if (supported.length === 0) {
    throw new Error(
      "No in-support major versions found — every `eol` date is in the past?",
    );
  }

  return supported;
};

// Fetches version-info.json and returns the supported major versions, newest
// first. `major_version_support` is edition-agnostic, so the OSS file suffices.
export async function getSupportedMajors(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<number[]> {
  const url = getVersionInfoUrl("v0"); // any non-`v1.` string picks the OSS file
  const versionInfo = (await fetch(url).then(r => r.json())) as VersionInfoFile;

  return getSupportedMajorVersions(versionInfo, today);
}

// for promoting a released version to `latest` in version-info.json
export async function updateVersionInfoLatest({
  newVersion,
  rollout = 100,
}: {
  newVersion: string;
  rollout?: number;
}) {
  const url = getVersionInfoUrl(newVersion);
  const existingFile = (await fetch(url).then(r =>
    r.json(),
  )) as VersionInfoFile;

  return updateVersionInfoLatestJson({
    newLatestVersion: newVersion,
    existingVersionInfo: existingFile,
    rollout,
  });
}
