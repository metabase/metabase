import { POSITIONAL_ACCESSORS } from "../constants/accessors";

import { calculateWaterfallEntries } from "./waterfall";

describe("calculateWaterfallEntries", () => {
  it("calculates waterfall entries without total", () => {
    const data = [
      ["1", 100],
      ["2", -50],
      ["3", 10],
    ];
    const entries = calculateWaterfallEntries(
      data,
      POSITIONAL_ACCESSORS,
      false,
    );

    expect(entries).toStrictEqual([
      {
        start: 0,
        end: 100,
        x: "1",
        y: 100,
      },
      {
        start: 100,
        end: 50,
        x: "2",
        y: -50,
      },
      {
        start: 50,
        end: 60,
        x: "3",
        y: 10,
      },
    ]);
  });

  it("calculates waterfall entries with positive total", () => {
    const data = [
      ["1", 100],
      ["2", -50],
      ["3", 10],
    ];
    const entries = calculateWaterfallEntries(data, POSITIONAL_ACCESSORS, true);

    expect(entries).toStrictEqual([
      {
        start: 0,
        end: 100,
        x: "1",
        y: 100,
      },
      {
        start: 100,
        end: 50,
        x: "2",
        y: -50,
      },
      {
        start: 50,
        end: 60,
        x: "3",
        y: 10,
      },
      {
        start: 0,
        end: 60,
        isTotal: true,
        x: "Total",
        y: 60,
      },
    ]);
  });

  it("calculates waterfall entries with negative total", () => {
    const data = [
      ["1", 100],
      ["2", -200],
      ["3", 50],
    ];
    const entries = calculateWaterfallEntries(data, POSITIONAL_ACCESSORS, true);

    expect(entries).toStrictEqual([
      {
        start: 0,
        end: 100,
        x: "1",
        y: 100,
      },
      {
        start: 100,
        end: -100,
        x: "2",
        y: -200,
      },
      {
        start: -100,
        end: -50,
        x: "3",
        y: 50,
      },
      {
        start: 0,
        end: -50,
        isTotal: true,
        x: "Total",
        y: -50,
      },
    ]);
  });
});
