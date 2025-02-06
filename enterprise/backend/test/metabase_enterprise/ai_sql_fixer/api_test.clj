(ns metabase-enterprise.ai-sql-fixer.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.ai-sql-fixer.api :as ai-sql-fixer.api]
   [metabase.test :as mt]))

(deftest ^:parallel format-escpaed-test
  (are [in out] (= out
                   (with-out-str (#'ai-sql-fixer.api/format-escaped in *out*)))
    "almallama"      "almallama"
    "alma llama"     "\"alma llama\""
    "\"alma\" llama" "\"\"\"alma\"\" llama\""))

(deftest ^:parallel schema-sample-test
  (mt/with-driver :h2
    (let [query {:database 1
                 :native {:query (str "SELECT * FROM x.orders1"
                                      " INNER JOIN products ON orders1.product_id = products.id"
                                      " INNER JOIN ANALYTIC_EVENT ON true")}}]
      (is (= "CREATE TABLE PUBLIC.PRODUCTS (
  ID BIGINT,
  EAN CHARACTER,
  TITLE CHARACTER VARYING,
  CATEGORY CHARACTER VARYING,
  VENDOR CHARACTER VARYING,
  PRICE DOUBLE PRECISION,
  RATING DOUBLE PRECISION,
  CREATED_AT TIMESTAMP
);
CREATE TABLE PUBLIC.ANALYTIC_EVENTS (
  ID BIGINT,
  ACCOUNT_ID BIGINT,
  EVENT CHARACTER VARYING,
  TIMESTAMP TIMESTAMP,
  PAGE_URL CHARACTER VARYING,
  BUTTON_LABEL CHARACTER VARYING
);
CREATE TABLE PUBLIC.ORDERS (
  ID BIGINT,
  USER_ID INTEGER,
  PRODUCT_ID INTEGER,
  SUBTOTAL DOUBLE PRECISION,
  TAX DOUBLE PRECISION,
  TOTAL DOUBLE PRECISION,
  DISCOUNT DOUBLE PRECISION,
  CREATED_AT TIMESTAMP,
  QUANTITY INTEGER
);
"
             (#'ai-sql-fixer.api/schema-sample query {:all-tables-limit 5}))))))
