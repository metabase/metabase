// This script is used in .github/workflows/cross-version.yml
// to generate a matrix for cross-version migration testing

/**
 * Generate a CI matrix for cross-version migration testing (EE only).
 *
 * Creates pairs of [source, target] for testing HEAD against every in-support
 * major version, in both upgrade and downgrade directions.
 *
 * The caller supplies the supported majors — in CI that comes from
 * `getSupportedMajors()`, which reads `major_version_support` from
 * version-info.json and keeps the lines whose `eol` is today or later. That is
 * the same source auto-backport and schedule-minor use, so a major drops out of
 * this matrix on the day it stops being a backport target.
 *
 * @param {number[]} supportedMajors - In-support major version numbers (e.g. [59, 58, 56])
 * @returns {{ config: Array<{ source: string, target: string }> }}
 *
 * @example
 * buildCrossVersionMatrix([59, 58, 56])
 * // Returns:
 * // {
 * //   config: [
 * //     { source: "HEAD", target: "v1.59.x" },
 * //     { source: "v1.59.x", target: "HEAD" },
 * //     { source: "HEAD", target: "v1.58.x" },
 * //     { source: "v1.58.x", target: "HEAD" },
 * //     { source: "HEAD", target: "v1.56.x" },
 * //     { source: "v1.56.x", target: "HEAD" },
 * //   ]
 * // }
 */
function buildCrossVersionMatrix(supportedMajors) {
  if (!Array.isArray(supportedMajors) || supportedMajors.length === 0) {
    throw new Error(
      `Invalid supportedMajors: ${JSON.stringify(supportedMajors)}. Must be a non-empty array of positive integers.`,
    );
  }

  // findIndex rather than find, so an `undefined` entry is still reported.
  const invalidIndex = supportedMajors.findIndex(
    (majorVersion) => !Number.isInteger(majorVersion) || majorVersion < 1,
  );

  if (invalidIndex !== -1) {
    throw new Error(
      `Invalid major version: ${supportedMajors[invalidIndex]}. Must be a positive integer.`,
    );
  }

  // Newest first, so the most recently released major is tested first and a
  // duplicated line in version-info.json can't double the matrix.
  const majors = [...new Set(supportedMajors)].sort((a, b) => b - a);

  const config = majors.flatMap((majorVersion) => {
    const version = `v1.${majorVersion}.x`;
    return [
      { source: "HEAD", target: version },
      { source: version, target: "HEAD" },
    ];
  });

  return { config };
}

function excludeBlockedDowngrades(config, blockedMajors) {
  return config.filter(({ source, target }) => {
    if (source !== "HEAD") {
      return true;
    }
    const targetMajor = Number(target.match(/^v\d+\.(\d+)\.x$/)[1]);
    return !blockedMajors.some((major) => major > targetMajor);
  });
}

function parsePendingChangesets(output) {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" "))
    .filter(([, status]) => status !== "missing");
}

function runPendingChangesetsScript(major) {
  const { execFileSync } = require("child_process");
  const path = require("path");
  const script = path.join(
    __dirname,
    "../../cross-version/pending-changesets.sh",
  );
  return execFileSync(script, [String(major)], { encoding: "utf8" });
}

function findPendingChangesets({
  supportedMajors,
  listPendingChangesets = runPendingChangesetsScript,
  warn = console.warn,
}) {
  const pending = {};
  for (const major of supportedMajors) {
    try {
      const changesets = parsePendingChangesets(listPendingChangesets(major));
      if (changesets.length > 0) {
        pending[major] = changesets;
      }
    } catch (error) {
      warn(
        `Could not check v${major} for unreleased migrations: ${error.message}`,
      );
    }
  }
  return pending;
}

function buildGatedCrossVersionMatrix({ supportedMajors, pending }) {
  const { config } = buildCrossVersionMatrix(supportedMajors);
  const blockedMajors = Object.keys(pending).map(Number);
  const gatedConfig = excludeBlockedDowngrades(config, blockedMajors);
  const skipped = config.filter((entry) => !gatedConfig.includes(entry));
  const awaitingRelease = Object.entries(pending).flatMap(
    ([major, changesets]) =>
      changesets
        .filter(([, status]) => status === "awaiting-release")
        .map(([id, , file]) => ({ major: Number(major), id, file })),
  );

  return { config: gatedConfig, skipped, awaitingRelease };
}

async function generateCrossVersionMatrix({
  core,
  supportedMajors,
  listPendingChangesets,
}) {
  const pending = findPendingChangesets({
    supportedMajors,
    listPendingChangesets,
    warn: core.warning,
  });
  const { config, skipped, awaitingRelease } = buildGatedCrossVersionMatrix({
    supportedMajors,
    pending,
  });

  if (skipped.length > 0) {
    const skippedNames = skipped.map((e) => `${e.source} → ${e.target}`);
    core.warning(
      `Skipping ${skippedNames.join(", ")}: master has migrations that these releases do not have yet`,
    );
    await core.summary
      .addHeading("Cross-version downgrades skipped until release", 3)
      .addTable([
        [
          { data: "Major", header: true },
          { data: "Changeset", header: true },
          { data: "Status", header: true },
        ],
        ...Object.entries(pending).flatMap(([major, changesets]) =>
          changesets.map(([id, status]) => [`v${major}`, id, status]),
        ),
      ])
      .addList(skippedNames)
      .write();
  }

  const matrix = JSON.stringify({ include: config });
  core.setOutput("awaiting-release", JSON.stringify(awaitingRelease));
  core.setOutput("matrix", matrix);
  console.log("matrix:", matrix);
}

async function findCommitsToRelease({ github, owner, repo, changesets, warn }) {
  const commits = new Map();
  for (const { major, id, file } of changesets) {
    const branch = `release-x.${major}.x`;
    const { data } = await github.rest.repos.listCommits({
      owner,
      repo,
      sha: branch,
      path: file,
      per_page: 100,
    });
    const commit = data.at(-1);
    if (!commit) {
      warn(`No commit on ${branch} has ${file}`);
      continue;
    }

    const key = `${major}:${commit.sha}`;
    if (!commits.has(key)) {
      const { data: prs } =
        await github.rest.repos.listPullRequestsAssociatedWithCommit({
          owner,
          repo,
          commit_sha: commit.sha,
        });
      commits.set(key, {
        major,
        branch,
        sha: commit.sha,
        prs: prs.filter((pr) => pr.merged_at && pr.base.ref === branch),
        ids: [],
      });
    }
    commits.get(key).ids.push(id);
  }
  return [...commits.values()];
}

function commitUrl({ owner, repo, sha }) {
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

function formatReleaseNeededMessage({ owner, repo, runUrl, commit }) {
  const { major, branch, sha, prs, ids } = commit;
  const prLinks =
    prs.map((pr) => `<${pr.html_url}|#${pr.number}>`).join(", ") ||
    "no PR found";
  return [
    `:warning: *v${major} needs a release.*`,
    `Commit <${commitUrl({ owner, repo, sha })}|${sha.slice(0, 10)}> (${prLinks}) added ${ids.map((id) => `\`${id}\``).join(", ")} to \`${branch}\`, but no v${major} release has it yet.`,
    `Cross-version downgrades from master to versions older than v${major} are skipped until a release has it. <${runUrl}|Run>`,
  ].join("\n");
}

async function notifyReleaseNeeded({
  github,
  context,
  core,
  changesets,
  channelName,
  findSlackMessage,
  sendSlackMessage,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const commits = await findCommitsToRelease({
    github,
    owner,
    repo,
    changesets,
    warn: core.warning,
  });

  for (const commit of commits) {
    const url = commitUrl({ owner, repo, sha: commit.sha });
    const existing = await findSlackMessage({ channelName, text: url }).catch(
      console.error,
    );
    if (existing) {
      console.log(`Already asked for a release of ${url}`);
      continue;
    }

    const message = formatReleaseNeededMessage({ owner, repo, runUrl, commit });
    console.log(message);
    await sendSlackMessage({ channelName, message }).catch(console.error);
  }
}

module.exports = {
  buildCrossVersionMatrix,
  excludeBlockedDowngrades,
  parsePendingChangesets,
  findPendingChangesets,
  buildGatedCrossVersionMatrix,
  generateCrossVersionMatrix,
  findCommitsToRelease,
  formatReleaseNeededMessage,
  notifyReleaseNeeded,
};
