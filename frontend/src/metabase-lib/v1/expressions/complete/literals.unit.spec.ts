import { complete } from "./__support__";
import { suggestLiterals } from "./literals";

describe("suggestLiterals", () => {
  it("should suggest True and False", () => {
    const results = complete(suggestLiterals(), "Tru|");
    expect(results).toEqual({
      from: 0,
      to: 3,
      options: [
        {
          icon: "io",
          label: "True",
          type: "literal",
        },
        {
          icon: "io",
          label: "False",
          type: "literal",
        },
      ],
    });
  });

  it("should suggest True and False, from inside the word", () => {
    const results = complete(suggestLiterals(), "Tr|u");
    expect(results).toEqual({
      from: 0,
      to: 3,
      options: [
        {
          icon: "io",
          label: "True",
          type: "literal",
        },
        {
          icon: "io",
          label: "False",
          type: "literal",
        },
      ],
    });
  });
});
