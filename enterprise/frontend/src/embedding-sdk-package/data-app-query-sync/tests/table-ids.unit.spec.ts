import { collectTableIds } from "../table-ids";

describe("table ID collection", () => {
  it("collects unique table sources from nested query payloads", () => {
    expect(
      collectTableIds([
        {
          stages: [
            {
              "source-table": 2,
              joins: [{ "source-table": 3 }],
            },
          ],
        },
        { query: { "source-table": 1 } },
        { "source-table": "card__4" },
      ]),
    ).toEqual([1, 2, 3]);
  });
});
