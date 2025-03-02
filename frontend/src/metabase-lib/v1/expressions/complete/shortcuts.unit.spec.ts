import { complete } from "./__support__";
import { type Options, suggestShortcuts } from "./shortcuts";

describe("suggestShortcuts", () => {
  function setup({ shortcuts }: Partial<Options>) {
    const source = suggestShortcuts({
      shortcuts,
    });

    return function (doc: string) {
      return complete(source, doc);
    };
  }

  it("should suggest shortcuts on an empty document", () => {
    const complete = setup({
      shortcuts: [
        {
          name: "foo",
          icon: "function",
          action: jest.fn(),
        },
        {
          name: "bar",
          icon: "list",
          action: jest.fn(),
        },
      ],
    });
    const results = complete("|");
    expect(results).toEqual({
      from: 0,
      options: [
        {
          label: "foo",
          icon: "function",
          section: "shortcuts",
          apply: expect.any(Function),
        },
        {
          label: "bar",
          icon: "list",
          section: "shortcuts",
          apply: expect.any(Function),
        },
      ],
    });
  });

  it("should not suggest shortcuts on an non-empty document", () => {
    const complete = setup({
      shortcuts: [
        {
          name: "foo",
          icon: "function",
          action: jest.fn(),
        },
      ],
    });
    const results = complete("hello|");
    expect(results).toEqual(null);
  });
});
