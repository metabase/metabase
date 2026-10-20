const {
  findOverdueChangesets,
  formatMessage,
  notifyOverdueChangesets,
} = require("./notify-unreleased-migrations");

const migrations = [
  { id: "v63.a", commit: "aaaaaaaaaaaaaaaa", age_hours: 50 },
  { id: "v63.b", commit: "bbbbbbbbbbbbbbbb", age_hours: 10 },
  { id: "v64.a", commit: "cccccccccccccccc", age_hours: 48 },
];

describe("findOverdueChangesets", () => {
  it("keeps only the migrations that are at least notifyAfterHours old", () => {
    expect(
      findOverdueChangesets({ migrations, notifyAfterHours: 48 }).map(
        ({ id }) => id,
      ),
    ).toEqual(["v63.a", "v64.a"]);
  });
});

describe("formatMessage", () => {
  it("lists each changeset with its commit and age", () => {
    expect(
      formatMessage({
        changesets: [migrations[0]],
        gracePeriodDays: 3,
        runUrl: "https://run",
      }),
    ).toBe(
      [
        ":warning: *Master has migrations that no release has yet. Cross-version tests start to fail 3 days after a migration is added to master.*",
        "• `v63.a` (added in aaaaaaaaaaa, 50h ago)",
        "Please backport and release these changes. <https://run|Run>",
      ].join("\n"),
    );
  });
});

describe("notifyOverdueChangesets", () => {
  const context = { repo: { owner: "metabase", repo: "metabase" }, runId: 1 };

  it("sends one message with the changesets that have no message yet", async () => {
    const sendSlackMessage = jest.fn(async () => ({}));
    await notifyOverdueChangesets({
      context,
      migrations,
      notifyAfterHours: 48,
      gracePeriodDays: 3,
      channelName: "release",
      findSlackMessage: jest.fn(async ({ text }) =>
        text === "v63.a" ? { id: "1", body: "" } : null,
      ),
      sendSlackMessage,
    });
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
    const { message } = sendSlackMessage.mock.calls[0][0];
    expect(message).toContain("v64.a");
    expect(message).not.toContain("v63.a");
    expect(message).not.toContain("v63.b");
  });

  it("does not send a message when all changesets have one", async () => {
    const sendSlackMessage = jest.fn();
    await notifyOverdueChangesets({
      context,
      migrations,
      notifyAfterHours: 48,
      gracePeriodDays: 3,
      channelName: "release",
      findSlackMessage: jest.fn(async () => ({ id: "1", body: "" })),
      sendSlackMessage,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
