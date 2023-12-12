import type { FieldValue } from "metabase-types/api";
import type { Option } from "./types";

export function getFieldOptions(values: FieldValue[]): Option[] {
  return values.map(([value, label = value]) => ({
    value: String(value),
    label: String(label),
  }));
}

export function getStaticOptions(values: string[]): Option[] {
  return values.map(value => ({
    value,
    label: value,
  }));
}
