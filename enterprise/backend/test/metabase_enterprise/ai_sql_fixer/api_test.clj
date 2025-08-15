(ns metabase-enterprise.ai-sql-fixer.api-test
  (:require
   [clojure.string :as str]
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
  (mt/test-driver :h2
    (let [query {:database (mt/id)
                 :native {:query (str "SELECT * FROM x.orders1"
                                      " INNER JOIN products ON orders1.product_id = products.id"
                                      " INNER JOIN ANALYTIC_EVENT ON true")}}
          normalize #(into #{} (str/split % #"(?<=;)\n"))]
      (is (= (-> (str "CREATE TABLE PUBLIC.PRODUCTS (\n"
                      "  ID BIGINT,\n"
                      "  EAN CHARACTER VARYING,\n"
                      "  TITLE CHARACTER VARYING,\n"
                      "  CATEGORY CHARACTER VARYING,\n"
                      "  VENDOR CHARACTER VARYING,\n"
                      "  PRICE DOUBLE PRECISION,\n"
                      "  RATING DOUBLE PRECISION,\n"
                      "  CREATED_AT TIMESTAMP WITH TIME ZONE\n"
                      ");\n"
                      "CREATE TABLE PUBLIC.ORDERS (\n"
                      "  ID BIGINT,\n"
                      "  USER_ID INTEGER,\n"
                      "  PRODUCT_ID INTEGER,\n"
                      "  SUBTOTAL DOUBLE PRECISION,\n"
                      "  TAX DOUBLE PRECISION,\n"
                      "  TOTAL DOUBLE PRECISION,\n"
                      "  DISCOUNT DOUBLE PRECISION,\n"
                      "  CREATED_AT TIMESTAMP WITH TIME ZONE,\n"
                      "  QUANTITY INTEGER\n"
                      ");\n"
                      "CREATE TABLE PUBLIC.USERS (\n"
                      "  ID BIGINT,\n"
                      "  NAME CHARACTER VARYING,\n"
                      "  LAST_LOGIN TIMESTAMP,\n"
                      "  PASSWORD CHARACTER VARYING\n"
                      ");\n")
                 normalize)
             (-> (mt/with-current-user (mt/user->id :crowberto)
                   (#'ai-sql-fixer.api/schema-sample query {:all-tables-limit 5}))
                 normalize))))))

(deftest ^:parallel no-used-table-test
  (mt/test-driver :postgres
    (let [query {:database (mt/id)
                 :native {:query "SELECT * FROM x.orders1"}}
          normalize #(into #{} (str/split % #"(?<=;)\n"))]
      (is (= (-> (str "CREATE TABLE public.orders (\n"
                      "  id int4,\n"
                      "  user_id int4,\n"
                      "  product_id int4,\n"
                      "  subtotal float8,\n"
                      "  tax float8,\n"
                      "  total float8,\n"
                      "  discount float8,\n"
                      "  created_at timestamptz,\n"
                      "  quantity int4\n"
                      ");\n"
                      "CREATE TABLE public.users (\n"
                      "  id int4,\n"
                      "  name text,\n"
                      "  last_login timestamp,\n"
                      "  password text\n"
                      ");\n")
                 normalize)
             (-> (mt/with-current-user (mt/user->id :crowberto)
                   (#'ai-sql-fixer.api/schema-sample query {:all-tables-limit 5}))
                 normalize))))))
