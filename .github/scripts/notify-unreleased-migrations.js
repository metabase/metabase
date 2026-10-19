function downgradeMajors({ target, currentVersion }) {
  const targetMajor = Number(target.match(/^v\d+\.(\d+)\.x$/)[1]);
  const majors = [];
  for (let major = targetMajor + 1; major <= currentVersion; major++) {
    majors.push(major);
  }
  return majors;
}

function parsePendingChangesets(major, output) {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" "))
    .filter(([, status]) => status !== "missing")
    .map(([id, status, file]) => ({ major, id, status, file }));
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
  majors,
  listPendingChangesets = runPendingChangesetsScript,
  warn = console.warn,
}) {
  return majors.flatMap((major) => {
    try {
      return parsePendingChangesets(major, listPendingChangesets(major));
    } catch (error) {
      warn(
        `Could not check v${major} for unreleased migrations: ${error.message}`,
      );
      return [];
    }
  });
}

async function findOldestCommit({ github, owner, repo, ref, path }) {
  const { data } = await github.rest.repos.listCommits({
    owner,
    repo,
    sha: ref,
    path,
    per_page: 100,
  });
  return data.at(-1);
}

async function findMergedPrs({ github, owner, repo, sha, base }) {
  const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit(
    { owner, repo, commit_sha: sha },
  );
  return data.filter((pr) => pr.merged_at && pr.base.ref === base);
}

async function findMasterCommits({
  github,
  owner,
  repo,
  ref,
  changesets,
  warn,
}) {
  const commits = new Map();
  for (const { major, id, status, file } of changesets) {
    const commit = await findOldestCommit({
      github,
      owner,
      repo,
      ref,
      path: file,
    });
    if (!commit) {
      warn(`No commit on master has ${file}`);
      continue;
    }

    if (!commits.has(commit.sha)) {
      const prs = await findMergedPrs({
        github,
        owner,
        repo,
        sha: commit.sha,
        base: "master",
      });
      commits.set(commit.sha, { sha: commit.sha, prs, majors: new Map() });
    }

    const { majors } = commits.get(commit.sha);
    if (!majors.has(major)) {
      majors.set(major, { major, status, file, ids: [], backport: null });
    }
    const entry = majors.get(major);
    entry.ids.push(id);
    if (status === "awaiting-backport") {
      entry.status = status;
    }
  }

  const result = [];
  for (const { sha, prs, majors } of commits.values()) {
    const majorEntries = [...majors.values()];
    for (const entry of majorEntries) {
      if (entry.status !== "awaiting-release") {
        continue;
      }
      const branch = `release-x.${entry.major}.x`;
      const backport = await findOldestCommit({
        github,
        owner,
        repo,
        ref: branch,
        path: entry.file,
      });
      if (backport) {
        entry.backport = {
          sha: backport.sha,
          prs: await findMergedPrs({
            github,
            owner,
            repo,
            sha: backport.sha,
            base: branch,
          }),
        };
      }
    }
    result.push({ sha, prs, majors: majorEntries });
  }
  return result;
}

function commitUrl({ owner, repo, sha }) {
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

function commitLink({ owner, repo, sha, prs }) {
  const prLinks =
    prs.map((pr) => `<${pr.html_url}|#${pr.number}>`).join(", ") ||
    "no PR found";
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
  github,
  context,
  core,
  majors,
  channelName,
  findSlackMessage,
  sendSlackMessage,
  listPendingChangesets,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const changesets = findPendingChangesets({
    majors,
    listPendingChangesets,
    warn: core.warning,
  });
  const commits = await findMasterCommits({
    github,
    owner,
    repo,
    ref: context.sha,
    changesets,
    warn: core.warning,
  });

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
  downgradeMajors,
  parsePendingChangesets,
  findPendingChangesets,
  findMasterCommits,
  formatReleaseNeededMessage,
  notifyReleaseNeeded,
};
