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
   [metabase.agent-lib.representations :as repr]
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

(deftest export-query-round-trip-shape-test
  (testing "resolved numeric pMBQL exports back to the portable string-keyed representations form"
    (let [parsed  {"lib/type" "mbql/query"
                   "database" "Sample"
                   "stages"   [{"lib/type"     "mbql.stage/mbql"
                                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                "aggregation"  [["count" {}]]
                                "breakout"     [["field" {"temporal-unit" "month"}
                                                 ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
          q       (repr.resolve/resolve-query mp parsed)
          exported (repr.resolve/export-query mp q)]
      (is (= "mbql/query" (get exported "lib/type")))
      (is (= "Sample" (get exported "database")))
      (is (nil? (get exported "lib/metadata")))
      (is (= ["Sample" "PUBLIC" "ORDERS"]
             (get-in exported ["stages" 0 "source-table"])))
      (is (= ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]
             (get-in exported ["stages" 0 "breakout" 0 2])))
      (is (string? (get-in exported ["stages" 0 "aggregation" 0 1 "lib/uuid"])))
      (is (= exported (repr/validate-query exported))))))

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

;;; ============================================================
;;; Extended source-field variants (step 12)
;;;
;;; The resolver itself does no special handling: `source-field-name` and
;;; `source-field-join-alias` are plain strings that pass through `import-mbql` untouched and
;;; are keywordized by `lib.normalize`. Documented here so a future change to either layer
;;; that breaks the propagation is caught by a single explicit test.
;;; ============================================================

(deftest extended-source-field-variants-pass-through-test
  (testing "source-field-name (multi-stage previous-stage column ref) is preserved as a string"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}
                              {"lib/type" "mbql.stage/mbql"
                               "fields"   [["field"
                                            {"base-type"         "type/Text"
                                             "source-field-name" "PRODUCT_ID"}
                                            "CATEGORY"]]}]}
          out (repr.resolve/resolve-query mp parsed)
          field-clause (get-in out [:stages 1 :fields 0])
          opts         (nth field-clause 1)]
      (is (schema-valid? out))
      (is (= "PRODUCT_ID" (:source-field-name opts)))
      (is (= "CATEGORY" (nth field-clause 2))
          "the field clause's third slot stays the cross-stage column name (a string)")))
  (testing "source-field-join-alias (FK column lives on an explicitly-joined table) is preserved as a string"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "joins"        [{"lib/type"   "mbql/join"
                                                "alias"      "Orders_A"
                                                "strategy"   "left-join"
                                                "stages"     [{"lib/type"     "mbql.stage/mbql"
                                                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}]
                                                "conditions" [["=" {}
                                                               ["field" {}
                                                                ["Sample" "PUBLIC" "ORDERS" "ID"]]
                                                               ["field" {"join-alias" "Orders_A"}
                                                                ["Sample" "PUBLIC" "ORDERS" "ID"]]]]}]
                               "fields"       [["field"
                                                {"source-field"            ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]
                                                 "source-field-join-alias" "Orders_A"}
                                                ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}
          out (repr.resolve/resolve-query mp parsed)
          field-clause (get-in out [:stages 0 :fields 0])
          opts         (nth field-clause 1)]
      (is (schema-valid? out))
      (is (= "Orders_A" (:source-field-join-alias opts)))
      (is (= 103 (:source-field opts))
          "the portable `source-field` FK is still resolved to its numeric id alongside the alias"))))

;;; ============================================================
;;; annotate-field-types — base-type / effective-type stamping
;;; ============================================================

(def ^:private mp-with-effective-type
  "Provider that has a field whose effective-type differs from its base-type."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample" :dbms-version {:flavor "PostgreSQL"} :engine :postgres}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 11 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL"      :table-id 10 :base-type :type/Float}
               {:id 102 :name "CREATED_AT" :table-id 10 :base-type :type/DateTime}
               {:id 103 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer
                :fk-target-field-id 110}
               {:id 104 :name "UNIX_TS" :table-id 10
                :base-type :type/Integer :effective-type :type/Temporal}
               {:id 110 :name "ID"         :table-id 11 :base-type :type/Integer}
               {:id 111 :name "CATEGORY"   :table-id 11 :base-type :type/Text}]}))

(deftest annotate-field-types-effective-type-test
  (testing "when a field has :effective-type it is also stamped on the clause"
    ;; UNIX_TS is stored as Integer but coerced to Temporal — a real pattern for Unix timestamps.
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "filters"      [["=" {}
                                                ["field" {}
                                                 ["Sample" "PUBLIC" "ORDERS" "UNIX_TS"]]
                                                0]]}]}
          q     (repr.resolve/resolve-query mp-with-effective-type parsed)
          [_ _ field-clause] (get-in q [:stages 0 :filters 0])
          opts  (nth field-clause 1)]
      (is (= 104 (nth field-clause 2)))
      (is (= :type/Integer  (:base-type opts)))
      (is (= :type/Temporal (:effective-type opts))))))

(deftest annotate-field-types-idempotent-test
  (testing "clauses that already carry :base-type are not overwritten"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "filters"      [["=" {"base-type" "type/Text"}
                                                ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                "x"]]}]}
          q   (repr.resolve/resolve-query mp-with-effective-type parsed)
          ;; TOTAL is :type/Float in the provider, but the LLM authored :type/Text — we must
          ;; not clobber it.
          [_ _ field-clause] (get-in q [:stages 0 :filters 0])
          opts (nth field-clause 1)]
      ;; The outer `=` opts had "base-type" authored on it (wrong place structurally, but the
      ;; point is the inner field clause itself has no authored base-type, so it should get
      ;; the Float from the provider.
      (is (= :type/Float (:base-type opts))
          "inner field clause still gets provider type when it has none"))))

;;; ============================================================
;;; try-export-query: structured + native + nil/error fallback
;;; ============================================================

(deftest try-export-query-structured-test
  (testing "structured pMBQL exports to a portable repr-form map with portable FKs and string keys"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]
                               "breakout"     [["field" {"temporal-unit" "month"}
                                                ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
          q        (repr.resolve/resolve-query mp parsed)
          exported (repr.resolve/try-export-query mp q)]
      (is (map? exported))
      (is (= "mbql/query" (get exported "lib/type")))
      (is (= "Sample" (get exported "database")))
      (is (= ["Sample" "PUBLIC" "ORDERS"]
             (get-in exported ["stages" 0 "source-table"])))
      (is (not (contains? exported :lib/metadata))
          "the metadata-provider handle never leaks to the LLM-facing payload")
      (is (not (contains? exported "lib/metadata"))))))

(deftest try-export-query-nil-and-error-fallback-test
  (testing "nil / blank input returns nil so the caller can omit the field"
    (is (nil? (repr.resolve/try-export-query mp nil)))
    (is (nil? (repr.resolve/try-export-query mp {})))
    (is (nil? (repr.resolve/try-export-query nil {:lib/type :mbql/query :database 1 :stages []}))))
  (testing "export errors are swallowed and surface as nil (the caller falls back gracefully)"
    ;; A query map with a numeric field id that doesn't exist in the metadata-provider
    ;; will throw inside `export-mbql`; we want the helper to return nil rather than
    ;; tearing down the whole LLM context-building flow.
    (let [bogus {:lib/type :mbql/query
                 :database 1
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 99999}]}]
      (is (nil? (repr.resolve/try-export-query mp bogus))))))

(deftest export-query-3-arity-threads-content-store-test
  (testing (str "export-query / try-export-query accept an explicit content-store as their "
                "third argument. The store is used for Card / Measure / Segment id → "
                "entity_id lookups (the N1 chokepoint). Pass an erroring store and the "
                "export-side `:export-fk` lookups should fail through that store, not "
                "through the default unchecked one. We use a basic 1-stage query (no card "
                "ref) so we can prove the 3-arity wiring works regardless of whether the "
                "particular query needs a content-store lookup.")
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          q (repr.resolve/resolve-query mp parsed)]
      (testing "3-arity export-query mirrors 2-arity for queries with no Card / Measure / Segment refs"
        (is (= (repr.resolve/export-query mp q)
               (repr.resolve/export-query mp q
                                          @(requiring-resolve
                                            'metabase.models.serialization.resolve.mp/unchecked-app-db-content-store)))))
      (testing "3-arity try-export-query likewise"
        (is (= (repr.resolve/try-export-query mp q)
               (repr.resolve/try-export-query mp q
                                              @(requiring-resolve
                                                'metabase.models.serialization.resolve.mp/unchecked-app-db-content-store))))))))
