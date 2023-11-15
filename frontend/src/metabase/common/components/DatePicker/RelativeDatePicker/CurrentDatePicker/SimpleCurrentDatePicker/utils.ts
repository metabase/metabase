import * as Lib from "metabase-lib";
import { UNIT_GROUPS } from "../constants";

export function getUnitOptions() {
  return UNIT_GROUPS.flatMap(group =>
    group.map(unit => ({
      value: unit,
      label: Lib.describeTemporalUnit(unit),
    })),
  );
}
