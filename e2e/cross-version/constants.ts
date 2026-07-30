// Postgres DB with sample data
export const XV_DATABASE_NAME = "XV Data";

export const Q1_NAME = "cv1-pivot";
export const Q2_NAME = "cv2-joins";
export const Q3_NAME = "cv3-nested";
export const Q4_SQL_NAME = "cv4-sql";

export const SNIPPET_NAME = "Body Not Null";

// XV Data's tables are created with quoted upper-case identifiers, so queries
// against them have to quote too — Postgres folds unquoted identifiers to lower case.
export const SNIPPET_CONTENT = '"REVIEWS"."BODY" IS NOT NULL';

export const SQL_QUERY = `
SELECT "PRODUCT_ID", "REVIEWER", "RATING"
FROM "REVIEWS"
WHERE {{snippet: ${SNIPPET_NAME}}}
AND {{rating}}`;
