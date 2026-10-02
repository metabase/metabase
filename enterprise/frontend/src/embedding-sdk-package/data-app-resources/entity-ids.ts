const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

export const isEntityId = (value: unknown): value is string =>
  typeof value === "string" && ENTITY_ID_PATTERN.test(value);
