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

/**
 * Port of ORDERS_BY_YEAR_QUESTION_ID (cypress_sample_instance_data.js). Derived
 * the same way — by question name — so the value matches the Cypress export.
 * Canonical home for the copy that had been re-derived in card-embed-node.ts /
 * command-palette.ts / dashboard-card-fetching.ts / models-revision-history.ts /
 * question-saved.ts.
 */
export const ORDERS_BY_YEAR_QUESTION_ID = findByName(
  SAMPLE_INSTANCE_DATA.questions,
  "Orders, Count, Grouped by Created At (year)",
);

/**
 * Port of ORDERS_QUESTION_ENTITY_ID (cypress_sample_instance_data.js): the
 * "Orders" question's entity_id. Canonical home for the copy that had been
 * re-derived in questions-entity-id.ts.
 */
export const ORDERS_QUESTION_ENTITY_ID: string = (() => {
  const question = (
    SAMPLE_INSTANCE_DATA.questions as { name: string; entity_id?: string }[]
  ).find((entity) => entity.name === "Orders");
  if (!question?.entity_id) {
    throw new Error(
      'Entity "Orders" (with entity_id) not found in cypress_sample_instance_data',
    );
  }
  return question.entity_id;
})();

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
