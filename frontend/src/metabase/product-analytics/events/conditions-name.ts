import { c } from "ttag";

import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

/** The conditions' names joined with "and", or "" without conditions. */
export const getConditionsName = (query: Lib.Query): string => {
  const [first, ...rest] = Lib.filters(query, STAGE_INDEX).map(
    (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
  );
  return rest.reduce(
    (names, name) =>
      c("{0} is a list of conditions, {1} is one more condition")
        .t`${names} and ${name}`,
    first ?? "",
  );
};
