import type { JevClassifyOutputMode } from "metabase-types/api";

const JEV_CLASSIFY_OUTPUT_MODES: readonly string[] = [
  "new-column",
  "fill-empty",
  "overwrite",
] satisfies JevClassifyOutputMode[];

export function isJevClassifyOutputMode(
  value: string,
): value is JevClassifyOutputMode {
  return JEV_CLASSIFY_OUTPUT_MODES.includes(value);
}
