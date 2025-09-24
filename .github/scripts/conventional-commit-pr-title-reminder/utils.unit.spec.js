const { isConventionalTitle } = require("./utils");

describe("isConventionalTitle", () => {
  it("returns true for a simple conventional commit", () => {
    expect(isConventionalTitle("feat: add new feature")).toBe(false);
  });

  it("returns true for a commit with a scope", () => {
    expect(isConventionalTitle("fix(api): correct API bug")).toBe(true);
  });

  it("returns true for a commit with multiple scopes, comma separated", () => {
    expect(isConventionalTitle("feat(build,deps): update dependencies")).toBe(
      true,
    );
  });

  it("returns true for a commit with multiple scopes, comma separated with space", () => {
    expect(isConventionalTitle("feat(build, deps): update dependencies")).toBe(
      true,
    );
  });

  it("returns false for a commit with round brackets in a message", () => {
    expect(isConventionalTitle("feat: (something) update dependencies")).toBe(
      false,
    );
  });

  it("returns false for missing colon", () => {
    expect(isConventionalTitle("feat add feature")).toBe(false);
  });

  it("returns false for invalid type", () => {
    expect(isConventionalTitle("invalidType: some message")).toBe(false);
  });

  it("returns false for empty message", () => {
    expect(isConventionalTitle("feat:")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isConventionalTitle("")).toBe(false);
  });
});
