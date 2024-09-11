import fetch from "node-fetch";
import _ from "underscore";

import { getMilestoneIssues } from "./github";
import type {
  Issue,
  ReleaseProps,
  VersionInfo,
  VersionInfoFile,
} from "./types";
import {
  getVersionType,
  isEnterpriseVersion,
} from "./version-helpers";

const generateVersionInfo = ({
  version,
  milestoneIssues,
}: {
  version: string;
  milestoneIssues: Issue[];
}): VersionInfo => {
  return {
    version,
    released: new Date().toISOString().slice(0, 10),
    patch: ["patch", "minor"].includes(getVersionType(version)),
    highlights: milestoneIssues.map?.(issue => issue.title) ?? [],
  };
};

export const generateVersionInfoJson = ({
  version,
  existingVersionInfo,
  milestoneIssues,
}: {
  version: string;
  milestoneIssues: Issue[];
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

  const newVersionInfo = generateVersionInfo({ version, milestoneIssues });

  return {
    latest: existingVersionInfo.latest,
    older: [newVersionInfo, ...existingVersionInfo.older],
  };
};

export const updateVersionInfoLatestJson = ({
  newLatestVersion,
  existingVersionInfo,
}: {
  newLatestVersion: string;
  existingVersionInfo: VersionInfoFile;
}) => {
  if (existingVersionInfo.latest.version === newLatestVersion) {
    console.warn(`Version ${newLatestVersion} already latest`);
    return existingVersionInfo;
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

  return {
    latest: newLatestVersionInfo,
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
  github,
  owner,
  repo,
}: ReleaseProps) {
  const url = getVersionInfoUrl(version);
  const existingFile = (await fetch(url).then(r =>
    r.json(),
  )) as VersionInfoFile;

  const milestoneIssues = await getMilestoneIssues({
    version,
    github,
    owner,
    repo,
  });

  const newVersionJson = generateVersionInfoJson({
    version,
    milestoneIssues,
    existingVersionInfo: existingFile,
  });

  return newVersionJson;
}

// for updating the latest version in version info
export const updateVersionInfoLatest = async ({
  newLatestVersion,
}: {
  newLatestVersion: string;
}) => {
  const url = getVersionInfoUrl(newLatestVersion);
  const existingFile = (await fetch(url).then(r =>
    r.json(),
  )) as VersionInfoFile;

  const newVersionJson = updateVersionInfoLatestJson({
    newLatestVersion,
    existingVersionInfo: existingFile,
  });

  return newVersionJson;
};