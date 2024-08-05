import { match } from "ts-pattern";

import { nonUserFacingLabels, hiddenLabels } from "./constants";
import { getMilestoneIssues, isLatestRelease, hasBeenReleased } from "./github";
import type { Issue, ReleaseProps } from "./types";
import {
  isEnterpriseVersion,
  isRCVersion,
  isValidVersionString,
} from "./version-helpers";

const releaseTemplate = `## Upgrading

> Before you upgrade, back up your Metabase application database!

Check out our [upgrading instructions](https://metabase.com/docs/latest/operations-guide/upgrading-metabase).

Docker image: {{docker-tag}}
Download the JAR here: {{download-url}}

## Notes

SHA-256 checksum for the {{version}} JAR:

\`\`\`
{{checksum}}
\`\`\`

<details>
<summary><h2>Changelog</h2></summary>

### Enhancements

{{enhancements}}

### Bug fixes

{{bug-fixes}}

### Already Fixed

Issues confirmed to have been fixed in a previous release.

{{already-fixed}}

### Under the Hood

{{under-the-hood}}

</details>

`;

const hasLabel = (issue: Issue, label: string) => {
  if (typeof issue.labels === "string") {
    return issue.labels.includes(label);
  }
  return issue.labels.some(tag => tag.name === label);
};

const isBugIssue = (issue: Issue) => {
  return hasLabel(issue, "Type:Bug");
};

const isAlreadyFixedIssue = (issue: Issue) => {
  return hasLabel(issue, ".Already Fixed");
};

const isNonUserFacingIssue = (issue: Issue) => {
  return nonUserFacingLabels.some(label => hasLabel(issue, label));
};

const isHiddenIssue = (issue: Issue) => {
  return hiddenLabels.some(label => hasLabel(issue, label));
};

const formatIssue = (issue: Issue) =>
  `- ${issue.title.trim()} (#${issue.number})`;

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
  bugFixes = "bugFixes",
  enhancements = "enhancements",
  alreadyFixedIssues = "alreadyFixedIssues",
  underTheHoodIssues = "underTheHoodIssues",
}

// Product area labels take the form of "Category/Subcategory", e.g., "Querying/MBQL"
// We're only interested in the main product category, e.g., "Querying"
enum ProductCategory {
  administration = "Administration",
  database = "Database",
  embedding = "Embedding",
  operation = "Operation",
  organization = "Organization",
  querying = "Querying",
  reporting = "Reporting",
  visualization = "Visualization",
  other = "Other",
}

type CategoryIssueMap = Record<Partial<ProductCategory>, Issue[]>;

type IssueMap = {
  [IssueType.bugFixes]: CategoryIssueMap;
  [IssueType.enhancements]: CategoryIssueMap;
  [IssueType.alreadyFixedIssues]: CategoryIssueMap;
  [IssueType.underTheHoodIssues]: CategoryIssueMap;
};

const getIssueType = (issue: Issue): IssueType => {
  return match(issue)
    .when(isNonUserFacingIssue, () => IssueType.underTheHoodIssues)
    .when(isAlreadyFixedIssue, () => IssueType.alreadyFixedIssues)
    .when(isBugIssue, () => IssueType.bugFixes)
    .otherwise(() => IssueType.enhancements);
};

const getLabels = (issue: Issue): string[] => {
  if (typeof issue.labels === "string") {
    return issue.labels.split(",");
  }
  return issue.labels.map(label => label.name || "");
};

const hasCategory = (issue: Issue, categoryName: ProductCategory): boolean => {
  const labels = getLabels(issue);
  return labels.some(label => label.includes(categoryName));
};

export const getProductCategory = (issue: Issue): ProductCategory => {
  const category = Object.values(ProductCategory).find(categoryName =>
    hasCategory(issue, categoryName)
  );

  return category ?? ProductCategory.other;
};

// Format issues for a single product category
const formatIssueCategory = (categoryName: ProductCategory, issues: Issue[]): string => {
  return `**${categoryName}**\n\n${issues.map(formatIssue).join("\n")}`;
};

// We want to alphabetize the issues by product category, with "Other" (uncategorized) issues as the caboose
const sortCategories = (categories: ProductCategory[]) => {
  const uncategorizedIssues = categories.filter(
    category => category === ProductCategory.other,
  );
  const sortedCategories = categories
    .filter(cat => cat !== ProductCategory.other)
    .sort((a, b) => a.localeCompare(b));

  return [
    ...sortedCategories,
    ...uncategorizedIssues,
  ];
};

// For each issue category ("Enhancements", "Bug Fixes", etc.), we want to group issues by product category
const formatIssues = (issueMap: CategoryIssueMap): string => {
  const categories = sortCategories(
    Object.keys(issueMap) as ProductCategory[],
  );

  return categories
    .map(categoryName => formatIssueCategory(categoryName, issueMap[categoryName]))
    .join("\n\n");
};

export const categorizeIssues = (issues: Issue[]) => {
  return issues
    .filter(issue => !isHiddenIssue(issue))
    .reduce((issueMap: IssueMap, issue: Issue) => {
      const issueType = getIssueType(issue);
      const productCategory = getProductCategory(issue);

      return {
        ...issueMap,
        [issueType]: {
          ...issueMap[issueType],
          [productCategory]: [
            ...issueMap[issueType][productCategory] ?? [],
            issue,
          ],
        },
      };
    }, {
      [IssueType.bugFixes]: {},
      [IssueType.enhancements]: {},
      [IssueType.alreadyFixedIssues]: {},
      [IssueType.underTheHoodIssues]: {},
    } as IssueMap);
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
      formatIssues(issuesByType.enhancements),
    )
    .replace(
      "{{bug-fixes}}",
      formatIssues(issuesByType.bugFixes),
    )
    .replace(
      "{{already-fixed}}",
      formatIssues(issuesByType.alreadyFixedIssues),
    )
    .replace(
      "{{under-the-hood}}",
      formatIssues(issuesByType.underTheHoodIssues),
    )
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

  const isLatest: "true" | "false" =
    !isEnterpriseVersion(version) &&
    (await isLatestRelease({ version, github, owner, repo }))
      ? "true"
      : "false";

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
    milestoneStatus: isAlreadyReleased ? "closed" : "open",
  });

  return generateReleaseNotes({
    version,
    checksum: "checksum-placeholder",
    issues,
  });
}
