// Thin GitHub REST helpers (fetch-based, no SDK) for the rollup entrypoint.

const API = "https://api.github.com";

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/** List every check-run on a commit SHA (paginated). */
export async function listCheckRunsForRef(
  owner: string,
  repo: string,
  ref: string,
  token: string,
): Promise<GitHubCheckRun[]> {
  const runs: GitHubCheckRun[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${API}/repos/${owner}/${repo}/commits/${ref}/check-runs?per_page=100&page=${page}`;
    const res = await fetch(url, {
      headers: headers(token),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`list check-runs HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { check_runs?: GitHubCheckRun[] };
    const page_runs = data.check_runs ?? [];
    for (const r of page_runs) {
      runs.push({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion });
    }
    if (page_runs.length < 100) {
      break;
    }
  }
  return runs;
}

export interface CheckRunOutput {
  title: string;
  summary: string;
  text?: string;
}

export interface UpsertInput {
  name: string;
  headSha: string;
  status: "in_progress" | "completed";
  conclusion?: "success" | "failure" | null;
  output: CheckRunOutput;
  /** When set, PATCH this existing check-run instead of creating a new one. */
  existingId?: number;
}

/** Create or update the aggregate check-run. */
export async function upsertCheckRun(
  owner: string,
  repo: string,
  input: UpsertInput,
  token: string,
): Promise<GitHubCheckRun> {
  const body: Record<string, unknown> = {
    name: input.name,
    status: input.status,
    output: input.output,
  };
  if (input.status === "completed") {
    body.conclusion = input.conclusion;
  }

  let url: string;
  let method: "POST" | "PATCH";
  if (input.existingId !== undefined) {
    url = `${API}/repos/${owner}/${repo}/check-runs/${input.existingId}`;
    method = "PATCH";
  } else {
    url = `${API}/repos/${owner}/${repo}/check-runs`;
    method = "POST";
    body.head_sha = input.headSha;
  }

  const res = await fetch(url, {
    method,
    headers: headers(token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`${method} check-run HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as GitHubCheckRun;
}
