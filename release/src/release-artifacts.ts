import type { GithubProps } from "./types";
import {
  getOSSVersion,
  isValidCommitHash,
  isValidVersionString,
} from "./version-helpers";

// Release 1 builds these; Release 2 and Release 3 fetch them by name.
const TAG_WORKFLOW = "tag-for-release.yml";
const TAG_WORKFLOW_NAME = "Release 1 - Tag Release Artifact";

const EDITIONS = ["oss", "ee"] as const;
type Edition = (typeof EDITIONS)[number];

const RELEASE_ARTIFACT_NAME =
  /^metabase-release-(?:oss|ee)-([0-9a-f]{40})-uberjar$/;

export const getReleaseArtifactName = (edition: Edition, commit: string) =>
  `metabase-release-${edition}-${commit}-uberjar`;

const shortSha = (commit: string) => commit.slice(0, 7);

type TagRun = {
  id: number;
  url: string;
  title: string;
  // null when the run's release artifacts have expired
  commit: string | null;
};

export type ReleaseArtifactCheck =
  | { ok: true }
  | {
      ok: false;
      version: string;
      commit: string;
      missing: string[];
      tagRun: TagRun | null;
    };

async function hasLiveArtifact({
  github,
  owner,
  repo,
  name,
}: GithubProps & { name: string }) {
  const { data } = await github.rest.actions.listArtifactsForRepo({
    owner,
    repo,
    name,
    per_page: 100,
  });

  return data.artifacts.some(
    (artifact) => artifact.name === name && !artifact.expired,
  );
}

const isSameVersion = (a: string, b: string) =>
  isValidVersionString(a) &&
  isValidVersionString(b) &&
  getOSSVersion(a) === getOSSVersion(b);

// The latest successful Release 1 run for this version, and the commit it built.
export async function findTagRun({
  github,
  owner,
  repo,
  version,
}: GithubProps & { version: string }): Promise<TagRun | null> {
  const { data } = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: TAG_WORKFLOW,
    status: "success",
    per_page: 100,
  });

  // Release 1's run-name is "Tag <version>", and it accepts either the v0 or v1 form.
  const run = data.workflow_runs.find((run) =>
    isSameVersion(run.display_title.replace(/^Tag /, ""), version),
  );

  if (!run) {
    return null;
  }

  const { data: artifacts } =
    await github.rest.actions.listWorkflowRunArtifacts({
      owner,
      repo,
      run_id: run.id,
      per_page: 100,
    });

  const commit =
    artifacts.artifacts
      .filter((artifact) => !artifact.expired)
      .map((artifact) => RELEASE_ARTIFACT_NAME.exec(artifact.name)?.[1])
      .find(Boolean) ?? null;

  return { id: run.id, url: run.html_url, title: run.display_title, commit };
}

export async function checkReleaseArtifacts({
  github,
  owner,
  repo,
  version,
  commit,
}: GithubProps & {
  version: string;
  commit: string;
}): Promise<ReleaseArtifactCheck> {
  if (!isValidCommitHash(commit)) {
    throw new Error(
      `"${commit}" is not a full-length commit SHA. Pass the 40-character SHA Release 1 built.`,
    );
  }

  const names = EDITIONS.map((edition) =>
    getReleaseArtifactName(edition, commit),
  );
  const found = await Promise.all(
    names.map((name) => hasLiveArtifact({ github, owner, repo, name })),
  );
  const missing = names.filter((_name, index) => !found[index]);

  if (missing.length === 0) {
    return { ok: true };
  }

  const tagRun = await findTagRun({ github, owner, repo, version });

  return { ok: false, version, commit, missing, tagRun };
}

type Link = (text: string, url: string) => string;

const plainLink: Link = (text, url) => `${text} (${url})`;

export function buildReleaseArtifactMismatchMessage(
  check: Extract<ReleaseArtifactCheck, { ok: false }>,
  link: Link = plainLink,
) {
  const { version, commit, missing, tagRun } = check;

  const problem = `No release uberjars for ${version} at commit ${shortSha(commit)}: ${missing.join(", ")} not found or expired.`;

  if (!tagRun) {
    return [
      problem,
      `No successful "${TAG_WORKFLOW_NAME}" run found for ${version}.`,
      `Run Release 1 for ${version} with commit ${commit} first, then re-run this workflow.`,
    ].join("\n");
  }

  const tagRunLink = link(tagRun.title, tagRun.url);

  if (!tagRun.commit) {
    return [
      problem,
      `${tagRunLink} has no release uberjars left; they may have expired.`,
      `Re-run Release 1 for ${version} with commit ${commit}, then re-run this workflow.`,
    ].join("\n");
  }

  if (tagRun.commit === commit) {
    return [
      problem,
      `${tagRunLink} built this commit, but its release uberjars could not be found.`,
      `Re-run Release 1 for ${version} with commit ${commit}, then re-run this workflow.`,
    ].join("\n");
  }

  return [
    problem,
    `${tagRunLink} built commit ${shortSha(tagRun.commit)}, not ${shortSha(commit)}.`,
    `To ship what Release 1 built, re-run this workflow with commit ${tagRun.commit}.`,
    `To ship ${shortSha(commit)}, re-run Release 1 for ${version} with commit ${commit} first.`,
  ].join("\n");
}
