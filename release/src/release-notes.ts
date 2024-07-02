import { match } from 'ts-pattern';

import { nonUserFacingLabels } from "./constants";
import { getMilestoneIssues, isLatestRelease, hasBeenReleased } from "./github";
import type { ReleaseProps, Issue } from "./types";
import {
  isEnterpriseVersion,
  isRCVersion,
  isValidVersionString,
} from "./version-helpers";


const releaseTemplate = `**Upgrading**

You can download a .jar of the release, or get the latest on Docker. Make sure to back up your Metabase
database before you upgrade! Need help? Check out our [upgrading instructions](https://metabase.com/docs/latest/operations-guide/upgrading-metabase.html).

Docker image: {{docker-tag}}
Download the JAR here: {{download-url}}

**Notes**

SHA-256 checksum for the {{version}} JAR:

\`\`\`
{{checksum}}
\`\`\`

<details>
<summary><h2>Changelog</h2></summary>

**Enhancements**

{{enhancements}}

**Bug fixes**

{{bug-fixes}}

**Already Fixed**

Issues that we have recently confirmed to have been fixed at some point in the past.

{{already-fixed}}

**Under the Hood**

{{under-the-hood}}

</details>

`;

const hasLabel = (issue: Issue, label: string) => {
  if (typeof issue.labels === 'string') {
    return issue.labels.includes(label);
  }
  return issue.labels.some(tag => tag.name === label);
}

const isBugIssue = (issue: Issue) => {
  return hasLabel(issue, "Type:Bug");
}

const isAlreadyFixedIssue = (issue: Issue) => {
  return hasLabel(issue, ".Already Fixed");
};

const isNonUserFacingIssue = (issue: Issue) => {
  return nonUserFacingLabels.some(label => hasLabel(issue, label));
}

const formatIssue = (issue: Issue) => `- ${issue.title.trim()} (#${issue.number})`;

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

enum IssueType {
  bugFixes = 'bugFixes',
  enhancements = 'enhancements',
  alreadyFixedIssues = 'alreadyFixedIssues',
  underTheHoodIssues = 'underTheHoodIssues',
}

const issueMap: Record<IssueType, Issue[]> = {
  bugFixes: [],
  enhancements: [],
  alreadyFixedIssues: [],
  underTheHoodIssues: [],
};

export const categorizeIssues = (issues: Issue[]) => {
  return issues.reduce((issueMap, issue) => {
    const category: IssueType = match(issue)
      .when(isNonUserFacingIssue, () => IssueType.underTheHoodIssues)
      .when(isAlreadyFixedIssue, () => IssueType.alreadyFixedIssues)
      .when(isBugIssue, () => IssueType.bugFixes)
      .otherwise(() => IssueType.enhancements);

    return {
      ...issueMap,
      [category]: [...issueMap[category], issue],
    }
  }, { ...issueMap });
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
  const issuesByType = categorizeIssues(issues);

  return releaseTemplate
    .replace(
      "{{enhancements}}",
      issuesByType.enhancements.map(formatIssue).join("\n") ?? "",
    )
    .replace("{{bug-fixes}}", issuesByType.bugFixes.map(formatIssue).join("\n") ?? "")
    .replace("{{already-fixed}}", issuesByType.alreadyFixedIssues.map(formatIssue).join("\n"))
    .replace("{{under-the-hood}}", issuesByType.underTheHoodIssues.map(formatIssue).join("\n"))
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

  const isLatest: 'true' | 'false' = !isEnterpriseVersion(version) && await isLatestRelease({ version, github, owner, repo })
    ? 'true'
    : 'false';

  const payload = {
    owner,
    repo,
    tag_name: version,
    name: getReleaseTitle(version),
    body: generateReleaseNotes({ version, checksum, issues }),
    draft: true,
    prerelease: isRCVersion(version),
    make_latest: isLatest,
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
  const isAlreadyReleased = await hasBeenReleased({
    github,
    owner,
    repo,
    version,
  });

  const issues = await getMilestoneIssues({
    version,
    github,
    owner,
    repo,
    milestoneStatus: isAlreadyReleased ? "closed" : "open"
  });

  return generateReleaseNotes({ version, checksum: "checksum-placeholder", issues });
}
