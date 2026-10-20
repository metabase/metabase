import { toCount } from "../insights/rows";
import { PATH_STEPS_COLUMNS } from "../sql/analyses/path-steps";

/** A step across the paths' windows, counted in visits. */
export type PathStep = {
  name: string;
  /** Visits that started with it. */
  entrances: number;
  /** Entrances that were the visit's only step. */
  bounces: number;
  /** Visits that reached it. */
  visits: number;
  /** Visits that ended with it. */
  exits: number;
};

/** Reads the steps query's rows. Rows that can't be read are skipped. */
export const parsePathStepRows = (
  columnNames: readonly string[],
  rows: readonly (readonly unknown[])[],
): PathStep[] => {
  const indexOf = (name: string) => columnNames.indexOf(name);
  const nameIndex = indexOf(PATH_STEPS_COLUMNS.name);
  const entrancesIndex = indexOf(PATH_STEPS_COLUMNS.entrances);
  const bouncesIndex = indexOf(PATH_STEPS_COLUMNS.bounces);
  const visitsIndex = indexOf(PATH_STEPS_COLUMNS.visits);
  const exitsIndex = indexOf(PATH_STEPS_COLUMNS.exits);

  return rows.flatMap((row) => {
    const name = row[nameIndex];
    const entrances = toCount(row[entrancesIndex]);
    const bounces = toCount(row[bouncesIndex]);
    const visits = toCount(row[visitsIndex]);
    const exits = toCount(row[exitsIndex]);
    if (
      typeof name !== "string" ||
      entrances === undefined ||
      bounces === undefined ||
      visits === undefined ||
      exits === undefined
    ) {
      return [];
    }
    return [{ name, entrances, bounces, visits, exits }];
  });
};
