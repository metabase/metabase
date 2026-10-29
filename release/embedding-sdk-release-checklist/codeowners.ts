// The step that mutes our team in CODEOWNERS on a new release branch, so we
// do not get review requests for the backports that the bot already approved.
import {
  type Action,
  type Link,
  type StepResult,
  blocked,
  done,
  manual,
  todo,
  withLinks,
} from "./checklist";
import {
  embeddingSdkVersionOnBranch,
  isVersionABeta,
  isVersionStable,
} from "./embedding-sdk-version-bumps";
import {
  METABASE_REPO,
  type PullRequest,
  commitFileOnBranch,
  doesBranchExist,
  findPullRequestsFromBranch,
  readFileAndItsShaOnBranch,
  readFileOnBranch,
} from "./external-calls";

const CODEOWNERS = ".github/CODEOWNERS";
const EMBEDDING_TEAM = "@metabase/embedding";

// We comment out every line with @metabase/embedding, once per release
// branch, with a commit on the first beta bump PR.
export async function checkCodeowners(major: number): Promise<StepResult> {
  return withLinks(await codeownersState(major), {
    pullRequests: (
      await findPullRequestsFromBranch(
        METABASE_REPO,
        `sdk-version-bump-0.${major}.0-beta.0`,
        `release-x.${major}.x`,
      )
    ).map((pr) => ({ ...pr, label: "the first beta bump PR" })),
    links: await codeownersLinksOf(`release-x.${major}.x`),
  });
}

async function codeownersLinksOf(releaseBranch: string): Promise<Link[]> {
  if (!(await doesBranchExist(METABASE_REPO, releaseBranch))) {
    return [];
  }
  return [
    {
      label: `${CODEOWNERS} on ${releaseBranch}`,
      url: `https://github.com/${METABASE_REPO}/blob/${releaseBranch}/${CODEOWNERS}`,
    },
  ];
}

async function codeownersState(major: number): Promise<StepResult> {
  const releaseBranch = `release-x.${major}.x`;

  if (!(await doesBranchExist(METABASE_REPO, releaseBranch))) {
    return blocked(`the cut of ${releaseBranch}`);
  }
  const activeLinesOnReleaseBranch = activeEmbeddingTeamLines(
    await readCodeowners(releaseBranch),
  );
  if (activeLinesOnReleaseBranch.length === 0) {
    return done(`${releaseBranch} has no active ${EMBEDDING_TEAM} line`);
  }

  const firstBetaBumpPr = await findOpenFirstBetaBumpPr(major);
  if (!firstBetaBumpPr) {
    if (await isReleaseBranchPastItsFirstBeta(releaseBranch)) {
      return manual(
        `the first beta is merged, but ${releaseBranch} still has ${activeLinesOnReleaseBranch.length} active ${EMBEDDING_TEAM} lines.`,
        `Open a PR on ${releaseBranch} that comments them out.`,
      );
    }
    return blocked(
      `the beta bump (its PR to ${releaseBranch} is not open yet)`,
    );
  }

  const codeownersOnPr = await readFileAndItsShaOnBranch(
    METABASE_REPO,
    CODEOWNERS,
    firstBetaBumpPr.headRefName,
  );
  const activeLinesOnPr = activeEmbeddingTeamLines(codeownersOnPr.text);
  if (activeLinesOnPr.length === 0) {
    return done(
      `${firstBetaBumpPr.url} mutes them, and the merge brings it to ${releaseBranch}`,
    );
  }
  return todo(
    muteEmbeddingTeamAction(firstBetaBumpPr, codeownersOnPr, releaseBranch),
    `${activeLinesOnPr.length} active ${EMBEDDING_TEAM} lines on ${firstBetaBumpPr.url}`,
  );
}

function muteEmbeddingTeamAction(
  firstBetaBumpPr: PullRequest,
  codeownersOnPr: { text: string; sha: string },
  releaseBranch: string,
): Action {
  const activeLines = activeEmbeddingTeamLines(codeownersOnPr.text);
  return {
    description: [
      `Commits one change to ${CODEOWNERS} on ${firstBetaBumpPr.headRefName}, the branch of ${firstBetaBumpPr.url}.`,
      `It comments out (it puts "# " in front of) these ${activeLines.length} lines:`,
      ...activeLines.map((line) => `  ${line}`),
      `The change reaches ${releaseBranch} when that PR merges. Nothing else changes.`,
    ],
    run: async (interaction) => {
      // GitHub refuses the commit if the file changed since we read its sha
      const commitUrl = await commitFileOnBranch(METABASE_REPO, CODEOWNERS, {
        text: commentOutEmbeddingTeamLines(codeownersOnPr.text),
        sha: codeownersOnPr.sha,
        branch: firstBetaBumpPr.headRefName,
        message: `Mute ${EMBEDDING_TEAM} codeowners on ${releaseBranch}`,
      });
      interaction.print(
        `  Committed to ${firstBetaBumpPr.headRefName}. Check it: ${commitUrl}`,
      );
      return "done";
    },
  };
}

async function readCodeowners(branch: string): Promise<string> {
  const text = await readFileOnBranch(METABASE_REPO, CODEOWNERS, branch);
  if (text == null) {
    throw new Error(`${CODEOWNERS} is missing on ${branch}`);
  }
  return text;
}

function activeEmbeddingTeamLines(codeowners: string): string[] {
  return codeowners.split("\n").filter(isLineAnActiveEmbeddingTeamOwner);
}

function isLineAnActiveEmbeddingTeamOwner(line: string): boolean {
  return !line.trimStart().startsWith("#") && line.includes(EMBEDDING_TEAM);
}

function commentOutEmbeddingTeamLines(codeowners: string): string {
  return codeowners
    .split("\n")
    .map((line) =>
      isLineAnActiveEmbeddingTeamOwner(line) ? `# ${line}` : line,
    )
    .join("\n");
}

async function findOpenFirstBetaBumpPr(
  major: number,
): Promise<PullRequest | null> {
  const pullRequests = await findPullRequestsFromBranch(
    METABASE_REPO,
    `sdk-version-bump-0.${major}.0-beta.0`,
    `release-x.${major}.x`,
  );
  return pullRequests.find((pr) => pr.state === "OPEN") ?? null;
}

async function isReleaseBranchPastItsFirstBeta(
  releaseBranch: string,
): Promise<boolean> {
  const version = await embeddingSdkVersionOnBranch(releaseBranch);
  return isVersionABeta(version) || isVersionStable(version);
}
