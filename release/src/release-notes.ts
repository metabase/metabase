import { match } from "ts-pattern";

import { hiddenLabels, nonUserFacingLabels } from "./constants";
import { getMilestoneIssues, hasBeenReleased } from "./github";
import type { Issue, ReleaseProps } from "./types";
import {
  getEnterpriseVersion,
  getGenericVersion,
  getOSSVersion,
  isEnterpriseVersion,
  isPreReleaseVersion,
  isValidVersionString,
} from "./version-helpers";

const releaseTemplate = `## Upgrading

> Before you upgrade, back up your Metabase application database!

Check out our [upgrading instructions](https://metabase.com/docs/latest/operations-guide/upgrading-metabase).

[Get the most out of Metabase](https://www.metabase.com/pricing?utm_source=github&utm_medium=release-notes&utm_campaign=plan-comparison). Learn more about advanced features, managed cloud, and first-class support.

## Metabase Open Source

Docker image: {{oss-docker-tag}}
JAR download: {{oss-download-url}}

## Metabase Enterprise

Docker image: {{ee-docker-tag}}
JAR download: {{ee-download-url}}

## Changelog

### Enhancements

{{enhancements}}

### Bug fixes

{{bug-fixes}}

### Already Fixed

Issues confirmed to have been fixed in a previous release.

{{already-fixed}}

### Under the Hood

{{under-the-hood}}

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
  return `Metabase ${getGenericVersion(version)}`;
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
  issues,
}: {
  version: string;
  issues: Issue[];
}) => {
  const issuesByType = categorizeIssues(issues);

  const ossVersion = getOSSVersion(version);
  const eeVersion = getEnterpriseVersion(version);

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
    .replace("{{ee-docker-tag}}", getDockerTag(eeVersion))
    .replace("{{ee-download-url}}", getDownloadUrl(eeVersion))
    .replace("{{oss-docker-tag}}", getDockerTag(ossVersion))
    .replace("{{oss-download-url}}", getDownloadUrl(ossVersion));
};

export async function publishRelease({
  version,
  owner,
  repo,
  github,
}: ReleaseProps & { oss_checksum: string, ee_checksum: string }) {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const issues = await getMilestoneIssues({ version, github, owner, repo });

  const payload = {
    owner,
    repo,
    tag_name: getOSSVersion(version),
    name: getReleaseTitle(version),
    body: generateReleaseNotes({ version, issues }),
    draft: true,
    prerelease: isPreReleaseVersion(version), // this api arg has never worked, but maybe it will someday! 🤞
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
    issues,
  });
}
