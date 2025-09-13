import type { Location } from "metabase/query_builder/components/NativeQueryEditor/types";

export function locationToPosition(text: string, location: Location): number {
  const lines = text.split("\n");
  return lines.reduce((acc, line, index) => {
    if (index < location.row) {
      return acc + line.length + 1;
    }
    return acc;
  }, location.column);
}
