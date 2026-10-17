import { githubReleaseTemplate } from "./release-notes-templates";
import type { ReleaseProps } from "./types";
import {
  getDotXVersion,
  getEnterpriseVersion,
  getGenericVersion,
  getMajorVersion,
  getMinorVersion,
  getOSSVersion,
  isEnterpriseVersion,
  isPreReleaseVersion,
  isValidVersionString,
} from "./version-helpers";

export const getDockerTag = (version: string) => {
  const dotXVersion = getDotXVersion(version);

  const imagePath = `${process.env.DOCKERHUB_OWNER}/${
    process.env.DOCKERHUB_REPO
  }${isEnterpriseVersion(version) ? "-enterprise" : ""}`;

  return `[\`${imagePath}:${dotXVersion}\`](https://hub.docker.com/r/${imagePath}/tags)`;
};

export const getDownloadUrl = (version: string) => {
  const dotXVersion = getDotXVersion(version);

  return `https://${process.env.AWS_S3_DOWNLOADS_BUCKET}/${
    isEnterpriseVersion(version) ? "enterprise/" : ""
  }${dotXVersion}/metabase.jar`;
};

export const getChangelogUrl = (version: string ) => {
  const majorVersion = getMajorVersion(version);
  const minorVersion = getMinorVersion(version);
  return `https://www.metabase.com/changelog/${majorVersion}#metabase-${majorVersion}${minorVersion}`
}

export const getReleaseTitle = (version: string) => {
  return `Metabase ${getGenericVersion(version)}`;
};

export const generateReleaseNotes = ({
  version,
  template,
}: {
  version: string;
  template: string;
}) => {
  const ossVersion = getOSSVersion(version);
  const eeVersion = getEnterpriseVersion(version);

  return template
    .replace("{{ee-docker-tag}}", getDockerTag(eeVersion))
    .replace("{{ee-download-url}}", getDownloadUrl(eeVersion))
    .replace("{{oss-docker-tag}}", getDockerTag(ossVersion))
    .replace("{{oss-download-url}}", getDownloadUrl(ossVersion))
    .replace("{{changelog-url}}", getChangelogUrl(ossVersion));
};

export async function publishRelease({
  version,
  owner,
  repo,
  github,
}: ReleaseProps) {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }
  const payload = {
    owner,
    repo,
    tag_name: getOSSVersion(version),
    name: getReleaseTitle(version),
    body: generateReleaseNotes({
      version,
      template: githubReleaseTemplate,
    }),
    draft: true,
    prerelease: isPreReleaseVersion(version), // this api arg has never worked, but maybe it will someday! 🤞
  };

  return github.rest.repos.createRelease(payload);
}
