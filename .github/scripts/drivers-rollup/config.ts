// ci-test-config driver config: parsing + check-name → config-id matching.
//
// The config lives at
//   https://raw.githubusercontent.com/metabase/ci-test-config/refs/heads/master/ci-test-config.json
// and its `drivers` key looks like:
//   "drivers": [
//     { "id": "drivers-tests-databricks-ee", "status": "skip" },
//     { "id": "drivers-tests-snowflake-ee",  "status": "info" },
//     { "id": "drivers-tests-bigquery-ee",   "status": "info" }
//   ]
// Anything NOT listed defaults to "required".

export type Status = "required" | "info" | "skip";

export interface ConfigEntry {
  id: string;
  status: Status;
}

export function isStatus(value: unknown): value is Status {
  return value === "required" || value === "info" || value === "skip";
}

/** Pull a validated `drivers` array out of the parsed ci-test-config payload. */
export function parseDriversConfig(payload: unknown): ConfigEntry[] {
  const drivers = (payload as { drivers?: unknown } | null)?.drivers;
  if (!Array.isArray(drivers)) {
    return [];
  }
  return drivers.flatMap((entry): ConfigEntry[] => {
    const id = (entry as { id?: unknown })?.id;
    const status = (entry as { status?: unknown })?.status;
    return typeof id === "string" && isStatus(status) ? [{ id, status }] : [];
  });
}

/**
 * Strip the reusable-workflow caller prefix from a check-run name:
 *   "driver-tests / drivers-tests-postgres (Postgres 14.x …)"
 *      -> "drivers-tests-postgres (Postgres 14.x …)"
 * Names with no " / " are returned unchanged. Driver job names contain no
 * " / " themselves, so taking the last segment is safe.
 */
export function checkLeafName(name: string): string {
  const segments = name.split(" / ");
  return segments[segments.length - 1] ?? name;
}

/**
 * The config id a check leaf belongs to, or undefined if none matches.
 *
 * A leaf matches an id when it is exactly the id, or the id followed by a
 * matrix suffix (" (…)"). Requiring the " (" boundary stops shorter ids from
 * swallowing longer siblings — e.g. `drivers-tests-mongo` must NOT match the
 * leaf `drivers-tests-mongo-ssl (MongoDB 6.0)`. When several ids match, the
 * longest wins.
 */
export function configIdForLeaf(
  leaf: string,
  config: ConfigEntry[],
): string | undefined {
  let best: string | undefined;
  for (const { id } of config) {
    if (leaf === id || leaf.startsWith(`${id} (`)) {
      if (best === undefined || id.length > best.length) {
        best = id;
      }
    }
  }
  return best;
}

/** Config status for a check leaf name (matrix-aware). Missing → "required". */
export function statusForLeaf(leaf: string, config: ConfigEntry[]): Status {
  const id = configIdForLeaf(leaf, config);
  if (id === undefined) {
    return "required";
  }
  return config.find((entry) => entry.id === id)?.status ?? "required";
}

/** Config status for an exact driver id (used by the per-driver job check). Missing → "required". */
export function statusForId(id: string, config: ConfigEntry[]): Status {
  return config.find((entry) => entry.id === id)?.status ?? "required";
}
