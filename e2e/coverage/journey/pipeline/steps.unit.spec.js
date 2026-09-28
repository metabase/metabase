import { buildPath } from "./steps.mjs";

const command = (seq, name, chain, phase = "test") => ({
  seq,
  t: seq,
  kind: "command",
  phase,
  url: "/",
  name,
  chain,
});

describe("buildPath", () => {
  it("should leave the coverage plugin's window() call out of the path in both schemas", () => {
    const events = [
      command(0, "window", "window(<hidden>)", "before each"),
      command(1, "then", "window(<hidden>).then(fn)", "before each"),
      command(2, "window", 'window({"log":false})', "before each"),
      command(3, "visit", 'visit("/question/1")'),
    ];

    expect(buildPath(events).tokens.map((token) => token.exact)).toEqual([
      'visit("/question/1")',
    ]);
  });

  it("should keep a test's own window() call", () => {
    const events = [command(0, "window", 'window().its("location")')];

    expect(buildPath(events).tokens.map((token) => token.exact)).toEqual([
      'window().its("location")',
    ]);
  });
});
