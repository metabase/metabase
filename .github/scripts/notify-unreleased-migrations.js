function findOverdueCommits({ migrations, notifyAfterHours }) {
  const commits = new Map();
  for (const { id, commit, age_hours } of migrations) {
    if (age_hours < notifyAfterHours) {
      continue;
    }
    if (!commits.has(commit)) {
      commits.set(commit, { commit, age_hours, ids: [] });
    }
    commits.get(commit).ids.push(id);
  }
  return [...commits.values()];
}

function commitUrl({ owner, repo, commit }) {
  return `https://github.com/${owner}/${repo}/commit/${commit}`;
}

function formatMessage({ commits, gracePeriodDays, owner, repo, runUrl }) {
  return [
    `:warning: *Master has migrations that no release has yet. Cross-version tests start to fail ${gracePeriodDays} days after a migration is added to master.*`,
    ...commits.map(
      ({ commit, age_hours, ids }) =>
        `• <${commitUrl({ owner, repo, commit })}|${commit.slice(0, 11)}> added: ${ids.map((id) => `\`${id}\``).join(", ")} (${age_hours}h ago)`,
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
  getRecentSlackMessages,
  sendSlackMessage,
}) {
  const { owner, repo } = context.repo;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const overdue = findOverdueCommits({ migrations, notifyAfterHours });
  if (overdue.length === 0) {
    return;
  }

  const recentMessages = await getRecentSlackMessages({ channelName });
  const allNotified = overdue.every(({ commit }) =>
    recentMessages.some((text) =>
      text.includes(commitUrl({ owner, repo, commit })),
    ),
  );

  if (!allNotified) {
    await sendSlackMessage({
      channelName,
      message: formatMessage({
        commits: overdue,
        gracePeriodDays,
        owner,
        repo,
        runUrl,
      }),
    });
  }
}

module.exports = {
  findOverdueCommits,
  formatMessage,
  notifyOverdueChangesets,
};
