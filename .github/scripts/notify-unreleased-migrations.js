function findOverdueChangesets({ migrations, notifyAfterHours }) {
  return migrations.filter(({ age_hours }) => age_hours >= notifyAfterHours);
}

function formatMessage({ changesets, gracePeriodDays, runUrl }) {
  return [
    `:warning: *Master has migrations that no release has yet. Cross-version tests start to fail ${gracePeriodDays} days after a migration is added to master.*`,
    ...changesets.map(
      ({ id, commit, age_hours }) =>
        `• \`${id}\` (added in ${commit.slice(0, 11)}, ${age_hours}h ago)`,
    ),
    `Please backport and release these changes. <${runUrl}|Run>`,
  ].join("\n");
}

async function notifyOverdueChangesets({
  context,
  migrations,
  notifyAfterHours,
  gracePeriodDays,
  channelName,
  findSlackMessage,
  sendSlackMessage,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const changesets = [];
  for (const changeset of findOverdueChangesets({
    migrations,
    notifyAfterHours,
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
      message: formatMessage({ changesets, gracePeriodDays, runUrl }),
    });
  }
}

module.exports = {
  findOverdueChangesets,
  formatMessage,
  notifyOverdueChangesets,
};
