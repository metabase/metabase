import _ from "underscore";

export * from "./query";
export * from "./field-ref";

// The backend won't return more than 2,000 rows so in cases where we
// need to communicate or use that, use this constant
export const HARD_ROW_LIMIT = 2000;
