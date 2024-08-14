import fetch from "node-fetch";
import { getMilestoneIssues } from "./github";
import {
  getVersionType,
  isEnterpriseVersion,
  isLatestVersion,
} from "./version-helpers";

import type {
  Issue,
  ReleaseProps,
  VersionInfoFile,
  VersionInfo,
} from "./types";

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
  const isLatest = isLatestVersion(version, [
    existingVersionInfo.latest.version,
  ]);

  if (!isLatest) {
    console.warn(`Version ${version} is not the latest`);
    return existingVersionInfo;
  }

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
    latest: isLatest ? newVersionInfo : existingVersionInfo.latest,
    older: isLatest
      ? [existingVersionInfo.latest, ...existingVersionInfo.older]
      : [newVersionInfo, ...existingVersionInfo.older],
  };
};

export const getVersionInfoUrl = (version: string) => {
  return isEnterpriseVersion(version)
    ? `http://${process.env.AWS_S3_STATIC_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/version-info-ee.json`
    : `http://${process.env.AWS_S3_STATIC_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/version-info.json`;
};

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
