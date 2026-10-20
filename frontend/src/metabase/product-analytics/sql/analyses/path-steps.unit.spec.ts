import type { PathsSpec } from "../../spec/types";

import { canShowBounces, canShowEntrances, canShowExits } from "./path-steps";

const EVENT = { flag: "ev_1" };

const createPaths = (opts: Partial<PathsSpec>): PathsSpec => ({
  direction: "from",
  start: null,
  end: null,
  steps: 5,
  included: [],
  sessionGapMinutes: 30,
  mergeRepeats: true,
  hideNoisyEvents: false,
  maxNodes: 8,
  minVolume: 5,
  ...opts,
});

const NONE = null;

describe("path steps", () => {
  it.each([
    ["from", NONE, NONE, { entrances: true, bounces: true, exits: true }],
    ["from", EVENT, NONE, { entrances: false, bounces: false, exits: true }],
    ["to", NONE, NONE, { entrances: true, bounces: false, exits: true }],
    ["to", NONE, EVENT, { entrances: true, bounces: false, exits: false }],
    ["between", NONE, NONE, { entrances: true, bounces: false, exits: true }],
    ["between", EVENT, NONE, { entrances: false, bounces: false, exits: true }],
    ["between", NONE, EVENT, { entrances: true, bounces: false, exits: false }],
    [
      "between",
      EVENT,
      EVENT,
      { entrances: false, bounces: false, exits: false },
    ],
  ] as const)(
    "shows what %s paths from %j to %j can count: %j",
    (direction, start, end, expected) => {
      const paths = createPaths({ direction, start, end });

      expect({
        entrances: canShowEntrances(paths),
        bounces: canShowBounces(paths),
        exits: canShowExits(paths),
      }).toEqual(expected);
    },
  );
});
