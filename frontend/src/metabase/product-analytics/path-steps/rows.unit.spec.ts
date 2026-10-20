import { parsePathStepRows } from "./rows";

const COLUMNS = ["step_name", "entrances", "bounces", "visits", "exits"];

describe("parsePathStepRows", () => {
  it("reads counts, including 64-bit counts serialised as strings", () => {
    expect(
      parsePathStepRows(COLUMNS, [
        ["/pricing", 10, 2, 40, "8"],
        ["signup", "0", 0, 12, 12],
      ]),
    ).toEqual([
      { name: "/pricing", entrances: 10, bounces: 2, visits: 40, exits: 8 },
      { name: "signup", entrances: 0, bounces: 0, visits: 12, exits: 12 },
    ]);
  });

  it("skips rows it can't read", () => {
    expect(
      parsePathStepRows(COLUMNS, [
        [null, 1, 0, 1, 0],
        ["/", "lots", 0, 1, 0],
      ]),
    ).toEqual([]);
  });
});
