import * as Lib from "metabase-lib";
import type { FilterEditorProps } from "./types";
import { BooleanFilterEditor } from "./BooleanFilterEditor";
import { NumberFilterEditor } from "./NumberFilterEditor";
import { StringFilterEditor } from "./StringFilterEditor";

export function FilterEditor(props: FilterEditorProps) {
  const { column } = props;

  if (Lib.isBoolean(column)) {
    return <BooleanFilterEditor {...props} />;
  }
  if (Lib.isDate(column)) {
    return <div />;
  }
  if (Lib.isNumber(column)) {
    return <NumberFilterEditor {...props} />;
  }
  if (Lib.isString(column)) {
    return <StringFilterEditor {...props} />;
  }

  return null;
}
