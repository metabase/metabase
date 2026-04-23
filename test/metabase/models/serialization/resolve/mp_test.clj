(ns metabase.models.serialization.resolve.mp-test
  "Tests for the metadata-provider-backed serdes resolver.

  Covers the Phase-1 scope: `import-table-fk`, `import-field-fk`, `export-table-fk`,
  `export-field-fk`, and the error paths for unknown / ambiguous / missing targets.

  Phase-2 additions (step 11): `import-fk` for `Card` by entity_id."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

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

(def ^:private mp-schemaless
  "Schemaless database (e.g. Mongo) \u2014 :schema is nil."
  (lib.tu/mock-metadata-provider
   {:database {:id 2 :name "Mongo"}
    :tables   [{:id 20 :name "orders" :schema nil :db-id 2}]
    :fields   [{:id 200 :name "total" :table-id 20 :base-type :type/Float}]}))

(def ^:private mp-ambiguous-by-schema
  "Two tables with the same name, different schemas \u2014 disambiguated by schema."
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

;;; ============================================================
;;; import-table-fk
;;; ============================================================

(deftest import-table-fk-test
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

(deftest import-table-fk-error-test
  (testing "unknown table name"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Sample" "PUBLIC" "NOPE"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (= :unknown-table (:error d)))
            (is (= 400 (:status-code d))))))))
  (testing "table name exists but wrong schema"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Sample" "OTHER" "ORDERS"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :unknown-table (:error (ex-data e))))))))
  (testing "database name mismatch"
    (let [r (resolve.mp/import-resolver mp-simple)]
      (try
        (resolve/import-table-fk r ["Different" "PUBLIC" "ORDERS"])
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (= :unknown-table (:error d)))
            (is (= "Sample" (:expected-db d)))))))))

;;; ============================================================
;;; import-field-fk
;;; ============================================================

(deftest import-field-fk-test
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

(deftest import-field-fk-error-test
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

;;; ============================================================
;;; export-table-fk / export-field-fk
;;; ============================================================

(deftest export-table-fk-test
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

(deftest export-field-fk-test
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

;;; ============================================================
;;; Not-yet-implemented methods
;;; ============================================================

(deftest not-implemented-phase1-test
  (let [er (resolve.mp/export-resolver mp-simple)]
    (testing "export-fk throws :not-implemented-yet"
      (try
        (resolve/export-fk er 1 'Card)
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (is (= :not-implemented-yet (:error (ex-data e)))))))))

;;; ============================================================
;;; import-fk — Card by entity_id (step 11)
;;; ============================================================

(deftest import-fk-card-happy-path-test
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

(deftest import-fk-card-nil-input-returns-nil-test
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

(deftest import-fk-card-cross-database-test
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

(deftest import-fk-non-card-models-still-not-implemented-test
  (testing "models other than Card still throw :not-implemented-yet"
    (let [ir (resolve.mp/import-resolver mp-simple)]
      (doseq [model ['Segment 'Metric 'NativeQuerySnippet :model/Segment]]
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

(deftest outbound-fks-from-table-happy-path-test
  (testing "returns one entry per outbound FK, with target-table-id resolved"
    (let [edges (resolve.mp/outbound-fks-from-table mp-fks-3 10)]
      (is (= 2 (count edges)))
      (is (= #{[101 20] [102 30]}
             (set (map (juxt :source-field-id :target-table-id) edges))))
      (is (every? :target-field-id edges))
      (is (every? :source-field edges)))))

(deftest outbound-fks-from-table-no-fks-test
  (testing "table with no outbound FKs returns empty seq"
    (is (= [] (resolve.mp/outbound-fks-from-table mp-fks-3 20)))
    (is (= [] (resolve.mp/outbound-fks-from-table mp-fks-3 30)))))

(deftest outbound-fks-from-table-simple-mp-test
  (testing "works on the existing simple MP too (no FKs configured)"
    (is (= [] (resolve.mp/outbound-fks-from-table mp-simple 10)))))
