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
const DEFAULT_GRACE_DAYS = 3;
const GRAPHQL_BATCH_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function releaseBranch(major) {
  return `release-x.${major}.x`;
}

function locationKey({ ref, path }) {
  return `${ref}:${path}`;
}

function uniqueLocations(locations) {
  return [
    ...new Map(
      locations.map((location) => [locationKey(location), location]),
    ).values(),
  ];
}

function parseChangesetIds(text) {
  return [...text.matchAll(/^[ \t]*id:[ \t]*['"]?(v(\d+)\.[^'"\s]+)/gm)].map(
    ([, id, major]) => ({ id, major: Number(major) }),
  );
}

function changesetIdSet(text) {
  return new Set(text ? parseChangesetIds(text).map(({ id }) => id) : []);
}

function latestReleaseTag(tagNames, major) {
  const pattern = new RegExp(`^v0\\.${major}\\.(\\d+)(?:\\.(\\d+))?(-beta)?$`);
  const versions = tagNames.flatMap((name) => {
    const match = name.match(pattern);
    if (!match) {
      return [];
    }
    const [, patch, build = "0", beta] = match;
    return [{ name, key: [Number(patch), Number(build), beta ? 0 : 1] }];
  });
  const compareVersions = (a, b) => {
    const index = a.key.findIndex((part, i) => part !== b.key[i]);
    return index === -1 ? 0 : a.key[index] - b.key[index];
  };
  return versions.sort((a, b) => compareVersions(b, a))[0]?.name ?? null;
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
      {
        cause: error,
      },
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
        type === "blob" && /\.ya?ml$/.test(filePath),
    )
    .map(({ oid, path: filePath }) => ({
      path: filePath,
      oid,
      text: fs.readFileSync(path.join(repoRoot, filePath), "utf8"),
    }));
}

function flattenTree(tree) {
  const oids = new Map();
  for (const entry of tree.entries) {
    if (entry.type === "blob") {
      oids.set(entry.path, entry.oid);
    } else if (entry.type === "tree") {
      for (const child of entry.object?.entries ?? []) {
        if (child.type === "blob") {
          oids.set(child.path, child.oid);
        }
      }
    }
  }
  return oids;
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
    async tagNames(majors) {
      const results = await queryRepository(
        "release tags",
        majors.map(
          (major) =>
            `refs(refPrefix: "refs/tags/", query: ${JSON.stringify(`v0.${major}.`)}, first: 100, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) { nodes { name } }`,
        ),
      );
      return new Map(
        majors.map((major, index) => [
          major,
          results[index].refs.nodes.map(({ name }) => name),
        ]),
      );
    },

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
          return [ref, tree ? flattenTree(tree) : null];
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

    async histories(locations) {
      const results = await queryRepository(
        "migration file history",
        locations.map(({ ref, path: filePath }) =>
          objectAt(
            ref,
            `... on Commit { history(path: ${JSON.stringify(filePath)}, first: 100) { nodes { oid committedDate associatedPullRequests(first: 5) { nodes { number url mergedAt baseRefName } } } } }`,
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
            commit.history.nodes.map((node) => ({
              sha: node.oid,
              committedDate: node.committedDate,
              prs: node.associatedPullRequests.nodes,
            })),
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

async function resolveReleases({ majors, newestSupportedMajor, reader }) {
  const tagNames = await reader.tagNames(majors);
  const failures = {};
  const releases = [];
  for (const major of majors) {
    const tag = latestReleaseTag(tagNames.get(major) ?? [], major);
    if (tag) {
      releases.push({ major, tag, branch: releaseBranch(major) });
    } else if (major <= newestSupportedMajor) {
      failures[major] = `No v0.${major}.x release tag found`;
    }
  }

  const trees = await reader.trees(
    releases.flatMap(({ tag, branch }) => [tag, branch]),
  );
  const resolved = [];
  for (const release of releases) {
    const missingRef = [release.tag, release.branch].find(
      (ref) => !trees.get(ref),
    );
    if (missingRef) {
      failures[release.major] =
        `Could not read ${MIGRATIONS_DIR} at ${missingRef}`;
    } else {
      resolved.push({
        ...release,
        tagTree: trees.get(release.tag),
        branchTree: trees.get(release.branch),
      });
    }
  }
  return { releases: resolved, failures };
}

function isMigrationFile(filePath) {
  return /\.ya?ml$/.test(filePath);
}

async function findPendingIds({ headFiles, releases, reader }) {
  const headOids = new Map(headFiles.map((file) => [file.path, file.oid]));
  const headIds = new Map(
    headFiles.map((file) => [file.path, changesetIdSet(file.text)]),
  );
  const headChangesets = headFiles.flatMap((file) =>
    parseChangesetIds(file.text).map(({ id, major }) => ({
      id,
      major,
      file: file.path,
    })),
  );

  const refs = releases.flatMap(
    ({ major, tag, branch, tagTree, branchTree }) => {
      const headPaths = new Set(
        headChangesets
          .filter((changeset) => changeset.major === major)
          .map(({ file }) => file),
      );
      return [
        [tag, tagTree],
        [branch, branchTree],
      ].map(([ref, tree]) => {
        const releaseOnlyPaths = [...tree.keys()].filter(
          (filePath) => isMigrationFile(filePath) && !headOids.has(filePath),
        );
        const paths = [...headPaths, ...releaseOnlyPaths].filter((filePath) =>
          tree.has(filePath),
        );
        return { ref, tree, paths };
      });
    },
  );

  const texts = await reader.blobTexts(
    uniqueLocations(
      refs.flatMap(({ ref, tree, paths }) =>
        paths
          .filter((filePath) => tree.get(filePath) !== headOids.get(filePath))
          .map((filePath) => ({ ref, path: filePath })),
      ),
    ),
  );

  const idPaths = new Map(
    refs.map(({ ref, tree, paths }) => [
      ref,
      new Map(
        paths.flatMap((filePath) => {
          const ids =
            tree.get(filePath) === headOids.get(filePath)
              ? headIds.get(filePath)
              : changesetIdSet(texts.get(locationKey({ ref, path: filePath })));
          return [...ids].map((id) => [id, filePath]);
        }),
      ),
    ]),
  );

  return releases.flatMap(({ major, tag, branch }) =>
    headChangesets
      .filter(
        (changeset) =>
          changeset.major === major && !idPaths.get(tag).has(changeset.id),
      )
      .map((changeset) => ({
        ...changeset,
        branch,
        branchFile: idPaths.get(branch).get(changeset.id) ?? null,
      })),
  );
}

function mergedPrs(prs, base) {
  return prs
    .filter((pr) => pr.mergedAt && pr.baseRefName === base)
    .map(({ number, url }) => ({ number, url }));
}

async function findAddingCommits({ pendingIds, headRef, reader }) {
  const historyLocations = uniqueLocations(
    pendingIds.flatMap(({ file, branch, branchFile }) => [
      { ref: headRef, path: file },
      ...(branchFile ? [{ ref: branch, path: branchFile }] : []),
    ]),
  );
  const histories = await reader.histories(historyLocations);
  const texts = await reader.blobTexts(
    uniqueLocations(
      historyLocations.flatMap((location) =>
        histories
          .get(locationKey(location))
          .map(({ sha }) => ({ ref: sha, path: location.path })),
      ),
    ),
  );

  return ({ ref, path: file, id, base }) => {
    const commit = histories
      .get(locationKey({ ref, path: file }))
      .findLast(({ sha }) =>
        changesetIdSet(texts.get(locationKey({ ref: sha, path: file }))).has(
          id,
        ),
      );
    return commit
      ? {
          sha: commit.sha,
          committedDate: commit.committedDate,
          prs: mergedPrs(commit.prs, base),
        }
      : null;
  };
}

/**
 * Finds the changesets on HEAD that the latest release of their major does not
 * have yet. It checks every major from the oldest supported one up to the
 * newest major on HEAD, because a downgrade goes through each of them. A major
 * newer than every supported major that has no release yet is left out.
 *
 * Each changeset has a status:
 * - `awaiting-release`: the release branch has it, so the next release will too.
 * - `awaiting-backport`: the release branch does not have it, and it reached
 *   master less than `graceDays` ago.
 * - `missing`: the release branch does not have it, and it reached master
 *   earlier than that, or its master commit could not be found.
 *
 * @returns {Promise<{ pending: Record<number, object[]>, failures: Record<number, string> }>}
 *   `failures` has a reason for each major that could not be checked.
 */
async function findUnreleasedChangesets({
  supportedMajors,
  headFiles,
  headRef,
  reader,
  now = Date.now(),
  graceDays = DEFAULT_GRACE_DAYS,
}) {
  const { releases, failures } = await resolveReleases({
    majors: majorsToCheck({ supportedMajors, headFiles }),
    newestSupportedMajor: Math.max(...supportedMajors),
    reader,
  });
  const pendingIds = await findPendingIds({ headFiles, releases, reader });
  if (pendingIds.length === 0) {
    return { pending: {}, failures };
  }

  const addingCommit = await findAddingCommits({ pendingIds, headRef, reader });
  const pending = {};
  for (const { major, id, file, branch, branchFile } of pendingIds) {
    const onBranch = branchFile !== null;
    const commit = addingCommit({
      ref: headRef,
      path: file,
      id,
      base: MASTER_BRANCH,
    });
    const backport = onBranch
      ? addingCommit({ ref: branch, path: branchFile, id, base: branch })
      : null;
    const status = onBranch
      ? "awaiting-release"
      : commit && now - Date.parse(commit.committedDate) <= graceDays * DAY_MS
        ? "awaiting-backport"
        : "missing";
    (pending[major] ??= []).push({
      major,
      id,
      file,
      status,
      commit: commit && { sha: commit.sha, prs: commit.prs },
      backport: backport && { sha: backport.sha, prs: backport.prs },
    });
  }
  return { pending, failures };
}

function isBlocking({ status }) {
  return status !== "missing";
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
        commit?.sha.slice(0, 10) ?? "not found",
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
  headFiles,
  reader,
  now,
  graceDays,
}) {
  let pending = {};
  let failures = {};
  try {
    ({ pending, failures } = await findUnreleasedChangesets({
      supportedMajors,
      headFiles: headFiles ?? readHeadMigrations(),
      headRef: context.sha,
      reader: reader ?? createGithubReader({ github, ...context.repo }),
      now,
      graceDays,
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
  for (const { major, id, commit, backport } of changesets) {
    if (!commit) {
      warn(`Could not find the master commit that added ${id}`);
      continue;
    }
    if (!commits.has(commit.sha)) {
      commits.set(commit.sha, { ...commit, majors: new Map() });
    }
    const { majors } = commits.get(commit.sha);
    if (!majors.has(major)) {
      majors.set(major, { major, ids: [], backport: null });
    }
    const entry = majors.get(major);
    entry.ids.push(id);
    entry.backport ??= backport;
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

function formatReleaseNeededMessage({ owner, repo, runUrl, commit }) {
  const ids = commit.majors.flatMap((entry) => entry.ids);
  const versions = commit.majors.map(({ major }) => `v${major}`).join(", ");

  return [
    `:warning: *${commitLink({ owner, repo, ...commit })} breaks cross version tests!*`,
    `It added migrations ${ids.map((id) => `\`${id}\``).join(", ")} to master, but no release of ${versions} has them yet. Please backport and release these changes!`,
    ...commit.majors.map(({ major, backport }) =>
      backport
        ? `• v${major}: backported in ${commitLink({ owner, repo, ...backport })}, but not released yet`
        : `• v${major}: not backported yet`,
    ),
    `Cross-version downgrades from master to versions older than ${versions} are skipped until a release has them. <${runUrl}|Run>`,
  ].join("\n");
}

async function notifyReleaseNeeded({
  context,
  core,
  changesets,
  channelName,
  findSlackMessage,
  sendSlackMessage,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const commits = groupByMasterCommit({ changesets, warn: core.warning });

  for (const commit of commits) {
    const url = commitUrl({ owner, repo, sha: commit.sha });
    const existing = await findSlackMessage({ channelName, text: url }).catch(
      console.error,
    );
    if (existing) {
      console.log(`Already sent a notification for ${url}`);
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
  parseChangesetIds,
  latestReleaseTag,
  readHeadMigrations,
  createGithubReader,
  findUnreleasedChangesets,
  buildGatedCrossVersionMatrix,
  generateCrossVersionMatrix,
  groupByMasterCommit,
  formatReleaseNeededMessage,
  notifyReleaseNeeded,
};
