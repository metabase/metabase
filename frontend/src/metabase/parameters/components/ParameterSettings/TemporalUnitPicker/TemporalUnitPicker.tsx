import { SelectInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

export interface TemporalUnitPickerProps {
  value: Lib.BucketName[];
  onChange: (value: Lib.BucketName[]) => void;
}

export function TemporalUnitPicker() {
  return <SelectInput value="123" />;
}
