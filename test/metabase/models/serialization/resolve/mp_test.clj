(ns metabase.models.serialization.resolve.mp-test
  "Tests for the metadata-provider-backed serdes resolver.

  Covers the Phase-1 scope: `import-table-fk`, `import-field-fk`, `export-table-fk`,
  `export-field-fk`, and the error paths for unknown / ambiguous / missing targets.

  Phase-2 additions (step 11): `import-fk` for `Card` by entity_id."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Needed for the measure/segment happy-path tests below — `(mt/id :orders :total)` requires
;; the test-data dataset to be fully synced (table + fields).
(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ============================================================
;;; Mock fixtures
;;; ============================================================

(def ^:private mp-simple
  "Single database 'Sample', one table PUBLIC.ORDERS with a couple of columns."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS" :schema "PUBLIC" :db-id 1}
               {:id 11 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL"      :table-id 10 :base-type :type/Float}
               {:id 102 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer}
               {:id 110 :name "ID"         :table-id 11 :base-type :type/Integer}
               {:id 111 :name "CATEGORY"   :table-id 11 :base-type :type/Text}]}))

(def ^:private mp-with-fk
  "Same shape as `mp-simple`, but `ORDERS.PRODUCT_ID` carries an FK target pointing
  at `PRODUCTS.ID`. Used to exercise the FK-candidate hint surfaced by `find-field`
  when the LLM asks for a column that lives on an FK-reachable table."
  (lib.tu/mock-metadata-provider
   {:database {:id 6 :name "Sample"}
    :tables   [{:id 60 :name "ORDERS"   :schema "PUBLIC" :db-id 6}
               {:id 61 :name "PRODUCTS" :schema "PUBLIC" :db-id 6}]
    :fields   [{:id 600 :name "ID"         :table-id 60 :base-type :type/Integer}
               {:id 602 :name "PRODUCT_ID" :table-id 60 :base-type :type/Integer
                :fk-target-field-id 610}
               {:id 610 :name "ID"       :table-id 61 :base-type :type/Integer}
               {:id 611 :name "CATEGORY" :table-id 61 :base-type :type/Text}]}))

(def ^:private mp-schemaless
  "Schemaless database (e.g. Mongo) - :schema is nil."
  (lib.tu/mock-metadata-provider
   {:database {:id 2 :name "Mongo"}
    :tables   [{:id 20 :name "orders" :schema nil :db-id 2}]
    :fields   [{:id 200 :name "total" :table-id 20 :base-type :type/Float}]}))

(def ^:private mp-ambiguous-by-schema
  "Two tables with the same name, different schemas - disambiguated by schema."
  (lib.tu/mock-metadata-provider
   {:database {:id 3 :name "DW"}
    :tables   [{:id 30 :name "ORDERS" :schema "RAW"   :db-id 3}
               {:id 31 :name "ORDERS" :schema "CLEAN" :db-id 3}]
    :fields   [{:id 300 :name "ID" :table-id 30 :base-type :type/Integer}
               {:id 310 :name "ID" :table-id 31 :base-type :type/Integer}]}))

;; JSON-unfolded field: a column with a parent-id.
(def ^:private mp-nested
  "Database with a JSON-unfolded nested field: ORDERS.META -> ORDERS.META.vendor."
  (lib.tu/mock-metadata-provider
   {:database {:id 4 :name "Nested"}
    :tables   [{:id 40 :name "ORDERS" :schema "PUBLIC" :db-id 4}]
    :fields   [{:id 400 :name "META"   :table-id 40 :base-type :type/JSON}
               {:id 401 :name "vendor" :table-id 40 :parent-id 400 :base-type :type/Text}]}))

(def ^:private card-entity-id "cardEntityId123456789")
(def ^:private metric-entity-id "metricEntityId1234567")

(def ^:private mp-with-cards
  "Database with regular Card and metric Card metadata for source-card / metric export."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 101 :name "TOTAL" :table-id 10 :base-type :type/Float}]
    :cards    [{:id          500
                :name        "Saved Orders"
                :database-id 1
                :type        :question
                :entity-id   card-entity-id}
               {:id          501
                :name        "Revenue Metric"
                :database-id 1
                :type        :metric
                :entity-id   metric-entity-id}]}))

;;; ============================================================
;;; import-table-fk
;;; ============================================================

(deftest ^:parallel import-table-fk-test
  (testing "happy path"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (is (= 10 (resolve/import-table-fk r ["Sample" "PUBLIC" "ORDERS"])))
      (is (= 11 (resolve/import-table-fk r ["Sample" "PUBLIC" "PRODUCTS"])))))
  (testing "nil input returns nil"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (is (nil? (resolve/import-table-fk r nil)))))
  (testing "schemaless: nil schema slot matches real null schema"
    (let [r (resolve.mp/import-resolver mp-schemaless)]
      (is (= 20 (resolve/import-table-fk r ["Mongo" nil "orders"])))))
  (testing "schema disambiguation: same name in two schemas"
    (let [r (resolve.mp/import-resolver mp-ambiguous-by-schema)]
      (is (= 30 (resolve/import-table-fk r ["DW" "RAW"   "ORDERS"])))
      (is (= 31 (resolve/import-table-fk r ["DW" "CLEAN" "ORDERS"]))))))

(deftest import-table-fk-cache-collision-test
  (testing "two real tables sharing a name across schemas: app-DB-backed resolver must not drop either"
    ;; Reproduces a production failure where `query` / `construct_query` returned
    ;; `:unknown-table` for a portable FK that `entity_details` had just emitted, then
    ;; verifies the fix.
    ;;
    ;; Production wraps every `application-database-metadata-provider` with
    ;; `cached-metadata-provider`. The cached provider's by-name cache key drops `:schema`
    ;; and stores at most one metadata per requested name, so when two warehouse tables
    ;; share a `name` across schemas, `(p/metadatas mp {:name #{n}})` returns at most one
    ;; row -- the schema post-filter in `find-table` then yields 0 candidates for the
    ;; schema that didn't win the cache write.
    ;;
    ;; The fix in [[resolve.mp/find-table]] bypasses the metadata provider for app-DB-backed
    ;; lookups and queries `metabase_table` directly with schema in the WHERE clause, the
    ;; same shape `metabase.models.serialization.resolve.db/import-table-fk` has always
    ;; used.
    (mt/with-temp [:model/Database db {:name (str "DW " (random-uuid)) :engine :h2}
                   :model/Table    raw-orders   {:name "ORDERS" :schema "RAW"   :db_id (:id db)}
                   :model/Table    clean-orders {:name "ORDERS" :schema "CLEAN" :db_id (:id db)}]
      (let [mp (lib-be/application-database-metadata-provider (:id db))
            r  (resolve.mp/import-resolver mp)]
        (is (= (:id raw-orders)   (resolve/import-table-fk r [(:name db) "RAW"   "ORDERS"])))
        (is (= (:id clean-orders) (resolve/import-table-fk r [(:name db) "CLEAN" "ORDERS"])))))))

(deftest import-table-fk-inactive-table-test
  (testing "a portable FK to an inactive table (deleted / re-uploaded CSV) must NOT resolve"
    ;; A deleted / re-uploaded upload leaves an inactive app-DB row whose warehouse table is gone;
    ;; a stale FK to it must miss, with a message identical to a never-existed miss (asserted
    ;; below) since distinguishing them would be an existence oracle.
    (mt/with-temp [:model/Database db    {:name (str "Uploads " (random-uuid)) :engine :h2}
                   :model/Table    _gone {:name   "metabot2_38513168ae9131" :schema "PUBLIC"
                                          :db_id  (:id db)                   :active false}]
      (let [mp (lib-be/application-database-metadata-provider (:id db))
            r  (resolve.mp/import-resolver mp)]
        (try
          (resolve/import-table-fk r [(:name db) "PUBLIC" "metabot2_38513168ae9131"])
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d   (ex-data e)
                  msg (.getMessage e)]
              (is (= :unknown-table (:error d)))
              (is (= 400 (:status-code d)))
              (is (true? (:agent-error? d)))
              (is (re-find #"entity_details" msg) "message points the LLM at entity_details to re-list")
              (testing "inactive-row miss is indistinguishable from a never-existed miss (no oracle)"
                (let [never-existed (try (resolve/import-table-fk r [(:name db) "PUBLIC" "never_existed_xyz"])
                                         (catch clojure.lang.ExceptionInfo e2 (.getMessage e2)))]
                  ;; same wording modulo the echoed portable FK (which the caller supplied either way)
                  (is (= (str/replace msg #"\[.*?\]" "[FK]")
                         (str/replace never-existed #"\[.*?\]" "[FK]"))))))))))))

(deftest import-table-fk-inactive-after-cache-warmed-test
  (testing "a table cached while active, then marked inactive, must NOT resolve via the stale cache"
    ;; The dangerous case the app-DB-existence check guards against: the cached metadata provider
    ;; warms its by-name cache with the `:active true` row, then the table is marked inactive
    ;; (deleted / re-uploaded upload). The cache still surfaces the stale active row, so
    ;; `table-candidates` MUST consult the app DB for existence — find the inactive row — and treat
    ;; it as a 0-candidate miss rather than falling back to the stale cache.
    (mt/with-temp [:model/Database db    {:name (str "Uploads " (random-uuid)) :engine :h2}
                   :model/Table    gone  {:name   "metabot2_cafef00dbabe01" :schema "PUBLIC"
                                          :db_id  (:id db)                   :active true}]
      (let [mp (lib-be/application-database-metadata-provider (:id db))
            r  (resolve.mp/import-resolver mp)
            by-name #(lib.metadata.protocols/metadatas
                      mp {:lib/type :metadata/table :name #{"metabot2_cafef00dbabe01"}})]
        (testing "warm the provider's by-name cache while the table is still active"
          (is (= [true] (mapv :active (by-name))))
          (is (= (:id gone) (resolve/import-table-fk r [(:name db) "PUBLIC" "metabot2_cafef00dbabe01"]))))
        (t2/update! :model/Table (:id gone) {:active false})
        (testing "the cache still surfaces the stale ACTIVE row by name"
          (is (= [true] (mapv :active (by-name)))))
        (testing "...but import-table-fk misses: the app DB sees the inactive row, no stale-cache fallback"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"No table found matching portable FK"
               (resolve/import-table-fk r [(:name db) "PUBLIC" "metabot2_cafef00dbabe01"]))))))))

(deftest matching-tables-via-provider-drops-inactive-test
  (testing "matching-tables-via-provider filters the inactive rows the provider surfaces by name"
    ;; Isolates the provider-side filter. By-name `metadatas` lookups skip the provider's SQL
    ;; `active = true` clause (it only guards enumerate-all queries), so the inactive row reaches
    ;; `matching-tables-via-provider`, whose filter is the only thing that drops it.
    (mt/with-temp [:model/Database db    {:name (str "Uploads " (random-uuid)) :engine :h2}
                   :model/Table    _gone {:name   "metabot2_deadbeefcafe01" :schema "PUBLIC"
                                          :db_id  (:id db)                   :active false}]
      (let [mp (lib-be/application-database-metadata-provider (:id db))]
        (testing "the provider DOES surface the inactive row on a raw by-name lookup"
          (is (= [false]
                 (mapv :active
                       (lib.metadata.protocols/metadatas
                        mp {:lib/type :metadata/table :name #{"metabot2_deadbeefcafe01"}})))))
        (testing "...but matching-tables-via-provider drops it"
          (is (empty? (#'resolve.mp/matching-tables-via-provider mp "PUBLIC" "metabot2_deadbeefcafe01"))))))))

(deftest ^:parallel import-table-fk-error-test
  (testing "unknown table name → :unknown-table, agent-error?, 400, no info leak"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Sample" "PUBLIC" "NOPE"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d   (ex-data e)
                msg (.getMessage e)]
            (is (= :unknown-table (:error d)))
            (is (= 400 (:status-code d)))
            (is (true? (:agent-error? d)))
            (is (= ["Sample" "PUBLIC" "NOPE"] (:path d)))
            (testing "ex-data carries only the rejected path — no candidates / schemas"
              (is (nil? (:candidates d)))
              (is (nil? (:available-schemas d))))
            (testing "message points the LLM at entity_details for self-correction"
              (is (re-find #"entity_details" msg)))))))))

(deftest ^:parallel import-table-fk-error-test-2
  (testing "schema does not exist in DB → still :unknown-table, no schema enumeration"
    ;; Pre-S1 this returned :unknown-schema + the full schema list. Post-S1 we collapse to
    ;; :unknown-table with no schema enumeration so a sandboxed user can't enumerate
    ;; schemas they lack perms on.
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Sample" "OTHER" "ORDERS"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d   (ex-data e)
                msg (.getMessage e)]
            (is (= :unknown-table (:error d)))
            (is (true? (:agent-error? d)))
            (is (nil? (:available-schemas d)))
            (testing "message must not enumerate schemas"
              (is (not (re-find #"PUBLIC" msg)))
              (is (not (re-find #"Available schemas" msg))))))))))

(deftest ^:parallel import-table-fk-error-test-3
  (testing "table exists in other schemas → :unknown-table, no cross-schema leak"
    ;; A sandboxed user with no perms on schema RAW must not learn that RAW.ORDERS exists
    ;; just by hallucinating CLEAN.ORDERS at the agent.
    (let [mp (lib.tu/mock-metadata-provider
              {:database {:id 5 :name "DW2"}
               :tables   [{:id 50 :name "ORDERS"   :schema "RAW"   :db-id 5}
                          {:id 51 :name "PRODUCTS" :schema "CLEAN" :db-id 5}]})
          r  (resolve.mp/import-resolver mp)]
      (try
        (resolve/import-table-fk r ["DW2" "CLEAN" "ORDERS"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d   (ex-data e)
                msg (.getMessage e)]
            (is (= :unknown-table (:error d)))
            (is (nil? (:candidates d)))
            (testing "message must not name RAW.ORDERS as a candidate"
              (is (not (re-find #"RAW" msg))))))))))

(deftest ^:parallel import-table-fk-error-test-4
  (testing "database name mismatch"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Different" "PUBLIC" "ORDERS"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (= :unknown-table (:error d)))
            (is (= "Sample" (:expected-db d)))
            (is (true? (:agent-error? d)))))))))

(deftest ^:parallel import-table-fk-error-test-5
  (testing "fuzzy substring suggestions are NOT surfaced (info-leak guard)"
    ;; Pre-S1 the resolver would surface `PUBLIC.ORDERS` as a "closest tables" candidate
    ;; for an `ORDER` hallucination. Post-S1 nothing is suggested.
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Sample" "PUBLIC" "ORDER"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d   (ex-data e)
                msg (.getMessage e)]
            (is (= :unknown-table (:error d)))
            (is (nil? (:candidates d)))
            (testing "message must not name any other table in the database"
              (is (not (re-find #"PUBLIC\.ORDERS" msg)))
              (is (not (re-find #"Closest tables" msg))))))))))

;;; ============================================================
;;; import-field-fk
;;; ============================================================

(deftest ^:parallel import-field-fk-test
  (testing "happy path"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (is (= 100 (resolve/import-field-fk r ["Sample" "PUBLIC" "ORDERS"   "ID"])))
      (is (= 101 (resolve/import-field-fk r ["Sample" "PUBLIC" "ORDERS"   "TOTAL"])))
      (is (= 111 (resolve/import-field-fk r ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"])))))
  (testing "schemaless"
    (let [r (resolve.mp/import-resolver mp-schemaless)]
      (is (= 200 (resolve/import-field-fk r ["Mongo" nil "orders" "total"])))))
  (testing "nil input returns nil"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (is (nil? (resolve/import-field-fk r nil)))))
  (testing "JSON-unfolded nested field walks parent-id chain"
    (let [r (resolve.mp/import-resolver mp-nested)]
      (is (= 401 (resolve/import-field-fk r ["Nested" "PUBLIC" "ORDERS" "META" "vendor"]))))))

(deftest ^:parallel import-field-fk-error-test
  (testing "unknown field"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-field-fk r ["Sample" "PUBLIC" "ORDERS" "NOPE"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :unknown-field (:error (ex-data e))))))))
  (testing "unknown table (bubbles up through find-table)"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-field-fk r ["Sample" "PUBLIC" "GHOST" "ID"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :unknown-table (:error (ex-data e))))))))
  (testing "short field FK (missing field segment)"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-field-fk r ["Sample" "PUBLIC" "ORDERS"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :invalid-field-fk (:error (ex-data e)))))))))

(deftest ^:parallel import-field-fk-no-fk-candidate-leak-test
  (testing "an unknown field that lives on an FK-reachable table MUST NOT surface that table"
    ;; Pre-S1 the resolver helpfully suggested `[Sample PUBLIC PRODUCTS CATEGORY]` as a
    ;; candidate when the LLM asked for `[Sample PUBLIC ORDERS CATEGORY]`. That leaks the
    ;; existence of PRODUCTS to anyone whose data perms exclude that table.
    (let [r (resolve.mp/import-resolver mp-with-fk)]
      (try
        (resolve/import-field-fk r ["Sample" "PUBLIC" "ORDERS" "CATEGORY"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d   (ex-data e)
                msg (.getMessage e)]
            (is (= :unknown-field (:error d)))
            (is (true? (:agent-error? d)))
            (is (nil? (:fk-candidates d)) "ex-data must not carry FK candidates")
            (testing "message must not name PRODUCTS or FK-linked tables"
              (is (not (re-find #"PRODUCTS" msg)))
              (is (not (re-find #"FK-linked" msg)))))))))
  (testing "unknown field also doesn't leak when no FK-reachable table has the column"
    (let [r (resolve.mp/import-resolver mp-with-fk)]
      (try
        (resolve/import-field-fk r ["Sample" "PUBLIC" "ORDERS" "NOT_ANYWHERE"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (= :unknown-field (:error d)))
            (is (nil? (:fk-candidates d)))
            (is (not (re-find #"FK-linked tables" (.getMessage e))))))))))

;;; ============================================================
;;; export-table-fk / export-field-fk
;;; ============================================================

(deftest ^:parallel export-table-fk-test
  (testing "happy path"
    (let [r (resolve.mp/export-resolver mp-simple)]
      (is (= ["Sample" "PUBLIC" "ORDERS"]   (resolve/export-table-fk r 10)))
      (is (= ["Sample" "PUBLIC" "PRODUCTS"] (resolve/export-table-fk r 11)))))
  (testing "nil returns nil"
    (let [r (resolve.mp/export-resolver mp-simple)]
      (is (nil? (resolve/export-table-fk r nil)))))
  (testing "unknown id throws"
    (let [r (resolve.mp/export-resolver mp-simple)]
      (try
        (resolve/export-table-fk r 9999)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :unknown-table-id (:error (ex-data e)))))))))

(deftest ^:parallel export-field-fk-test
  (testing "happy path"
    (let [r (resolve.mp/export-resolver mp-simple)]
      (is (= ["Sample" "PUBLIC" "ORDERS" "TOTAL"] (resolve/export-field-fk r 101)))))
  (testing "schemaless"
    (let [r (resolve.mp/export-resolver mp-schemaless)]
      (is (= ["Mongo" nil "orders" "total"] (resolve/export-field-fk r 200)))))
  (testing "JSON-unfolded field"
    (let [r (resolve.mp/export-resolver mp-nested)]
      (is (= ["Nested" "PUBLIC" "ORDERS" "META" "vendor"]
             (resolve/export-field-fk r 401)))))
  (testing "round-trip: import then export"
    (let [ir (resolve.mp/import-resolver mp-simple)
          er (resolve.mp/export-resolver mp-simple)
          path ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
      (is (= path (resolve/export-field-fk er (resolve/import-field-fk ir path)))))))

(deftest ^:parallel export-database-and-card-fks-test
  (let [r (resolve.mp/export-resolver mp-with-cards)]
    (testing "database id exports to the provider's database name"
      (is (= "Sample" (resolve/export-fk-keyed r 1 :model/Database :name)))
      (is (= "Sample" (resolve/export-fk-keyed r 1 'Database :name))))
    (testing "Card ids export to entity_ids for both source-card and metric refs"
      (is (= card-entity-id (resolve/export-fk r 500 :model/Card)))
      (is (= card-entity-id (resolve/export-fk r 500 'Card)))
      (is (= metric-entity-id (resolve/export-fk r 501 'Card))))
    (testing "nil inputs return nil"
      (is (nil? (resolve/export-fk r nil 'Card)))
      (is (nil? (resolve/export-fk-keyed r nil :model/Database :name))))))

(deftest ^:parallel export-mbql-with-mp-resolver-round-trip-shape-test
  (testing "final numeric pMBQL exports back to portable DB/table/field/card references"
    (let [r        (resolve.mp/export-resolver mp-with-cards)
          exported (resolve/export-mbql
                    r
                    {:lib/type :mbql/query
                     :database 1
                     :stages   [{:lib/type     :mbql.stage/mbql
                                 :source-table 10
                                 :fields       [[:field {} 101]]
                                 :aggregation  [[:metric {} 501]]}]})]
      (is (= "Sample" (:database exported)))
      (is (= ["Sample" "PUBLIC" "ORDERS"]
             (get-in exported [:stages 0 :source-table])))
      (is (= ["Sample" "PUBLIC" "ORDERS" "TOTAL"]
             (get-in exported [:stages 0 :fields 0 2])))
      (is (= metric-entity-id
             (get-in exported [:stages 0 :aggregation 0 2])))
      (is (string? (get-in exported [:stages 0 :fields 0 1 :lib/uuid])))
      (is (string? (get-in exported [:stages 0 :aggregation 0 1 :lib/uuid])))))
  (testing "source-card map keys export through the Card entity_id path"
    (let [r (resolve.mp/export-resolver mp-with-cards)]
      (is (= {:source-card card-entity-id}
             (resolve/export-mbql r {:source-card 500}))))))

;;; ============================================================
;;; Not-yet-implemented methods
;;; ============================================================

(deftest ^:parallel not-implemented-phase1-test
  (let [er (resolve.mp/export-resolver mp-simple)]
    (testing "export-fk for non-(Card/Measure/Segment) models still throws :not-implemented-yet"
      (try
        (resolve/export-fk er 1 'NativeQuerySnippet)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :not-implemented-yet (:error (ex-data e)))))))
    (testing "export-fk-keyed for non-database keys still throws :not-implemented-yet"
      (try
        (resolve/export-fk-keyed er 1 :model/Card :name)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :not-implemented-yet (:error (ex-data e)))))))))

;;; ============================================================
;;; import-fk - Card by entity_id (step 11)
;;; ============================================================

(deftest ^:parallel import-fk-card-happy-path-test
  (testing "resolves a saved card's entity_id to its numeric id when the card lives in the same database"
    (mt/with-temp [:model/Card {card-id :id card-eid :entity_id}
                   {:database_id  (mt/id)
                    :dataset_query {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (mt/id :orders)}}}]
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            ir (resolve.mp/import-resolver mp)]
        (is (= card-id (resolve/import-fk ir card-eid 'Card)))
        (testing "also accepts keyword-qualified model name :model/Card"
          (is (= card-id (resolve/import-fk ir card-eid :model/Card))))))))

(deftest ^:parallel import-fk-card-nil-input-returns-nil-test
  (testing "nil entity_id returns nil (matches table/field FK contract)"
    (let [ir (resolve.mp/import-resolver mp-simple)]
      (is (nil? (resolve/import-fk ir nil 'Card))))))

(deftest import-fk-card-unknown-test
  (testing "unknown entity_id throws :agent-error? with :unknown-card code"
    (mt/with-empty-h2-app-db!
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            ir (resolve.mp/import-resolver mp)]
        (try
          (resolve/import-fk ir "nonexistent_entity_id1" 'Card)
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (is (true? (:agent-error? d)))
              (is (= :unknown-card (:error d)))
              (is (= "nonexistent_entity_id1" (:entity-id d))))))))))

(deftest ^:parallel import-fk-card-cross-database-test
  (testing "a card that belongs to a different database surfaces a clear :cross-database-card error"
    (mt/with-temp [:model/Database {other-db-id :id} {:name "Other DB" :engine :h2}
                   :model/Card     {_card-id :id card-eid :entity_id}
                   {:database_id   other-db-id
                    :dataset_query {:database other-db-id
                                    :type     :native
                                    :native   {:query "SELECT 1"}}}]
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            ir (resolve.mp/import-resolver mp)]
        (try
          (resolve/import-fk ir card-eid 'Card)
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (is (true? (:agent-error? d)))
              (is (= :cross-database-card (:error d)))
              (is (= other-db-id (:card-database-id d))))))))))

;;; ============================================================
;;; import-fk / export-fk - Measure & Segment by entity_id
;;; ============================================================

(deftest ^:parallel import-fk-measure-happy-path-test
  (testing "resolves a measure's entity_id to its numeric id when the measure's table is in the same database"
    (mt/with-temp [:model/Measure {measure-id :id measure-eid :entity_id}
                   {:name "Test Measure"
                    :table_id (mt/id :orders)
                    :definition {:lib/type :mbql/query
                                 :database (mt/id)
                                 :stages [{:lib/type :mbql.stage/mbql
                                           :source-table (mt/id :orders)
                                           :aggregation [[:count {:lib/uuid (str (random-uuid))}]]}]}}]
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            ir (resolve.mp/import-resolver mp)]
        (is (= measure-id (resolve/import-fk ir measure-eid 'Measure)))
        (is (= measure-id (resolve/import-fk ir measure-eid :model/Measure)))))))

(deftest ^:parallel import-fk-segment-happy-path-test
  (testing "resolves a segment's entity_id to its numeric id when the segment's table is in the same database"
    (let [mp        (lib-be/application-database-metadata-provider (mt/id))
          ;; Look up the field id via lib metadata rather than `(mt/id :orders :total)` —
          ;; mp_test's fixture set syncs tables but not fields eagerly.
          orders-id (mt/id :orders)
          total-id  (-> (filter #(= "TOTAL" (:name %))
                                (lib.metadata.protocols/fields mp orders-id))
                        first :id)]
      (mt/with-temp [:model/Segment {segment-id :id segment-eid :entity_id}
                     {:name "Test Segment"
                      :table_id orders-id
                      :definition {:lib/type :mbql/query
                                   :database (mt/id)
                                   :stages [{:lib/type :mbql.stage/mbql
                                             :source-table orders-id
                                             :filters [[:> {:lib/uuid (str (random-uuid))}
                                                        [:field {:lib/uuid (str (random-uuid))} total-id]
                                                        100]]}]}}]
        (let [ir (resolve.mp/import-resolver mp)]
          (is (= segment-id (resolve/import-fk ir segment-eid 'Segment)))
          (is (= segment-id (resolve/import-fk ir segment-eid :model/Segment))))))))

(deftest import-fk-measure-unknown-test
  (testing "unknown measure entity_id throws :unknown-measure with :agent-error?"
    (mt/with-empty-h2-app-db!
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            ir (resolve.mp/import-resolver mp)]
        (try
          (resolve/import-fk ir "nonexistent_measure_id_x" 'Measure)
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (is (true? (:agent-error? d)))
              (is (= :unknown-measure (:error d)))
              (is (= "nonexistent_measure_id_x" (:entity-id d))))))))))

(deftest import-fk-segment-unknown-test
  (testing "unknown segment entity_id throws :unknown-segment with :agent-error?"
    (mt/with-empty-h2-app-db!
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            ir (resolve.mp/import-resolver mp)]
        (try
          (resolve/import-fk ir "nonexistent_segment_id_x" 'Segment)
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (is (true? (:agent-error? d)))
              (is (= :unknown-segment (:error d))))))))))

(deftest ^:parallel export-fk-measure-happy-path-test
  (testing "exports a measure's numeric id back to its portable entity_id"
    (mt/with-temp [:model/Measure {measure-id :id measure-eid :entity_id}
                   {:name "Round-trip Measure"
                    :table_id (mt/id :orders)
                    :definition {:lib/type :mbql/query
                                 :database (mt/id)
                                 :stages [{:lib/type :mbql.stage/mbql
                                           :source-table (mt/id :orders)
                                           :aggregation [[:count {:lib/uuid (str (random-uuid))}]]}]}}]
      (let [mp (lib-be/application-database-metadata-provider (mt/id))
            er (resolve.mp/export-resolver mp)]
        (is (= measure-eid (resolve/export-fk er measure-id 'Measure)))
        (is (= measure-eid (resolve/export-fk er measure-id :model/Measure)))))))

(deftest ^:parallel export-fk-segment-happy-path-test
  (testing "exports a segment's numeric id back to its portable entity_id"
    (let [mp        (lib-be/application-database-metadata-provider (mt/id))
          orders-id (mt/id :orders)
          total-id  (-> (filter #(= "TOTAL" (:name %))
                                (lib.metadata.protocols/fields mp orders-id))
                        first :id)]
      (mt/with-temp [:model/Segment {segment-id :id segment-eid :entity_id}
                     {:name "Round-trip Segment"
                      :table_id orders-id
                      :definition {:lib/type :mbql/query
                                   :database (mt/id)
                                   :stages [{:lib/type :mbql.stage/mbql
                                             :source-table orders-id
                                             :filters [[:> {:lib/uuid (str (random-uuid))}
                                                        [:field {:lib/uuid (str (random-uuid))} total-id]
                                                        0]]}]}}]
        (let [er (resolve.mp/export-resolver mp)]
          (is (= segment-eid (resolve/export-fk er segment-id 'Segment)))
          (is (= segment-eid (resolve/export-fk er segment-id :model/Segment))))))))

(deftest ^:parallel import-fk-non-supported-models-still-not-implemented-test
  (testing "models we haven't wired up still throw :not-implemented-yet"
    (let [ir (resolve.mp/import-resolver mp-simple)]
      ;; Card, Measure, Segment are wired up — see their happy-path tests below.
      ;; NativeQuerySnippet and Metric (the older standalone-metric concept, distinct from
      ;; metric-cards) remain unimplemented.
      (doseq [model ['NativeQuerySnippet 'Metric]]
        (testing (str "model " model)
          (try
            (resolve/import-fk ir "someentityid_some_xyz" model)
            (is false "expected throw")
            (catch clojure.lang.ExceptionInfo e
              (is (= :not-implemented-yet (:error (ex-data e)))))))))))

;;; ============================================================
;;; outbound-fks-from-table
;;; ============================================================

(def ^:private mp-fks-3
  "3-table MP: ORDERS \u2192 PRODUCTS and ORDERS \u2192 USERS."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}
               {:id 30 :name "USERS"    :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 102 :name "USER_ID"    :table-id 10 :base-type :type/Integer :fk-target-field-id 300}
               {:id 200 :name "ID"         :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"   :table-id 20 :base-type :type/Text}
               {:id 300 :name "ID"         :table-id 30 :base-type :type/Integer}
               {:id 301 :name "NAME"       :table-id 30 :base-type :type/Text}]}))

(deftest ^:parallel outbound-fks-from-table-happy-path-test
  (testing "returns one entry per outbound FK, with target-table-id resolved"
    (let [edges (resolve.mp/outbound-fks-from-table mp-fks-3 10)]
      (is (= 2 (count edges)))
      (is (= #{[101 20] [102 30]}
             (set (map (juxt :source-field-id :target-table-id) edges))))
      (is (every? :target-field-id edges))
      (is (every? :source-field edges)))))

(deftest ^:parallel outbound-fks-from-table-no-fks-test
  (testing "table with no outbound FKs returns empty seq"
    (is (= [] (resolve.mp/outbound-fks-from-table mp-fks-3 20)))
    (is (= [] (resolve.mp/outbound-fks-from-table mp-fks-3 30)))))

(deftest ^:parallel outbound-fks-from-table-simple-mp-test
  (testing "works on the existing simple MP too (no FKs configured)"
    (is (= [] (resolve.mp/outbound-fks-from-table mp-simple 10)))))

;;; ============================================================
;;; ContentStore - custom (no-app-db) lookups
;;; ============================================================

(defn- map-content-store
  "Build an in-memory [[ContentStore]] from `entity-id->card` (a map). Cards must include
  `:id` and `:database_id` so the resolver can do the cross-DB check. Measure / segment
  lookups always return nil — extend the reify or use a richer fixture when those paths
  need to be exercised."
  [entity-id->card]
  (reify resolve.mp/ContentStore
    (card-by-entity-id [_ entity-id]
      (get entity-id->card entity-id))
    (measure-by-entity-id [_ _entity-id] nil)
    (segment-by-entity-id [_ _entity-id] nil)
    (measure-by-id [_ _measure-id] nil)
    (segment-by-id [_ _segment-id] nil)))

(deftest ^:parallel import-fk-card-via-custom-content-store-happy-path-test
  (testing "a custom ContentStore lets the resolver work without an app DB"
    (let [card-eid "abcdefghijabcdefghij1"
          store    (map-content-store {card-eid {:id 4242 :database_id 1}})
          ir       (resolve.mp/import-resolver mp-simple store)]
      (is (= 4242 (resolve/import-fk ir card-eid 'Card))))))

(deftest ^:parallel import-fk-card-via-custom-content-store-unknown-test
  (testing "unknown entity_id from a custom store still surfaces :unknown-card"
    (let [ir (resolve.mp/import-resolver mp-simple (map-content-store {}))]
      (try
        (resolve/import-fk ir "nonexistent_entity_id1" 'Card)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :unknown-card (:error d)))))))))

(deftest ^:parallel import-fk-card-via-custom-content-store-cross-database-test
  (testing "cross-DB check fires regardless of where the card came from"
    (let [card-eid "abcdefghijabcdefghij2"
          ;; mp-simple's database is id=1; serve a card pinned to a different db.
          store    (map-content-store {card-eid {:id 99 :database_id 999}})
          ir       (resolve.mp/import-resolver mp-simple store)]
      (try
        (resolve/import-fk ir card-eid 'Card)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :cross-database-card (:error d)))
            (is (= 999 (:card-database-id d)))))))))
