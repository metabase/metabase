/**
 * Reads the same generated data files the Cypress suite uses:
 * - cypress_sample_database.json    (table/field ids of the H2 sample database)
 * - cypress_sample_instance_data.json (entity ids + cached login sessions,
 *   written by e2e/snapshot-creators/default.cy.snap.js and matching the
 *   contents of the `default` snapshot)
 */
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import SAMPLE_DATABASE from "../../e2e/support/cypress_sample_database.json";

export { SAMPLE_DATABASE };

export const SAMPLE_DB_ID = 1;

// Collection ids can be "root"; everything we look up here is numeric.
type InstanceEntity = { id: number | string; name: string };

const findByName = (entities: InstanceEntity[], name: string): number => {
  const entity = entities.find((entity) => entity.name === name);
  if (!entity) {
    throw new Error(`Entity "${name}" not found in cypress_sample_instance_data`);
  }
  return Number(entity.id);
};

export const ORDERS_QUESTION_ID = findByName(
  SAMPLE_INSTANCE_DATA.questions,
  "Orders",
);

export const ORDERS_DASHBOARD_ID = findByName(
  SAMPLE_INSTANCE_DATA.dashboards,
  "Orders in a dashboard",
);

export const FIRST_COLLECTION_ID = findByName(
  SAMPLE_INSTANCE_DATA.collections,
  "First collection",
);

export const THIRD_COLLECTION_ID = findByName(
  SAMPLE_INSTANCE_DATA.collections,
  "Third collection",
);

/**
 * Session ids cached at snapshot-creation time. The sessions live in the
 * core_session table inside the snapshot SQL, so after restore() these ids
 * are valid without ever calling POST /api/session — same trick as the
 * Cypress loginCache.
 */
export const LOGIN_CACHE: Record<
  string,
  { sessionId: string; deviceId: string }
> = SAMPLE_INSTANCE_DATA.loginCache;

/** Credentials fallback for users without a cached session. */
export const USERS = {
  admin: { email: "admin@metabase.test", password: "12341234" },
  normal: { email: "normal@metabase.test", password: "12341234" },
  sandboxed: { email: "sandboxed@metabase.test", password: "12341234" },
  nodata: { email: "nodata@metabase.test", password: "12341234" },
  readonly: { email: "readonly@metabase.test", password: "12341234" },
} as const;

export type UserName = keyof typeof USERS;
