const {
  findOverdueCommits,
  formatMessage,
  notifyOverdueChangesets,
} = require("./notify-unreleased-migrations");

const migrations = [
  { id: "v63.a", commit: "aaaaaaaaaaaaaaaa", age_hours: 50 },
  { id: "v63.b", commit: "aaaaaaaaaaaaaaaa", age_hours: 50 },
  { id: "v63.c", commit: "bbbbbbbbbbbbbbbb", age_hours: 10 },
  { id: "v64.a", commit: "cccccccccccccccc", age_hours: 48 },
];

const commitUrl = (commit) =>
  `https://github.com/metabase/metabase/commit/${commit}`;

describe("findOverdueCommits", () => {
  it("groups the overdue migrations by commit", () => {
    expect(findOverdueCommits({ migrations, notifyAfterHours: 48 })).toEqual([
      { commit: "aaaaaaaaaaaaaaaa", age_hours: 50, ids: ["v63.a", "v63.b"] },
      { commit: "cccccccccccccccc", age_hours: 48, ids: ["v64.a"] },
    ]);
  });
});

describe("formatMessage", () => {
  it("lists each commit with a link, its migrations and its age", () => {
    expect(
      formatMessage({
        commits: [
          { commit: "aaaaaaaaaaaaaaaa", age_hours: 50, ids: ["v63.a", "v63.b"] },
        ],
        gracePeriodDays: 3,
        owner: "metabase",
        repo: "metabase",
        runUrl: "https://run",
      }),
    ).toBe(
      [
        ":warning: *Master has migrations that no release has yet. Cross-version tests start to fail 3 days after a migration is added to master.*",
        `• <${commitUrl("aaaaaaaaaaaaaaaa")}|aaaaaaaaaaa> added: \`v63.a\`, \`v63.b\` (50h ago)`,
        "Please backport and release these changes. <https://run|Run>",
      ].join("\n"),
    );
  });
});

describe("notifyOverdueChangesets", () => {
  const context = { repo: { owner: "metabase", repo: "metabase" }, runId: 1 };
  const notify = ({ recentMessages, sendSlackMessage }) => {
    const getRecentSlackMessages = jest.fn(async () => recentMessages);
    return notifyOverdueChangesets({
      context,
      migrations,
      notifyAfterHours: 48,
      gracePeriodDays: 3,
      channelName: "release",
      getRecentSlackMessages,
      sendSlackMessage,
    }).then(() => getRecentSlackMessages);
  };

  it("sends one message with all overdue commits when a commit has no message yet", async () => {
    const sendSlackMessage = jest.fn(async () => ({}));
    const getRecentSlackMessages = await notify({
      recentMessages: [`• <${commitUrl("aaaaaaaaaaaaaaaa")}|aaaaaaaaaaa> added`],
      sendSlackMessage,
    });
    expect(getRecentSlackMessages).toHaveBeenCalledTimes(1);
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
    const { message } = sendSlackMessage.mock.calls[0][0];
    expect(message).toContain("v64.a");
    expect(message).toContain("v63.a");
    expect(message).toContain("v63.b");
    expect(message).not.toContain("v63.c");
  });

  it("does not send a message when all commits have one", async () => {
    const sendSlackMessage = jest.fn();
    await notify({
      recentMessages: [
        commitUrl("aaaaaaaaaaaaaaaa"),
        commitUrl("cccccccccccccccc"),
      ],
      sendSlackMessage,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });

  it("does not read Slack when no commit is overdue", async () => {
    const sendSlackMessage = jest.fn();
    const getRecentSlackMessages = jest.fn();
    await notifyOverdueChangesets({
      context,
      migrations,
      notifyAfterHours: 100,
      gracePeriodDays: 3,
      channelName: "release",
      getRecentSlackMessages,
      sendSlackMessage,
    });
    expect(getRecentSlackMessages).not.toHaveBeenCalled();
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
