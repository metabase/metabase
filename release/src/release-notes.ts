import { getMilestoneIssues, isLatestRelease } from "./github";
import {
  isEnterpriseVersion,
  isRCVersion,
  isValidVersionString,
} from "./version-helpers";

import type { ReleaseProps, Issue } from "./types";

const releaseTemplate = `# NOTE: clean up 'Enhancements' and 'Bug fixes' sections and remove this line before publishing!
**Enhancements**

{{enhancements}}

**Bug fixes**

{{bug-fixes}}

**Upgrading**

You can download a .jar of the release, or get the latest on Docker. Make sure to back up your Metabase
database before you upgrade! Need help? Check out our [upgrading instructions](https://metabase.com/docs/latest/operations-guide/upgrading-metabase.html).

Docker image: {{docker-tag}}
Download the JAR here: {{download-url}}

**Notes**

SHA-256 checksum for the {{version}} JAR:

\`\`\`
{{checksum}}
\`\`\`
`;

const isBugIssue = (issue: Issue) =>
  issue.labels.some(tag => tag.name === "Type:Bug");

const formatIssue = (issue: Issue) => `- ${issue.title} (#${issue.number})`;

export const getDockerTag = (version: string) => {
  const imagePath = `${process.env.DOCKERHUB_OWNER}/${
    process.env.DOCKERHUB_REPO
  }${isEnterpriseVersion(version) ? "-enterprise" : ""}`;

  return `[\`${imagePath}:${version}\`](https://hub.docker.com/r/${imagePath}/tags)`;
};

export const getDownloadUrl = (version: string) => {
  return `https://${process.env.AWS_S3_DOWNLOADS_BUCKET}/${
    isEnterpriseVersion(version) ? "enterprise/" : ""
  }${version}/metabase.jar`;
};

export const getReleaseTitle = (version: string) => {
  if (isEnterpriseVersion(version)) {
    return `Metabase® Enterprise Edition™ ${version}`;
  }

  return `Metabase ${version}`;
};

export const generateReleaseNotes = ({
  version,
  checksum,
  issues,
}: {
  version: string;
  checksum: string;
  issues: Issue[];
}) => {
  const bugFixes = issues.filter(isBugIssue);
  const enhancements = issues.filter(issue => !isBugIssue(issue));

  return releaseTemplate
    .replace(
      "{{enhancements}}",
      enhancements?.map(formatIssue).join("\n") ?? "",
    )
    .replace("{{bug-fixes}}", bugFixes?.map(formatIssue).join("\n") ?? "")
    .replace("{{docker-tag}}", getDockerTag(version))
    .replace("{{download-url}}", getDownloadUrl(version))
    .replace("{{version}}", version)
    .replace("{{checksum}}", checksum.split(" ")[0]);
};

export async function publishRelease({
  version,
  checksum,
  owner,
  repo,
  github,
}: ReleaseProps & { checksum: string }) {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const issues = await getMilestoneIssues({ version, github, owner, repo });

  const payload = {
    owner,
    repo,
    tag_name: version,
    name: getReleaseTitle(version),
    body: generateReleaseNotes({ version, checksum, issues }),
    draft: true,
    prerelease: isRCVersion(version),
    make_latest: await isLatestRelease({ version, github, owner, repo }),
  };

  return github.rest.repos.createRelease(payload);
}

export async function getChangelog({
  version,
  owner,
  repo,
  github,
}: ReleaseProps) {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }
  const issues = await getMilestoneIssues({ version, github, owner, repo });

  const bugFixes = issues.filter(isBugIssue);
  const enhancements = issues.filter(issue => !isBugIssue(issue));

  const notes = `
## Enhancements
${enhancements?.map(formatIssue).join("\n") ?? ""}


## Bug fixes
${bugFixes?.map(formatIssue).join("\n") ?? ""}
`;

  return notes;
}
