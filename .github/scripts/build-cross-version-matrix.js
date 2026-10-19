// This script is used in .github/workflows/cross-version.yml
// to generate a matrix for cross-version migration testing

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

const MIGRATIONS_DIR = "resources/migrations";
const MASTER_BRANCH = "master";
const GRAPHQL_BATCH_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function releaseTag(major) {
  return `v0.${major}.x`;
}

function locationKey({ ref, path }) {
  return `${ref}:${path}`;
}

function isMigrationFile(filePath) {
  return /\.ya?ml$/.test(filePath);
}

function parseChangesetIds(text) {
  return [...text.matchAll(/^[ \t]*id:[ \t]*['"]?(v(\d+)\.[^'"\s]+)/gm)].map(
    ([, id, major]) => ({ id, major: Number(major) }),
  );
}

function changesetIdSet(text) {
  return new Set(text ? parseChangesetIds(text).map(({ id }) => id) : []);
}

function parseGraceDays(value) {
  const graceDays = Number(value);
  if (value === undefined || value === "" || !(graceDays >= 0)) {
    throw new Error(
      `Invalid grace period: ${JSON.stringify(value)}. Set MIGRATION_GRACE_DAYS to a number of days.`,
    );
  }
  return graceDays;
}

function readHeadMigrations(repoRoot = path.join(__dirname, "../..")) {
  let listing;
  try {
    listing = execFileSync(
      "git",
      ["-C", repoRoot, "ls-tree", "-r", "HEAD", "--", MIGRATIONS_DIR],
      { encoding: "utf8" },
    );
  } catch (error) {
    throw new Error(
      `Could not list ${MIGRATIONS_DIR} at HEAD: ${error.message}`,
      { cause: error },
    );
  }
  return listing
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, filePath] = line.split("\t");
      const [, type, oid] = meta.split(" ");
      return { type, oid, path: filePath };
    })
    .filter(
      ({ type, path: filePath }) =>
        type === "blob" && isMigrationFile(filePath),
    )
    .map(({ oid, path: filePath }) => ({
      path: filePath,
      oid,
      text: fs.readFileSync(path.join(repoRoot, filePath), "utf8"),
    }));
}

function migrationFileOids(tree) {
  const entries = tree.entries.flatMap((entry) =>
    entry.type === "tree" ? (entry.object?.entries ?? []) : [entry],
  );
  return new Map(
    entries
      .filter(
        ({ type, path: filePath }) =>
          type === "blob" && isMigrationFile(filePath),
      )
      .map(({ path: filePath, oid }) => [filePath, oid]),
  );
}

function createGithubReader({ github, owner, repo }) {
  async function queryRepository(description, fields) {
    const results = [];
    for (let start = 0; start < fields.length; start += GRAPHQL_BATCH_SIZE) {
      const batch = fields.slice(start, start + GRAPHQL_BATCH_SIZE);
      const body = batch
        .map(
          (field, index) =>
            `r${index}: repository(owner: $owner, name: $repo) { ${field} }`,
        )
        .join("\n");
      let data;
      try {
        data = await github.graphql(
          `query($owner: String!, $repo: String!) {\n${body}\n}`,
          { owner, repo },
        );
      } catch (error) {
        throw new Error(
          `GitHub GraphQL request for ${description} failed: ${error.message}`,
          { cause: error },
        );
      }
      results.push(...batch.map((_, index) => data[`r${index}`]));
    }
    return results;
  }

  const objectAt = (expression, selection) =>
    `object(expression: ${JSON.stringify(expression)}) { ${selection} }`;

  return {
    async trees(refs) {
      const results = await queryRepository(
        `${MIGRATIONS_DIR} trees`,
        refs.map((ref) =>
          objectAt(
            `${ref}:${MIGRATIONS_DIR}`,
            "... on Tree { entries { path oid type object { ... on Tree { entries { path oid type } } } } }",
          ),
        ),
      );
      return new Map(
        refs.map((ref, index) => {
          const tree = results[index].object;
          return [ref, tree ? migrationFileOids(tree) : null];
        }),
      );
    },

    async blobTexts(locations) {
      const results = await queryRepository(
        "migration files",
        locations.map((location) =>
          objectAt(locationKey(location), "... on Blob { text isTruncated }"),
        ),
      );
      return new Map(
        locations.map((location, index) => {
          const blob = results[index].object;
          if (blob && (typeof blob.text !== "string" || blob.isTruncated)) {
            throw new Error(`Could not read ${locationKey(location)}`);
          }
          return [locationKey(location), blob?.text ?? null];
        }),
      );
    },

    async histories(locations, since) {
      const results = await queryRepository(
        "migration file history",
        locations.map(({ ref, path: filePath }) =>
          objectAt(
            ref,
            `... on Commit { recent: history(path: ${JSON.stringify(filePath)}, since: ${JSON.stringify(since)}, first: 100) { nodes { oid associatedPullRequests(first: 5) { nodes { number url mergedAt baseRefName } } } } before: history(path: ${JSON.stringify(filePath)}, until: ${JSON.stringify(since)}, first: 1) { nodes { oid } } }`,
          ),
        ),
      );
      return new Map(
        locations.map((location, index) => {
          const commit = results[index].object;
          if (!commit) {
            throw new Error(`Could not read the history of ${location.ref}`);
          }
          return [
            locationKey(location),
            {
              before: commit.before.nodes[0]?.oid ?? null,
              recent: commit.recent.nodes.map((node) => ({
                sha: node.oid,
                prs: node.associatedPullRequests.nodes,
              })),
            },
          ];
        }),
      );
    },
  };
}

function majorsToCheck({ supportedMajors, headFiles }) {
  const oldest = Math.min(...supportedMajors);
  const newest = Math.max(
    ...supportedMajors,
    ...headFiles.flatMap((file) =>
      parseChangesetIds(file.text).map(({ major }) => major),
    ),
  );
  return Array.from({ length: newest - oldest + 1 }, (_, i) => oldest + i);
}

async function readReleases({ majors, newestSupportedMajor, reader }) {
  const trees = await reader.trees(majors.map(releaseTag));
  const releases = [];
  const failures = {};
  for (const major of majors) {
    const tag = releaseTag(major);
    const tree = trees.get(tag);
    if (tree) {
      releases.push({ major, tag, tree });
    } else if (major <= newestSupportedMajor) {
      failures[major] = `Could not read ${MIGRATIONS_DIR} at ${tag}`;
    }
  }
  return { releases, failures };
}

async function findPendingIds({ headFiles, releases, reader }) {
  const idsByOid = new Map(
    headFiles.map((file) => [file.oid, changesetIdSet(file.text)]),
  );
  const texts = await reader.blobTexts(
    releases.flatMap(({ tag, tree }) =>
      [...tree]
        .filter(([, oid]) => !idsByOid.has(oid))
        .map(([filePath]) => ({ ref: tag, path: filePath })),
    ),
  );

  return releases.flatMap(({ major, tag, tree }) => {
    const releaseIds = new Set(
      [...tree].flatMap(([filePath, oid]) => [
        ...(idsByOid.get(oid) ??
          changesetIdSet(texts.get(locationKey({ ref: tag, path: filePath })))),
      ]),
    );
    return headFiles.flatMap((file) =>
      parseChangesetIds(file.text)
        .filter(
          (changeset) =>
            changeset.major === major && !releaseIds.has(changeset.id),
        )
        .map(({ id }) => ({ major, id, file: file.path })),
    );
  });
}

function mergedPrs(prs) {
  return prs
    .filter((pr) => pr.mergedAt && pr.baseRefName === MASTER_BRANCH)
    .map(({ number, url }) => ({ number, url }));
}

async function findRecentCommits({ files, headRef, since, reader }) {
  const locations = files.map((filePath) => ({ ref: headRef, path: filePath }));
  const histories = await reader.histories(locations, since);
  const texts = await reader.blobTexts(
    locations.flatMap((location) => {
      const { before, recent } = histories.get(locationKey(location));
      const shas = recent.length > 0 && before ? [before] : [];
      return [...shas, ...recent.map(({ sha }) => sha)].map((sha) => ({
        ref: sha,
        path: location.path,
      }));
    }),
  );

  return ({ id, file }) => {
    const { before, recent } = histories.get(
      locationKey({ ref: headRef, path: file }),
    );
    const hasId = (sha) =>
      changesetIdSet(texts.get(locationKey({ ref: sha, path: file }))).has(id);
    if (recent.length === 0 || (before && hasId(before))) {
      return null;
    }
    const commit = recent.findLast(({ sha }) => hasId(sha));
    return commit ? { sha: commit.sha, prs: mergedPrs(commit.prs) } : null;
  };
}

/**
 * Finds the changesets on HEAD that the latest release of their major
 * (the `v0.N.x` tag) does not have yet. It checks every major from the oldest
 * supported one up to the newest major on HEAD, because a downgrade goes
 * through each of them. A major newer than every supported major that has no
 * release yet is left out.
 *
 * Each changeset has a status:
 * - `in-grace-period`: it reached master less than `graceDays` ago. `commit`
 *   is the master commit that added it.
 * - `past-grace-period`: it reached master earlier than that. `commit` is null.
 *
 * @returns {Promise<{ pending: Record<number, object[]>, failures: Record<number, string> }>}
 *   `failures` has a reason for each major that could not be checked.
 */
async function findUnreleasedChangesets({
  supportedMajors,
  headFiles,
  headRef,
  reader,
  graceDays,
  now = Date.now(),
}) {
  const { releases, failures } = await readReleases({
    majors: majorsToCheck({ supportedMajors, headFiles }),
    newestSupportedMajor: Math.max(...supportedMajors),
    reader,
  });
  const pendingIds = await findPendingIds({ headFiles, releases, reader });
  if (pendingIds.length === 0) {
    return { pending: {}, failures };
  }

  const recentCommit = await findRecentCommits({
    files: [...new Set(pendingIds.map(({ file }) => file))],
    headRef,
    since: new Date(now - graceDays * DAY_MS).toISOString(),
    reader,
  });
  const pending = {};
  for (const changeset of pendingIds) {
    const commit = recentCommit(changeset);
    (pending[changeset.major] ??= []).push({
      ...changeset,
      status: commit ? "in-grace-period" : "past-grace-period",
      commit,
    });
  }
  return { pending, failures };
}

function isBlocking({ status }) {
  return status === "in-grace-period";
}

function buildGatedCrossVersionMatrix({ supportedMajors, pending }) {
  const { config } = buildCrossVersionMatrix(supportedMajors);
  const blockedMajors = Object.entries(pending)
    .filter(([, changesets]) => changesets.some(isBlocking))
    .map(([major]) => Number(major));
  const gatedConfig = excludeBlockedDowngrades(config, blockedMajors);
  const skipped = config.filter((entry) => !gatedConfig.includes(entry));
  const oldestMajor = Math.min(...supportedMajors);
  const unreleased = Object.values(pending)
    .flat()
    .filter(
      (changeset) => isBlocking(changeset) && changeset.major > oldestMajor,
    );

  return { config: gatedConfig, skipped, unreleased };
}

async function writeSummary({ core, pending, skipped, failures }) {
  const changesets = Object.values(pending).flat();
  const failureLines = Object.entries(failures).map(
    ([major, reason]) => `v${major}: ${reason}`,
  );
  if (changesets.length === 0 && failureLines.length === 0) {
    return;
  }

  core.summary.addHeading("Unreleased migrations", 3);
  if (changesets.length > 0) {
    core.summary.addTable([
      [
        { data: "Major", header: true },
        { data: "Changeset", header: true },
        { data: "Status", header: true },
        { data: "Master commit", header: true },
      ],
      ...changesets.map(({ major, id, status, commit }) => [
        `v${major}`,
        id,
        status,
        commit?.sha.slice(0, 10) ?? "before the grace period",
      ]),
    ]);
  }
  if (skipped.length > 0) {
    core.summary
      .addHeading("Skipped downgrades", 4)
      .addList(skipped.map((e) => `${e.source} → ${e.target}`));
  }
  if (failureLines.length > 0) {
    core.summary
      .addHeading(
        "Majors that could not be checked (downgrades not skipped)",
        4,
      )
      .addList(failureLines);
  }
  await core.summary.write();
}

async function generateCrossVersionMatrix({
  core,
  github,
  context,
  supportedMajors,
  graceDays,
  headFiles,
  reader,
  now,
}) {
  const validGraceDays = parseGraceDays(graceDays);
  let pending = {};
  let failures = {};
  try {
    ({ pending, failures } = await findUnreleasedChangesets({
      supportedMajors,
      headFiles: headFiles ?? readHeadMigrations(),
      headRef: context.sha,
      reader: reader ?? createGithubReader({ github, ...context.repo }),
      graceDays: validGraceDays,
      now,
    }));
  } catch (error) {
    failures = Object.fromEntries(
      supportedMajors.map((major) => [major, error.message]),
    );
  }
  for (const [major, reason] of Object.entries(failures)) {
    core.warning(
      `Could not check v${major} for unreleased migrations, so no downgrade is skipped for it: ${reason}`,
    );
  }

  const { config, skipped, unreleased } = buildGatedCrossVersionMatrix({
    supportedMajors,
    pending,
  });
  if (skipped.length > 0) {
    core.warning(
      `Skipping ${skipped.map((e) => `${e.source} → ${e.target}`).join(", ")}: master has migrations that these releases do not have yet`,
    );
  }
  await writeSummary({ core, pending, skipped, failures });

  const matrix = JSON.stringify({ include: config });
  core.setOutput("unreleased-changesets", JSON.stringify(unreleased));
  core.setOutput("matrix", matrix);
  console.log("matrix:", matrix);
}

function groupByMasterCommit({ changesets, warn }) {
  const commits = new Map();
  for (const { major, id, commit } of changesets) {
    if (!commit) {
      warn(`Could not find the master commit that added ${id}`);
      continue;
    }
    if (!commits.has(commit.sha)) {
      commits.set(commit.sha, { ...commit, majors: new Map() });
    }
    const { majors } = commits.get(commit.sha);
    if (!majors.has(major)) {
      majors.set(major, { major, ids: [] });
    }
    majors.get(major).ids.push(id);
  }
  return [...commits.values()].map(({ majors, ...commit }) => ({
    ...commit,
    majors: [...majors.values()],
  }));
}

function commitUrl({ owner, repo, sha }) {
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

function commitLink({ owner, repo, sha, prs }) {
  const prLinks =
    prs.map((pr) => `<${pr.url}|#${pr.number}>`).join(", ") || "no PR found";
  return `<${commitUrl({ owner, repo, sha })}|${sha.slice(0, 10)}> (${prLinks})`;
}

function formatReleaseNeededMessage({
  owner,
  repo,
  runUrl,
  commit,
  graceDays,
}) {
  const ids = commit.majors.flatMap((entry) => entry.ids);
  const versions = commit.majors.map(({ major }) => `v${major}`).join(", ");
  const days = graceDays === 1 ? "1 day" : `${graceDays} days`;

  return [
    `:warning: *${commitLink({ owner, repo, ...commit })} breaks cross version tests!*`,
    `It added migrations ${ids.map((id) => `\`${id}\``).join(", ")} to master, but no release of ${versions} has them yet. Please backport and release these changes!`,
    `Cross-version downgrades from master to versions older than ${versions} are skipped for ${days} after this commit. After that, they run again and fail until a release has these migrations. <${runUrl}|Run>`,
  ].join("\n");
}

async function notifyReleaseNeeded({
  context,
  core,
  changesets,
  graceDays,
  channelName,
  findSlackMessage,
  sendSlackMessage,
  dryRun = false,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const validGraceDays = parseGraceDays(graceDays);
  const commits = groupByMasterCommit({ changesets, warn: core.warning });

  for (const commit of commits) {
    const url = commitUrl({ owner, repo, sha: commit.sha });
    if (dryRun) {
      const message = formatReleaseNeededMessage({
        owner,
        repo,
        runUrl,
        commit,
        graceDays: validGraceDays,
      });
      console.log(`Dry run, not sent to Slack:\n${message}`);
      continue;
    }
    const existing = await findSlackMessage({ channelName, text: url }).catch(
      console.error,
    );
    if (existing) {
      console.log(`Already sent a notification for ${url}`);
      continue;
    }

    const message = formatReleaseNeededMessage({
      owner,
      repo,
      runUrl,
      commit,
      graceDays: validGraceDays,
    });
    console.log(message);
    await sendSlackMessage({ channelName, message }).catch(console.error);
  }
}

module.exports = {
  buildCrossVersionMatrix,
  excludeBlockedDowngrades,
  parseChangesetIds,
  readHeadMigrations,
  createGithubReader,
  findUnreleasedChangesets,
  buildGatedCrossVersionMatrix,
  generateCrossVersionMatrix,
  groupByMasterCommit,
  formatReleaseNeededMessage,
  notifyReleaseNeeded,
};
