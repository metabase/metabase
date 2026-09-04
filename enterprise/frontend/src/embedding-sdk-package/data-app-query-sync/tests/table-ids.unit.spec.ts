import { collectTableIds } from "../table-ids";

describe("collectTableIds", () => {
  it("collects unique table sources recursively", () => {
    expect(
      collectTableIds([
        {
          query: {
            "source-table": 2,
            joins: [{ "source-table": 1 }, { "source-table": 2 }],
          },
        },
        { query: { nested: { "source-table": "card__3" } } },
      ]),
    ).toEqual([1, 2]);
  });
});
