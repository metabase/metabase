import { isBoolean, isNumeric, isString } from "metabase/lib/types/isa";
import type { DatasetColumn } from "metabase-types/api";

// predicate for columns that can be formatted
export const isFormattable = (col: DatasetColumn) =>
  isNumeric(col) || isString(col) || isBoolean(col);
