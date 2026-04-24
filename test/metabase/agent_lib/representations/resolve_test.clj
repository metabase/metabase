(ns metabase.agent-lib.representations.resolve-test
  "Tests for the repr → canonical-MBQL resolver.

  Strategy: for each MVP operation type (`filters`, `aggregation`, `breakout`, `order-by`,
  `limit`, `fields`, `joins`), feed a parsed representations-form map through the resolver and
  assert that the output is:

    * a valid MBQL 5 query per `lib.schema/query`;
    * with numeric FK ids in the correct places (table, field, source-table);
    * with `:lib/uuid` stamped on every clause;
    * with known enum values (temporal unit, strategy) keywordized.

  Test inputs are expressed as Clojure data structures with string keys — the exact shape
  `repr/parse-yaml` would return — rather than as YAML strings. Parser-level concerns are
  covered by `metabase.agent-lib.representations-test`; this suite focuses on resolution."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Fixture metadata provider
;;; ============================================================

(def ^:private mp
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample" :dbms-version {:flavor "PostgreSQL"} :engine :postgres}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 11 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL"      :table-id 10 :base-type :type/Float}
               {:id 102 :name "CREATED_AT" :table-id 10 :base-type :type/DateTime}
               {:id 103 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer}
               {:id 110 :name "ID"         :table-id 11 :base-type :type/Integer}
               {:id 111 :name "CATEGORY"   :table-id 11 :base-type :type/Text}]}))

(defn- schema-valid? [query]
  (nil? (mr/explain ::lib.schema/query query)))

;;; ============================================================
;;; Simple aggregation + breakout
;;; ============================================================

(deftest aggregation-breakout-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "aggregation"  [["count" {}]]
                             "breakout"     [["field" {"temporal-unit" "month"}
                                              ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
        q      (repr.resolve/resolve-query mp parsed)]
    (testing "shape of output"
      (is (= :mbql/query (:lib/type q)))
      (is (= 1 (:database q)))
      (is (= 1 (count (:stages q)))))
    (testing "source-table resolved to numeric id"
      (is (= 10 (get-in q [:stages 0 :source-table]))))
    (testing "aggregation is keywordized, has lib/uuid"
      (let [[head opts] (get-in q [:stages 0 :aggregation 0])]
        (is (= :count head))
        (is (uuid? (parse-uuid (:lib/uuid opts))))))
    (testing "breakout field resolved + temporal-unit keywordized"
      (let [[head opts id] (get-in q [:stages 0 :breakout 0])]
        (is (= :field head))
        (is (= 102 id))
        (is (= :month (:temporal-unit opts)))))
    (testing "query passes lib.schema/query"
      (is (schema-valid? q)))))

;;; ============================================================
;;; filters / limit / order-by
;;; ============================================================

(deftest filters-limit-orderby-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "filters"      [[">" {}
                                              ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                              100]]
                             "aggregation"  [["sum" {}
                                              ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                             "order-by"     [["desc" {}
                                              ["field" {} ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]]
                             "limit"        50}]}
        q      (repr.resolve/resolve-query mp parsed)
        st0    (get-in q [:stages 0])]
    (testing "filter clause"
      (let [[op _opts lhs rhs] (get-in st0 [:filters 0])]
        (is (= :> op))
        (is (= :field (first lhs)))
        (is (= 101 (last lhs)))
        (is (= 100 rhs))))
    (testing "sum aggregation on a field"
      (let [[op _opts arg] (get-in st0 [:aggregation 0])]
        (is (= :sum op))
        (is (= :field (first arg)))
        (is (= 101 (last arg)))))
    (testing "order-by desc on CREATED_AT"
      (let [[op _opts arg] (get-in st0 [:order-by 0])]
        (is (= :desc op))
        (is (= 102 (last arg)))))
    (testing "limit"
      (is (= 50 (:limit st0))))
    (testing "query passes lib.schema/query"
      (is (schema-valid? q)))))

;;; ============================================================
;;; fields (projection)
;;; ============================================================

(deftest fields-projection-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "fields"       [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]
                                             ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]}]}
        q      (repr.resolve/resolve-query mp parsed)
        fs     (get-in q [:stages 0 :fields])]
    (is (= 2 (count fs)))
    (is (= #{100 101} (set (map last fs))))
    (is (every? #(= :field (first %)) fs))
    (is (schema-valid? q))))

;;; ============================================================
;;; Explicit join
;;; ============================================================

(deftest explicit-join-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "joins"        [{"alias"      "Products"
                                              "strategy"   "left-join"
                                              "stages"     [{"lib/type"     "mbql.stage/mbql"
                                                             "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]
                                              "conditions" [["=" {}
                                                             ["field" {}
                                                              ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                                             ["field" {"join-alias" "Products"}
                                                              ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]}]
                             "aggregation"  [["count" {}]]
                             "breakout"     [["field" {"join-alias" "Products"}
                                              ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}
        q      (repr.resolve/resolve-query mp parsed)
        st0    (get-in q [:stages 0])
        join   (get-in st0 [:joins 0])]
    (testing "join has alias + strategy keywordized"
      (is (= "Products" (:alias join)))
      (is (= :left-join (:strategy join))))
    (testing "join stages resolved"
      (is (= 11 (get-in join [:stages 0 :source-table]))))
    (testing "condition fields resolved to numeric ids"
      (let [[_ _ lhs rhs] (get-in join [:conditions 0])]
        (is (= 103 (last lhs)))
        (is (= 110 (last rhs)))
        (is (= "Products" (:join-alias (second rhs))))))
    (testing "breakout field from joined table uses join-alias"
      (let [[_ opts id] (get-in st0 [:breakout 0])]
        (is (= 111 id))
        (is (= "Products" (:join-alias opts)))))
    (testing "query passes lib.schema/query"
      (is (schema-valid? q)))))

;;; ============================================================
;;; Error paths: resolver surface errors
;;; ============================================================

(deftest unknown-table-error-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "NOPE"]
                             "aggregation"  [["count" {}]]}]}]
    (try
      (repr.resolve/resolve-query mp parsed)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (is (= :unknown-table (:error (ex-data e))))))))

(deftest unknown-field-error-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Sample"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "NOPE"]]]
                             "aggregation"  [["count" {}]]}]}]
    (try
      (repr.resolve/resolve-query mp parsed)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (is (= :unknown-field (:error (ex-data e))))))))

(deftest database-mismatch-error-test
  (let [parsed {"lib/type" "mbql/query"
                "database" "Wrong"
                "stages"   [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "aggregation"  [["count" {}]]}]}]
    (try
      (repr.resolve/resolve-query mp parsed)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (is (= :unknown-database (:error (ex-data e))))))))
