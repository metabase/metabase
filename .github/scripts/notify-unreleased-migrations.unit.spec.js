const {
  downgradeMajors,
  findOverdueChangesets,
  formatMessage,
  notifyOverdueChangesets,
} = require("./notify-unreleased-migrations");

describe("downgradeMajors", () => {
  it("lists the majors between the target and the current version", () => {
    expect(downgradeMajors({ target: "v1.62.x", currentVersion: 65 })).toEqual([
      63, 64, 65,
    ]);
  });

  it("is empty when the target is the current version", () => {
    expect(downgradeMajors({ target: "v1.65.x", currentVersion: 65 })).toEqual(
      [],
    );
  });
});

const listPendingChangesets = (major) =>
  ({
    63: [
      "v63.a overdue resources/migrations/063/a.yaml",
      "v63.b recent resources/migrations/063/b.yaml",
      "v63.c expired resources/migrations/063/c.yaml",
      "",
    ].join("\n"),
    64: "v64.a overdue resources/migrations/064/a.yaml\n",
  })[major] ?? "";

describe("findOverdueChangesets", () => {
  it("keeps only overdue changesets of all majors", () => {
    expect(
      findOverdueChangesets({ majors: [63, 64, 65], listPendingChangesets }),
    ).toEqual([
      { id: "v63.a", file: "resources/migrations/063/a.yaml" },
      { id: "v64.a", file: "resources/migrations/064/a.yaml" },
    ]);
  });
});

describe("formatMessage", () => {
  it("lists each changeset with its file", () => {
    expect(
      formatMessage({
        changesets: [{ id: "v63.a", file: "resources/migrations/063/a.yaml" }],
        runUrl: "https://run",
      }),
    ).toBe(
      [
        ":warning: *Master has migrations that no release has yet. Cross-version tests start to fail 3 days after a migration is added to master.*",
        "• `v63.a` (resources/migrations/063/a.yaml)",
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
      majors: [63, 64],
      channelName: "release",
      findSlackMessage: jest.fn(async ({ text }) =>
        text === "v63.a" ? { id: "1", body: "" } : null,
      ),
      sendSlackMessage,
      listPendingChangesets,
    });
    expect(sendSlackMessage).toHaveBeenCalledTimes(1);
    const { message } = sendSlackMessage.mock.calls[0][0];
    expect(message).toContain("v64.a");
    expect(message).not.toContain("v63.a");
  });

  it("does not send a message when all changesets have one", async () => {
    const sendSlackMessage = jest.fn();
    await notifyOverdueChangesets({
      context,
      majors: [63, 64],
      channelName: "release",
      findSlackMessage: jest.fn(async () => ({ id: "1", body: "" })),
      sendSlackMessage,
      listPendingChangesets,
    });
    expect(sendSlackMessage).not.toHaveBeenCalled();
  });
});
