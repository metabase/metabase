// Postgres DB with the QA sample data (metabase/qa-databases:postgres-sample-15)
export const XV_DATABASE_NAME = "XV Data";

export const Q1_NAME = "cv1-pivot";
export const Q2_NAME = "cv2-joins";
export const Q3_NAME = "cv3-nested";
export const Q4_SQL_NAME = "cv4-sql";

export const SNIPPET_NAME = "Body Not Null";

// XV Data's tables use unquoted lower-case identifiers, which is what Postgres
// folds unquoted identifiers to — so these queries don't need to quote anything.
export const SNIPPET_CONTENT = "reviews.body IS NOT NULL";

export const SQL_QUERY = `
SELECT product_id, reviewer, rating
FROM reviews
WHERE {{snippet: ${SNIPPET_NAME}}}
AND {{rating}}`;
