import fetch from "node-fetch";
import _ from "underscore";

import { getMilestoneIssues } from "./github";
import type {
  Issue,
  ReleaseChannel,
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

// for updating the version in version info for a specific channel
export const updateVersionInfoChannel = async ({
  channel,
  newVersion,
  rollout = 100,
}: {
  channel: ReleaseChannel;
  newVersion: string;
  rollout?: number;
}) => {
  const url = getVersionInfoUrl(newVersion);
  const existingFile = (await fetch(url).then(r =>
    r.json(),
  )) as VersionInfoFile;

  const newVersionJson = updateVersionInfoChannelJson({
    channel,
    version: newVersion,
    existingVersionInfo: existingFile,
    rollout,
  });

  return newVersionJson;
};

export function updateVersionInfoChannelJson({
  existingVersionInfo,
  channel,
  version,
  rollout = 100,
}: {
  existingVersionInfo: VersionInfoFile;
  channel: ReleaseChannel;
  version: string;
  rollout?: number;
}): VersionInfoFile {
  if (channel === "latest") {
    // tagging latest requires moving the current latest to the "older" array
    return updateVersionInfoLatestJson({
      newLatestVersion: version,
      existingVersionInfo,
      rollout,
    });
  }

  // everything else is just setting the correct key in the version info
  return {
    ...existingVersionInfo,
    [channel]: {
      version,
      released: new Date().toISOString().slice(0, 10),
      rollout,
      highlights: [],
    },
  };
}
