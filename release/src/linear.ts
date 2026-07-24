// Linear seam for release reporting.
//
// Metabase links Linear issues to GitHub PRs/issues via attachments (the
// `attachmentsForURL` bridge — see .github/scripts/find-linear-issue.js). Given
// a set of GitHub URLs we resolve the Linear issues behind them, then roll the
// issues up by Linear *project* so we can report which projects shipped work in
// a release and how many issues each contributed.
//
// The API key is sent RAW in the Authorization header (no `Bearer` prefix) —
// this matches how CI uses LINEAR_API_KEY elsewhere in the repo.

const LINEAR_API_URL = "https://api.linear.app/graphql";

// attachmentsForURL is one graph traversal per URL; batching many into a single
// request with field aliases keeps us well under Linear's complexity limit
// while cutting round-trips ~25x.
const DEFAULT_BATCH_SIZE = 25;

export type LinearProject = {
  id: string;
  name: string;
  url: string;
  state: string | null;
};

export type LinearTeam = {
  key: string;
  name: string;
};

export type LinearIssue = {
  identifier: string;
  title: string;
  url: string;
  team: LinearTeam | null;
  project: LinearProject | null;
  /** The GitHub URL that resolved to this Linear issue. */
  sourceUrl: string;
};

export type ProjectSummary = {
  /** null project means the issues had no Linear project (e.g. one-off bugs). */
  project: LinearProject | null;
  name: string;
  issueCount: number;
  issues: LinearIssue[];
};

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

export type GetLinearIssuesOptions = {
  urls: string[];
  apiKey: string;
  batchSize?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: FetchLike;
  /** Injectable for tests; defaults to a real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
};

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

// A Linear issue can be legitimately linked to multiple GitHub URLs (the issue
// *and* its PR). We use `_key` internally to make each alias unique and map the
// response back to the original URL.
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildBatchQuery(urls: string[]): string {
  const fields = urls
    .map(
      (url, i) => `
      u${i}: attachmentsForURL(url: ${JSON.stringify(url)}) {
        nodes {
          issue {
            identifier
            title
            url
            team { key name }
            project { id name url state }
          }
        }
      }`,
    )
    .join("\n");

  return `query ReleaseAttachments {${fields}\n}`;
}

async function queryLinearWithBackoff({
  query,
  apiKey,
  fetchFn,
  sleep,
  maxRetries = 6,
}: {
  query: string;
  apiKey: string;
  fetchFn: FetchLike;
  sleep: (ms: number) => Promise<void>;
  maxRetries?: number;
}): Promise<any> {
  let delay = 500;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn(LINEAR_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status}`);
      }

      const body = await response.json();

      if (body.errors) {
        throw new Error(`Linear GraphQL error: ${JSON.stringify(body.errors)}`);
      }

      return body.data ?? {};
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
      await sleep(delay);
      // exponential backoff with jitter
      delay = Math.min(delay * 2 * (0.8 + Math.random() * 0.4), 15_000);
    }
  }

  throw lastError;
}

/**
 * Resolve a list of GitHub PR/issue URLs to the Linear issues attached to them.
 * Returns a flat, de-duplicated list of Linear issues (deduped by identifier —
 * the same Linear issue linked from both a PR and an issue URL appears once).
 */
export async function getLinearIssuesForUrls({
  urls,
  apiKey,
  batchSize = DEFAULT_BATCH_SIZE,
  fetchFn = globalThis.fetch as unknown as FetchLike,
  sleep = defaultSleep,
  onProgress,
}: GetLinearIssuesOptions): Promise<LinearIssue[]> {
  const uniqueUrls = Array.from(new Set(urls));
  const batches = chunk(uniqueUrls, batchSize);
  const byIdentifier = new Map<string, LinearIssue>();

  let done = 0;
  for (const batch of batches) {
    const data = await queryLinearWithBackoff({
      query: buildBatchQuery(batch),
      apiKey,
      fetchFn,
      sleep,
    });

    batch.forEach((url, i) => {
      const nodes = data?.[`u${i}`]?.nodes ?? [];
      for (const node of nodes) {
        const issue = node?.issue;
        if (!issue?.identifier) {
          continue;
        }
        // First link wins for sourceUrl; identifier de-dupes across PR+issue.
        if (!byIdentifier.has(issue.identifier)) {
          byIdentifier.set(issue.identifier, {
            identifier: issue.identifier,
            title: issue.title ?? "",
            url: issue.url ?? "",
            team: issue.team
              ? { key: issue.team.key, name: issue.team.name ?? issue.team.key }
              : null,
            project: issue.project
              ? {
                  id: issue.project.id,
                  name: issue.project.name,
                  url: issue.project.url ?? "",
                  state: issue.project.state ?? null,
                }
              : null,
            sourceUrl: url,
          });
        }
      }
    });

    done += batch.length;
    onProgress?.(done, uniqueUrls.length);
  }

  return Array.from(byIdentifier.values());
}

const NO_PROJECT_NAME = "No Linear project";

/**
 * Group Linear issues by project and count them. Issues without a project are
 * collected under a single "No Linear project" bucket, which is always sorted
 * last regardless of size. Named projects are sorted by issue count desc, then
 * name asc for stable output.
 */
export function collectLinearProjects(issues: LinearIssue[]): ProjectSummary[] {
  const groups = new Map<string, ProjectSummary>();

  for (const issue of issues) {
    const key = issue.project ? issue.project.id : NO_PROJECT_NAME;
    const existing = groups.get(key);
    if (existing) {
      existing.issueCount += 1;
      existing.issues.push(issue);
    } else {
      groups.set(key, {
        project: issue.project,
        name: issue.project ? issue.project.name : NO_PROJECT_NAME,
        issueCount: 1,
        issues: [issue],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aNoProject = a.project === null;
    const bNoProject = b.project === null;
    if (aNoProject !== bNoProject) {
      return aNoProject ? 1 : -1; // "No Linear project" always last
    }
    if (b.issueCount !== a.issueCount) {
      return b.issueCount - a.issueCount;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Build the GitHub URL variants we query Linear with. Engineers most often
 * attach Linear to the PR, but sometimes to the issue, so we try both.
 */
export function githubUrlsForReport({
  owner,
  repo,
  prNumbers,
  issueNumbers,
}: {
  owner: string;
  repo: string;
  prNumbers: number[];
  issueNumbers: number[];
}): string[] {
  const base = `https://github.com/${owner}/${repo}`;
  const prUrls = prNumbers.map(n => `${base}/pull/${n}`);
  const issueUrls = issueNumbers.map(n => `${base}/issues/${n}`);
  return Array.from(new Set([...prUrls, ...issueUrls]));
}
