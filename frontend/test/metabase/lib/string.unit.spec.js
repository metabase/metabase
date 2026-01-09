import { regexpEscape } from "metabase/lib/string";

describe("regexpEscape", () => {
  const testCases = [
    ["nothing special here", "nothing special here"],
    ["somewhat ./\\ special", "somewhat \\./\\\\ special"],
    [
      "extra special ^$\\.*+?()[]{}|",
      "extra special \\^\\$\\\\\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|",
    ],
  ];
  for (const [raw, escaped] of testCases) {
    it(`should escape "${raw}" to "${escaped}"`, () => {
      expect(regexpEscape(raw)).toEqual(escaped);
    });
  }
});
