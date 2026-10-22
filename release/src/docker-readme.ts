import fetch from "node-fetch";

import type { GithubProps, VersionInfoFile } from "./types";
import {
  getCanonicalVersion,
  getLastReleaseTag,
  getOSSVersion,
  getRollingTagsForVersion,
} from "./version-helpers";
import {
  getSupportedMajorVersions,
  getVersionInfoUrl,
  isLtsVersion,
} from "./version-info";

export const SUPPORTED_TAGS_PLACEHOLDER = "{{SUPPORTED_TAGS_TABLE}}";

export type DockerEdition = "oss" | "ee";

export type DockerTagRow = {
  major: number;
  status: "Beta" | "LTS" | "Supported";
  version: string;
  isLatest: boolean;
  lts: boolean;
};

export const getDockerTagsForVersion = (props: {
  version: string;
  isLatest: boolean;
  isLts: boolean;
}) => [...getRollingTagsForVersion(props), props.version];

export const getDockerTagRowStatus = ({
  version,
  lts,
}: {
  version: string;
  lts: boolean;
}): DockerTagRow["status"] => {
  const [_prefix, _major, minor] = getOSSVersion(version).split(/\.|\-/g);
  if (Number(minor) === 0) {
    return "Beta";
  }
  return lts ? "LTS" : "Supported";
};

export const buildSupportedTagsTable = (rows: DockerTagRow[]) =>
  [
    "| Version | Status | Tags |",
    "|---|---|---|",
    ...rows.map(({ major, status, version, isLatest, lts }) => {
      const tags = getDockerTagsForVersion({
        version,
        isLatest,
        isLts: lts,
      });
      return `| ${major} | ${status} | ${tags.map((tag) => `\`${tag}\``).join(", ")} |`;
    }),
  ].join("\n");

export const renderDockerReadme = ({
  template,
  rows,
}: {
  template: string;
  rows: DockerTagRow[];
}) => {
  if (!template.includes(SUPPORTED_TAGS_PLACEHOLDER)) {
    throw new Error(
      `Docker README template has no ${SUPPORTED_TAGS_PLACEHOLDER} placeholder`,
    );
  }
  return template.replace(SUPPORTED_TAGS_PLACEHOLDER, () =>
    buildSupportedTagsTable(rows),
  );
};

export async function getDockerTagRows({
  github,
  owner,
  repo,
  latestMajorVersion,
  edition,
  today = new Date().toISOString().slice(0, 10),
}: GithubProps & {
  latestMajorVersion: string;
  edition: DockerEdition;
  today?: string;
}) {
  const latestMajor = Number(latestMajorVersion);
  if (!Number.isInteger(latestMajor) || latestMajor <= 0) {
    throw new Error(`Invalid latest major version: ${latestMajorVersion}`);
  }

  const versionInfoUrl = getVersionInfoUrl("v0");
  const versionInfoResponse = await fetch(versionInfoUrl);
  if (!versionInfoResponse.ok) {
    throw new Error(
      `Failed to fetch ${versionInfoUrl}: ${versionInfoResponse.status} ${await versionInfoResponse.text()}`,
    );
  }
  const versionInfo = (await versionInfoResponse.json()) as VersionInfoFile;

  const rows: DockerTagRow[] = [];

  for (const major of getSupportedMajorVersions(versionInfo, today)) {
    const ossVersion = await getLastReleaseTag({
      github,
      owner,
      repo,
      version: `v0.${major}.0`,
    });

    if (!ossVersion) {
      console.warn(`No release tag found for major version ${major}, skipping`);
      continue;
    }

    const version = getCanonicalVersion(ossVersion, edition);

    const lts = await isLtsVersion({ version });
    const status = getDockerTagRowStatus({ version, lts });

    rows.push({
      major,
      status,
      version,
      isLatest: major === latestMajor,
      lts,
    });
  }

  return rows;
}

export async function generateDockerReadme({
  template,
  ...props
}: GithubProps & {
  template: string;
  latestMajorVersion: string;
  edition: DockerEdition;
  today?: string;
}) {
  const rows = await getDockerTagRows(props);
  return renderDockerReadme({ template, rows });
}

const DOCKER_HUB_API_URL = "https://hub.docker.com/v2";

export async function pushDockerReadme({
  readme,
  repository,
  username,
  token,
}: {
  readme: string;
  repository: string;
  username: string;
  token: string;
}) {
  const authResponse = await fetch(`${DOCKER_HUB_API_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: username, secret: token }),
  });

  if (!authResponse.ok) {
    throw new Error(
      `Docker Hub authentication failed: ${authResponse.status} ${await authResponse.text()}`,
    );
  }

  const authBody: unknown = await authResponse.json();
  const access_token =
    typeof authBody === "object" &&
    authBody !== null &&
    "access_token" in authBody &&
    typeof authBody.access_token === "string"
      ? authBody.access_token
      : undefined;
  if (!access_token) {
    throw new Error("Docker Hub authentication response has no access_token");
  }

  const response = await fetch(
    `${DOCKER_HUB_API_URL}/repositories/${repository}/`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ full_description: readme }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Docker Hub README update for ${repository} failed: ${response.status} ${await response.text()}`,
    );
  }
}
