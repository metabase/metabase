export const Q1_NAME = "cv1-pivot";
export const Q2_NAME = "cv2-joins";
export const Q3_NAME = "cv3-nested";
export const Q4_SQL_NAME = "cv4-sql";

export const SQL_QUERY = `
SELECT PRODUCT_ID, REVIEWER, RATING
FROM REVIEWS
WHERE {{snippet: Body Not Null}}
AND {{rating}}`;
