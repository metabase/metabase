import * as Lib from "metabase-lib";
import { UNITS } from "./constants";
import type { UnitOption } from "./types";

export function getUnitOptions(): UnitOption[] {
  return UNITS.map(unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));
}
