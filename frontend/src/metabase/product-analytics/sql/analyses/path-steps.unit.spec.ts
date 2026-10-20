import type { PathsSpec } from "../../spec/types";

import { canShowEntrances, canShowExits } from "./path-steps";

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

describe("path steps", () => {
  it.each([
    { direction: "from", start: null, end: null, entrances: true, exits: true },
    {
      direction: "from",
      start: EVENT,
      end: null,
      entrances: false,
      exits: true,
    },
    { direction: "to", start: null, end: null, entrances: true, exits: true },
    { direction: "to", start: null, end: EVENT, entrances: true, exits: false },
    {
      direction: "between",
      start: EVENT,
      end: null,
      entrances: false,
      exits: true,
    },
    {
      direction: "between",
      start: null,
      end: EVENT,
      entrances: true,
      exits: false,
    },
    {
      direction: "between",
      start: EVENT,
      end: EVENT,
      entrances: false,
      exits: false,
    },
  ] as const)(
    "shows entrances: $entrances and exits: $exits for $direction paths from $start.flag to $end.flag",
    ({ direction, start, end, entrances, exits }) => {
      const paths = createPaths({ direction, start, end });

      expect(canShowEntrances(paths)).toBe(entrances);
      expect(canShowExits(paths)).toBe(exits);
    },
  );
});
