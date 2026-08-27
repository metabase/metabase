import { slackMrkdwnToMarkdown } from "./slack-mrkdwn";

describe("slackMrkdwnToMarkdown", () => {
  it("converts <url|label> to [label](url)", () => {
    expect(
      slackMrkdwnToMarkdown(
        "see <https://stats.metabase.com/question/4369|Survey Scores> now",
      ),
    ).toBe("see [Survey Scores](https://stats.metabase.com/question/4369) now");
  });

  it("preserves bare <url> as autolinks", () => {
    expect(slackMrkdwnToMarkdown("visit <https://example.com>")).toBe(
      "visit <https://example.com>",
    );
  });

  it("converts mailto labels to markdown links", () => {
    expect(slackMrkdwnToMarkdown("<mailto:foo@bar.com|email foo>")).toBe(
      "[email foo](mailto:foo@bar.com)",
    );
  });

  it("strips Slack user mention syntax", () => {
    expect(slackMrkdwnToMarkdown("hi <@U0A1860HEAG> there")).toBe(
      "hi @U0A1860HEAG there",
    );
  });

  it("renders channel mention with name", () => {
    expect(slackMrkdwnToMarkdown("come to <#C123ABC|general>")).toBe(
      "come to #general",
    );
  });

  it("renders bare channel mention", () => {
    expect(slackMrkdwnToMarkdown("come to <#C123ABC>")).toBe(
      "come to #C123ABC",
    );
  });

  it("renders subteam mentions with names", () => {
    expect(slackMrkdwnToMarkdown("ping <!subteam^S123|frontend>")).toBe(
      "ping @frontend",
    );
  });

  it("renders special mentions like channel/here/everyone", () => {
    expect(slackMrkdwnToMarkdown("<!here> hi <!channel>")).toBe(
      "@here hi @channel",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(slackMrkdwnToMarkdown("just normal text *with stars*")).toBe(
      "just normal text *with stars*",
    );
  });
});
