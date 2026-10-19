function downgradeMajors({ target, currentVersion }) {
  const targetMajor = Number(target.match(/^v\d+\.(\d+)\.x$/)[1]);
  const majors = [];
  for (let major = targetMajor + 1; major <= currentVersion; major++) {
    majors.push(major);
  }
  return majors;
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

function findOverdueChangesets({
  majors,
  listPendingChangesets = runPendingChangesetsScript,
}) {
  return majors.flatMap((major) =>
    listPendingChangesets(major)
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" "))
      .filter(([, state]) => state === "overdue")
      .map(([id, , file]) => ({ id, file })),
  );
}

function formatMessage({ changesets, runUrl }) {
  return [
    ":warning: *Master has migrations that no release has yet. Cross-version tests start to fail 3 days after a migration is added to master.*",
    ...changesets.map(({ id, file }) => `• \`${id}\` (${file})`),
    `Please backport and release these changes. <${runUrl}|Run>`,
  ].join("\n");
}

async function notifyOverdueChangesets({
  context,
  majors,
  channelName,
  findSlackMessage,
  sendSlackMessage,
  listPendingChangesets,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const changesets = [];
  for (const changeset of findOverdueChangesets({
    majors,
    listPendingChangesets,
  })) {
    const existing = await findSlackMessage({
      channelName,
      text: changeset.id,
    });
    if (!existing) {
      changesets.push(changeset);
    }
  }

  if (changesets.length > 0) {
    await sendSlackMessage({
      channelName,
      message: formatMessage({ changesets, runUrl }),
    });
  }
}

module.exports = {
  downgradeMajors,
  findOverdueChangesets,
  formatMessage,
  notifyOverdueChangesets,
};
