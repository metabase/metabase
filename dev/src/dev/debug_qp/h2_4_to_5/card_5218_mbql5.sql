SELECT
  DATE_TRUNC('quarter', "__mb_source"."CREATED_AT") AS "CREATED_AT",
  "__mb_source"."PEOPLE__via__USER_ID__STATE" AS "PEOPLE__via__USER_ID__STATE",
  "__mb_source"."PEOPLE__via__USER_ID__SOURCE" AS "PEOPLE__via__USER_ID__SOURCE",
  "PRODUCTS__via__PRODUCT_ID"."CATEGORY" AS "PRODUCTS__via__PRODUCT_ID__CATEGORY",
  (
    FLOOR(
      (("PRODUCTS__via__PRODUCT_ID"."PRICE" - 10.0) / 10.0)
    ) * 10.0
  ) + 10.0 AS "PRODUCTS__via__PRODUCT_ID__PRICE",
  COUNT(*) AS "count",
  SUM("__mb_source"."SUBTOTAL") AS "sum",
  AVG("__mb_source"."QUANTITY") AS "avg"
FROM
  (
    SELECT
      "PUBLIC"."ORDERS"."ID" AS "ID",
      "PUBLIC"."ORDERS"."USER_ID" AS "USER_ID",
      "PUBLIC"."ORDERS"."PRODUCT_ID" AS "PRODUCT_ID",
      "PUBLIC"."ORDERS"."SUBTOTAL" AS "SUBTOTAL",
      "PUBLIC"."ORDERS"."TAX" AS "TAX",
      "PUBLIC"."ORDERS"."TOTAL" AS "TOTAL",
      "PUBLIC"."ORDERS"."DISCOUNT" AS "DISCOUNT",
      "PUBLIC"."ORDERS"."CREATED_AT" AS "CREATED_AT",
      "PUBLIC"."ORDERS"."QUANTITY" AS "QUANTITY",
      "PEOPLE__via__USER_ID"."NAME" AS "PEOPLE__via__USER_ID__NAME",
      "PEOPLE__via__USER_ID"."STATE" AS "PEOPLE__via__USER_ID__STATE",
      "PEOPLE__via__USER_ID"."SOURCE" AS "PEOPLE__via__USER_ID__SOURCE"
    FROM
      "PUBLIC"."ORDERS"
      LEFT JOIN (
        SELECT
          "PUBLIC"."PEOPLE"."ID" AS "ID",
          "PUBLIC"."PEOPLE"."NAME" AS "NAME",
          "PUBLIC"."PEOPLE"."BIRTH_DATE" AS "BIRTH_DATE",
          "PUBLIC"."PEOPLE"."CREATED_AT" AS "CREATED_AT",
          "PUBLIC"."PEOPLE"."ADDRESS" AS "ADDRESS",
          "PUBLIC"."PEOPLE"."CITY" AS "CITY",
          "PUBLIC"."PEOPLE"."EMAIL" AS "EMAIL",
          "PUBLIC"."PEOPLE"."LATITUDE" AS "LATITUDE",
          "PUBLIC"."PEOPLE"."LONGITUDE" AS "LONGITUDE",
          "PUBLIC"."PEOPLE"."SOURCE" AS "SOURCE",
          "PUBLIC"."PEOPLE"."STATE" AS "STATE",
          "PUBLIC"."PEOPLE"."ZIP" AS "ZIP"
        FROM
          "PUBLIC"."PEOPLE"
      ) AS "PEOPLE__via__USER_ID" ON "PUBLIC"."ORDERS"."USER_ID" = "PEOPLE__via__USER_ID"."ID"
  ) AS "__mb_source"
  LEFT JOIN (
    SELECT
      "PUBLIC"."PRODUCTS"."ID" AS "ID",
      "PUBLIC"."PRODUCTS"."TITLE" AS "TITLE",
      "PUBLIC"."PRODUCTS"."CATEGORY" AS "CATEGORY",
      "PUBLIC"."PRODUCTS"."VENDOR" AS "VENDOR",
      "PUBLIC"."PRODUCTS"."PRICE" AS "PRICE",
      "PUBLIC"."PRODUCTS"."RATING" AS "RATING",
      "PUBLIC"."PRODUCTS"."CREATED_AT" AS "CREATED_AT"
    FROM
      "PUBLIC"."PRODUCTS"
  ) AS "PRODUCTS__via__PRODUCT_ID" ON "__mb_source"."PRODUCT_ID" = "PRODUCTS__via__PRODUCT_ID"."ID"
GROUP BY
  DATE_TRUNC('quarter', "__mb_source"."CREATED_AT"),
  "__mb_source"."PEOPLE__via__USER_ID__STATE",
  "__mb_source"."PEOPLE__via__USER_ID__SOURCE",
  "PRODUCTS__via__PRODUCT_ID"."CATEGORY",
  (
    FLOOR(
      (("PRODUCTS__via__PRODUCT_ID"."PRICE" - 10.0) / 10.0)
    ) * 10.0
  ) + 10.0
ORDER BY
  DATE_TRUNC('quarter', "__mb_source"."CREATED_AT") ASC,
  "__mb_source"."PEOPLE__via__USER_ID__STATE" ASC,
  "__mb_source"."PEOPLE__via__USER_ID__SOURCE" ASC,
  "PRODUCTS__via__PRODUCT_ID"."CATEGORY" ASC,
  (
    FLOOR(
      (("PRODUCTS__via__PRODUCT_ID"."PRICE" - 10.0) / 10.0)
    ) * 10.0
  ) + 10.0 ASC
