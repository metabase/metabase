// Release report orchestrator.
//
// Fuses the existing release automation into a single dataset for a newly-cut
// major release branch:
//   1. Trace every commit on release-x.<major>.x back to where the previous
//      major forked from master (reuses getReleaseBranchCommits).
//   2. Extract the squash-merged PR numbers from those commits.
//   3. Resolve each PR back to its original GitHub issue(s), following backports
//      and linked issues (reuses getOriginalIssues from the milestone backfill).
//   4. Resolve the PRs + issues to their linked Linear issues, and roll those up
//      by Linear project (reuses the attachmentsForURL bridge, via linear.ts).
//   5. Render the categorized release-notes Markdown from the GitHub issues.
//
// The AI theme summary and HTML rendering are intentionally NOT done here — this
// function returns pure data so it stays easy to reason about and drive.

import { getIssueWithCache } from "./github";
import {
  collectLinearProjects,
  getLinearIssuesForUrls,
  githubUrlsForReport,
  type LinearIssue,
  type ProjectSummary,
} from "./linear";
import { getPRsFromCommitMessage } from "./linked-issues";
import { getOriginalIssues } from "./milestones";
import { getReleaseBranchCommits } from "./release-branch-commits";
import { renderReleaseNotesMarkdown } from "./release-notes-markdown";
import type { GithubProps, Issue } from "./types";

export type ReleaseReportData = {
  majorVersion: number;
  version: string;
  previousMajorVersion: number;
  branch: string;
  prCount: number;
  prNumbers: number[];
  issues: Issue[];
  linearIssues: LinearIssue[];
  linearIssueCount: number;
  projects: ProjectSummary[];
  releaseNotesMarkdown: string;
};

function uniq<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

const isNotNull = <T>(value: T | null | undefined): value is T => value != null;

// Run an async mapper over items with a bounded concurrency. Keeps us fast
// without blowing the GitHub rate limit like a naive Promise.all(600) would.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function getReleaseReportData({
  github,
  owner,
  repo,
  majorVersion,
  linearApiKey,
  log = console.log,
}: GithubProps & {
  majorVersion: number;
  linearApiKey: string;
  log?: (message: string) => void;
}): Promise<ReleaseReportData> {
  const previousMajorVersion = majorVersion - 1;
  const branch = `release-x.${majorVersion}.x`;

  log(`Tracing commits on ${branch} back to the ${previousMajorVersion} fork point…`);
  const commitSubjects = await getReleaseBranchCommits({ versionNumber: majorVersion });

  const prNumbers = uniq(
    commitSubjects.flatMap(subject => getPRsFromCommitMessage(subject) ?? []),
  );
  log(`Found ${commitSubjects.length} commits → ${prNumbers.length} unique PRs.`);

  // Resolve PRs → original GitHub issues. getOriginalIssues is chatty (it logs
  // per PR as it walks backports/linked issues); silence that here and print our
  // own coarse progress instead so the tool output stays readable at ~600 PRs.
  log(`Resolving PRs to their original issues…`);
  const originalLog = console.log;
  const issueNumberSet = new Set<number>();
  let processed = 0;
  console.log = () => {};
  try {
    await mapWithConcurrency(prNumbers, 8, async prNumber => {
      const originals = await getOriginalIssues({ github, owner, repo, issueNumber: prNumber });
      originals.forEach(n => issueNumberSet.add(n));
      processed += 1;
      if (processed % 100 === 0 || processed === prNumbers.length) {
        originalLog(`  …resolved ${processed}/${prNumbers.length} PRs`);
      }
    });
  } finally {
    console.log = originalLog;
  }

  const issueNumbers = Array.from(issueNumberSet);
  log(`Fetching ${issueNumbers.length} GitHub issues…`);
  const issues = (
    await mapWithConcurrency(issueNumbers, 8, issueNumber =>
      getIssueWithCache({ github, owner, repo, issueNumber }),
    )
  ).filter(isNotNull);

  log(`Resolving Linear issues + projects…`);
  const urls = githubUrlsForReport({ owner, repo, prNumbers, issueNumbers });
  const linearIssues = await getLinearIssuesForUrls({
    urls,
    apiKey: linearApiKey,
    onProgress: (done, total) => {
      if (done % 200 === 0 || done === total) {
        log(`  …queried ${done}/${total} GitHub URLs against Linear`);
      }
    },
  });
  const projects = collectLinearProjects(linearIssues);
  log(
    `Linear: ${linearIssues.length} issues across ${
      projects.filter(p => p.project !== null).length
    } projects.`,
  );

  const releaseNotesMarkdown = renderReleaseNotesMarkdown(issues);

  return {
    majorVersion,
    version: `v0.${majorVersion}.0`,
    previousMajorVersion,
    branch,
    prCount: prNumbers.length,
    prNumbers,
    issues,
    linearIssues,
    linearIssueCount: linearIssues.length,
    projects,
    releaseNotesMarkdown,
  };
}
