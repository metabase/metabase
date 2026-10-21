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

function hoursUntilFailure({ commits, gracePeriodDays }) {
  const oldest = Math.max(...commits.map(({ age_hours }) => age_hours));
  return Math.max(0, gracePeriodDays * 24 - oldest);
}

function formatMessage({ commits, gracePeriodDays, owner, repo, runUrl }) {
  return [
    `:warning: *Cross-version tests (<${runUrl}|run>) skipped since unreleased migrations for existing release branches have been added to master*`,
    ...commits.map(
      ({ commit, age_hours, ids }) =>
        `• <${commitUrl({ owner, repo, commit })}|${commit.slice(0, 11)}> added: ${ids.map((id) => `\`${id}\``).join(", ")} (${age_hours}h ago)`,
    ),
    `Please backport and release these migrations. Cross-version tests will start failing in ${hoursUntilFailure({ commits, gracePeriodDays })}h.`,
  ].join("\n");
}

async function notifyOverdueChangesets({
  context,
  migrations,
  notifyAfterHours,
  repeatAfterHours,
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

  const recentMessages = await getRecentSlackMessages({
    channelName,
    sinceHours: repeatAfterHours,
  });
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
  } else {
    console.log(
      [
        "All commits with migrations that need to be backported/released already have a recent Slack notification:",
        ...overdue.map(
          ({ commit, age_hours, ids }) =>
            `  ${commitUrl({ owner, repo, commit })} added: ${ids.join(", ")} (${age_hours}h ago)`,
        ),
      ].join("\n"),
    );
  }
}

module.exports = {
  findOverdueCommits,
  formatMessage,
  hoursUntilFailure,
  notifyOverdueChangesets,
};
