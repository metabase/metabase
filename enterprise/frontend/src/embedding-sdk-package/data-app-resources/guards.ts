// `metabase-types/guards` and `metabase-types/api` are main-app code, which the
// SDK package's non-CLI code can't import (`no-external-references-for-sdk-package-code`).

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A Metabase entity ID: a 21-character NanoID. */
export const isEntityId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{21}$/.test(value);
