const { getBlockedCypressTests } = require("./grep-blocked-tests");

describe("getBlockedCypressTests", () => {
  it("returns a semicolon-separated string of blocked Cypress tests prefixed with hyphens", () => {
    const config = {
      ignored: {
        cypress: ["Test A", "Test B (metabase#12345)", "Test C"],
      },
    };
    expect(getBlockedCypressTests(config)).toBe(
      "-Test A;-Test B (metabase#12345);-Test C",
    );
  });

  it("escapes double quotes in test names but leaves single quotes and backticks intact", () => {
    const config = {
      ignored: {
        cypress: ['Test "A"', "Test 'B'", "Test `C`"],
      },
    };
    expect(getBlockedCypressTests(config)).toBe(
      "-Test \"A\";-Test 'B';-Test `C`",
    );
  });

  it("trims whitespace from test names", () => {
    const config = {
      ignored: {
        cypress: ["  Test A  ", "Test B "],
      },
    };
    expect(getBlockedCypressTests(config)).toBe("-Test A;-Test B");
  });

  it("returns an empty string if no Cypress tests are blocked", () => {
    const config = {
      ignored: {
        cypress: [],
      },
    };
    expect(getBlockedCypressTests(config)).toBe("");
  });

  it("returns an empty string if ignored.cypress is undefined", () => {
    const config = {
      ignored: {},
    };
    expect(getBlockedCypressTests(config)).toBe("");
  });

  it("throws an error if ignored.cypress is not an array", () => {
    const config = {
      ignored: {
        cypress: "not-an-array",
      },
    };
    expect(() => getBlockedCypressTests(config)).toThrow(
      "Blocked Cypress tests must be stored as an array of strings!",
    );
  });

  it("handles missing config gracefully", () => {
    expect(getBlockedCypressTests()).toBe("");
  });
});
