// Prototype: viz-core does not export the state codes on this branch.
// eslint-disable-next-line metabase/enforce-module-public-api
import { STATE_CODES } from "metabase/viz-core/lib/mapping_codes";

const STATE_NAME_BY_CODE = new Map<string, string>(
  STATE_CODES.map(([code, name]) => [code, name]),
);

/** Prototype: name of a two-letter US state code, or null when it is unknown. */
export function getStateName(value: string): string | null {
  return STATE_NAME_BY_CODE.get(value.toUpperCase()) ?? null;
}
