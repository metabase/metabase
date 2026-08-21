import { isSlackProfile, slackMrkdwnToMarkdown } from "./slack-mrkdwn";

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

  // The shape that broke the web conversation page: a table link whose URL carries
  // a base64 `#` fragment. Parsed as CommonMark the raw form is an autolink, so the
  // label vanished and `|LABEL` was swallowed into the href, corrupting the hash.
  it("converts a link whose url has a base64 hash fragment, without leaking the label into the url", () => {
    const url =
      "https://metabase.example.com/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoicXVlcnkiLCJxdWVyeSI6eyJzb3VyY2UtdGFibGUiOjF9fX0=";

    const converted = slackMrkdwnToMarkdown(`## 1. <${url}|PEOPLE>`);

    expect(converted).toBe(`## 1. [PEOPLE](${url})`);
    expect(converted).not.toContain("|PEOPLE");
  });

  it("leaves plain text unchanged", () => {
    expect(slackMrkdwnToMarkdown("just normal text *with stars*")).toBe(
      "just normal text *with stars*",
    );
  });
});

describe("isSlackProfile", () => {
  it.each(["slackbot", "slack"])("recognizes %s", (profileId) => {
    expect(isSlackProfile(profileId)).toBe(true);
  });

  it.each([undefined, null, "", "default", "embedding"])(
    "does not treat %p as slack",
    (profileId) => {
      expect(isSlackProfile(profileId)).toBe(false);
    },
  );
});
