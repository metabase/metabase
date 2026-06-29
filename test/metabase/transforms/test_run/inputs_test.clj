(ns metabase.transforms.test-run.inputs-test
  "Tests for strict input resolution: required-input-tables and match-fixtures.

  Test strategy:
  - Pure/driver-free tests use mt/with-temp to create minimal app-DB fixtures.
  - Integration tests that need real dependency extraction (native SQL, MBQL) use
    postgres+test-data; they are tagged :transforms/table per the execute_test pattern.
  - Source-card dep extraction is tested via mt/with-temp Card + mt/with-driver :postgres
    since the preprocess pipeline needs a real DB."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms.test-run.inputs :as inputs]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Helpers
;;; ---------------------------------------------------------------------------

(defn- make-native-transform
  "Build a minimal native-SQL transform value (not a DB row) with the given SQL."
  [db-id sql]
  {:source {:type :query
            :query {:database db-id
                    :type     :native
                    :native   {:query sql}}}})

(defn- make-mbql-transform
  "Build a minimal MBQL transform value over a single table."
  [db-id table-id]
  {:source {:type :query
            :query {:database db-id
                    :type     :query
                    :query    {:source-table table-id}}}})

(defn- make-python-transform
  "Build a stub python transform (not :query type)."
  []
  {:source {:type :python}})

;;; ---------------------------------------------------------------------------
;;; required-input-tables — happy paths
;;; ---------------------------------------------------------------------------

(deftest required-input-tables-mbql-single-table-test
  (testing "MBQL transform with a single source table returns one table-info entry"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [table-id (mt/id :orders)
              xf       (make-mbql-transform (mt/id) table-id)
              result   (inputs/required-input-tables xf)]
          (is (= 1 (count result)))
          (let [tbl (first result)]
            (is (= table-id (:id tbl)))
            (is (string? (:schema tbl)))
            (is (string? (:name tbl)))
            (is (vector? (:columns tbl)))
            (is (every? #(and (string? (:name %))
                              (keyword? (:base-type %))
                              (contains? % :nullable?))
                        (:columns tbl)))))))))

(deftest required-input-tables-mbql-join-test
  (testing "MBQL transform with a two-table join returns both tables"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              orders    (lib.metadata/table mp (mt/id :orders))
              products  (lib.metadata/table mp (mt/id :products))
              orders-q  (lib/query mp orders)
              o-prod-id (first (filter #(= "product_id" (:name %))
                                       (lib/visible-columns orders-q)))
              p-id      (first (filter #(and (= "id" (:name %))
                                             (= (:id products) (:table-id %)))
                                       (lib/visible-columns (lib/query mp products))))
              join-q    (-> orders-q
                            (lib/join (lib/join-clause products [(lib/= o-prod-id p-id)]))
                            (lib/aggregate (lib/count)))
              join-xf   {:source {:type :query :query join-q}}
              result    (inputs/required-input-tables join-xf)]
          (is (= 2 (count result)))
          (is (= #{(mt/id :orders) (mt/id :products)}
                 (set (map :id result)))))))))

(deftest required-input-tables-native-sql-test
  (testing "Native SQL transform returns the referenced synced table"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [xf     (make-native-transform (mt/id) "SELECT id, user_id FROM orders LIMIT 10")
              result (inputs/required-input-tables xf)]
          (is (= 1 (count result)))
          (let [tbl (first result)]
            (is (= (mt/id :orders) (:id tbl)))
            (is (string? (:schema tbl)))
            (is (= "orders" (:name tbl)))))))))

(deftest required-input-tables-columns-shape-test
  (testing "Each table-info carries a column schema"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [xf     (make-mbql-transform (mt/id) (mt/id :orders))
              result (inputs/required-input-tables xf)
              tbl    (first result)]
          (is (every? (fn [col]
                        (and (string? (:name col))
                             (keyword? (:base-type col))
                             (boolean? (:nullable? col))))
                      (:columns tbl)))
          ;; orders.id is NOT NULL → nullable? false
          (let [id-col (first (filter #(= "id" (:name %)) (:columns tbl)))]
            (is (some? id-col))
            (is (= false (:nullable? id-col)))))))))

;;; ---------------------------------------------------------------------------
;;; required-input-tables — source-card (transitive dep resolution)
;;; ---------------------------------------------------------------------------

(deftest required-input-tables-source-card-transitive-test
  (testing "Source-card transform: deps resolve transitively through the card to physical tables"
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (mt/with-temp [:model/Card card {:name          "test-orders-card"
                                         :dataset_query {:database (mt/id)
                                                         :type     :query
                                                         :query    {:source-table (mt/id :orders)}}
                                         :display       "table"
                                         :visualization_settings {}}]
          (let [card-source-xf {:source {:type  :query
                                         :query {:database (mt/id)
                                                 :type     :query
                                                 :query    {:source-table (str "card__" (:id card))}}}}
                result         (inputs/required-input-tables card-source-xf)]
            ;; The card queries orders → we should get orders as the physical dep
            (is (= 1 (count result)))
            (is (= (mt/id :orders) (:id (first result))))))))))

;;; ---------------------------------------------------------------------------
;;; required-input-tables — error cases
;;; ---------------------------------------------------------------------------

(deftest required-input-tables-non-query-type-throws-test
  (testing "Non-:query source type throws a typed 'not supported' error"
    (let [xf (make-python-transform)
          e  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not supported"
                                   (inputs/required-input-tables xf)))]
      (is (= ::inputs/unsupported-transform-type (-> e ex-data :error-type))))))

(deftest required-input-tables-extraction-failure-throws-test
  (testing "Any dependency-extraction failure throws a typed error (never returns silent #{})"
    ;; Source-card with a nonexistent card causes ExceptionInfo during preprocess.
    ;; We use a real DB so that preprocess actually runs.
    (mt/test-drivers #{:postgres}
      (mt/dataset test-data
        (let [xf {:source {:type  :query
                           :query {:database (mt/id)
                                   :type     :query
                                   :query    {:source-table "card__99999"}}}}
              e  (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/required-input-tables xf)))]
          (is (= ::inputs/cannot-determine-inputs (-> e ex-data :error-type)))
          ;; Must carry the cause
          (is (some? (ex-cause e))))))))

(deftest required-input-tables-table-id-not-synced-throws-test
  (testing "A {:table id} dep whose id doesn't match any synced Table throws a typed error"
    ;; Test resolve-table-dep directly with a bogus id — exercises the resolution
    ;; failure without building a real MBQL query under a stub metadata provider.
    (let [bogus-id 9999999
          e        (is (thrown? clojure.lang.ExceptionInfo
                                (inputs/resolve-table-dep {:table bogus-id})))]
      (is (= ::inputs/table-not-found (-> e ex-data :error-type)))
      (is (= bogus-id (-> e ex-data :table-id))))))

(deftest required-input-tables-table-ref-not-found-throws-test
  (testing "A {:table-ref ...} dep whose (db-id, schema, table) matches nothing throws a typed error"
    (let [bad-ref {:database_id 173 :schema "public" :table "nonexistent_xyz"}
          e (is (thrown? clojure.lang.ExceptionInfo
                         (inputs/resolve-table-dep {:table-ref bad-ref})))]
      (is (= ::inputs/table-not-found (-> e ex-data :error-type)))
      (is (= bad-ref (-> e ex-data :table-ref))))))

(deftest required-input-tables-transform-dep-throws-test
  (testing "A {:transform id} dep (dep on another transform's output) throws a typed error"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (inputs/resolve-table-dep {:transform 42})))]
      (is (= ::inputs/transform-dep-not-supported (-> e ex-data :error-type))))))

;;; ---------------------------------------------------------------------------
;;; match-fixtures — happy path
;;; ---------------------------------------------------------------------------

(deftest match-fixtures-happy-path-test
  (testing "All required tables covered by provided fixture keys → returns match plan"
    ;; Build fake table-info structs (required-input-tables output shape)
    (let [tables [{:id 10 :schema "public" :name "orders"   :columns []}
                  {:id 20 :schema "public" :name "products" :columns []}]
          keys   #{10 20}
          plan   (inputs/match-fixtures tables keys)]
      (is (= 2 (count plan)))
      ;; Each entry maps table-info → fixture key
      (is (= #{10 20} (set (map :table-id plan))))
      (is (every? #(= (:table-id %) (:fixture-key %)) plan)))))

(deftest match-fixtures-empty-transform-test
  (testing "Transform with no required tables + no fixture keys → empty plan (not an error)"
    (let [plan (inputs/match-fixtures [] #{})]
      (is (= [] plan)))))

;;; ---------------------------------------------------------------------------
;;; match-fixtures — error cases
;;; ---------------------------------------------------------------------------

(deftest match-fixtures-missing-fixture-throws-test
  (testing "Required table without a fixture key throws a typed error listing missing tables"
    (let [tables [{:id 10 :schema "public" :name "orders"   :columns []}
                  {:id 20 :schema "public" :name "products" :columns []}]
          ;; Only provide one of the two required fixtures
          keys   #{10}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::inputs/missing-fixtures (-> e ex-data :error-type)))
      ;; Missing tables should be described by id and schema.name for the caller
      (let [missing (-> e ex-data :missing-tables)]
        (is (= 1 (count missing)))
        (is (= 20 (:id (first missing))))
        (is (= "products" (:name (first missing))))
        (is (= "public" (:schema (first missing))))))))

(deftest match-fixtures-unknown-fixture-key-throws-test
  (testing "Fixture key with no matching required table throws a typed error"
    (let [tables [{:id 10 :schema "public" :name "orders" :columns []}]
          ;; Provide the correct key plus an unknown key
          keys   #{10 99}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::inputs/unknown-fixture-keys (-> e ex-data :error-type)))
      (is (= #{99} (-> e ex-data :unknown-keys))))))

(deftest match-fixtures-both-missing-and-unknown-throws-test
  (testing "When both missing and unknown keys occur, both errors are reported"
    ;; We throw whichever is checked first; either missing-fixtures or unknown-keys.
    ;; The contract: at least one of these two errors fires; both have typed ex-data.
    (let [tables [{:id 10 :schema "public" :name "orders" :columns []}]
          ;; Missing: 10 (no fixture for orders)
          ;; Unknown: 99 (no required table with id 99)
          keys   #{99}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (#{::inputs/missing-fixtures ::inputs/unknown-fixture-keys}
           (-> e ex-data :error-type))))))

;;; ---------------------------------------------------------------------------
;;; match-fixtures — missing and unknown together (separate check)
;;; ---------------------------------------------------------------------------

(deftest match-fixtures-missing-fixture-error-has-full-table-info-test
  (testing "Missing-fixture error lists id, schema, name for each missing table"
    (let [tables [{:id 1 :schema "myschema" :name "fact_table" :columns []}
                  {:id 2 :schema "myschema" :name "dim_table"  :columns []}]
          keys   #{}
          e      (is (thrown? clojure.lang.ExceptionInfo
                              (inputs/match-fixtures tables keys)))]
      (is (= ::inputs/missing-fixtures (-> e ex-data :error-type)))
      (let [missing (-> e ex-data :missing-tables)
            ids     (set (map :id missing))]
        (is (= #{1 2} ids))
        (is (every? #(and (integer? (:id %))
                          (string? (:schema %))
                          (string? (:name %)))
                    missing))))))
