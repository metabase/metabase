(ns metabase.lib-metric.metadata.provider-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.metadata.provider :as provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

;;; -------------------------------------------------- Mock Data --------------------------------------------------

(def ^:private mock-metrics
  [{:id 1 :name "Revenue" :table-id 10 :type :metric :archived false :lib/type :metadata/metric}
   {:id 2 :name "Orders" :table-id 10 :type :metric :archived false :lib/type :metadata/metric}
   {:id 3 :name "Users" :table-id 20 :type :metric :archived false :lib/type :metadata/metric}
   {:id 4 :name "Archived Metric" :table-id 10 :type :metric :archived true :lib/type :metadata/metric}
   {:id 5 :name "Card Metric" :table-id nil :source-card-id 100 :type :metric :archived false :lib/type :metadata/metric}])

(def ^:private mock-measures
  [{:id 10 :name "Rev Measure" :table-id 10 :lib/type :metadata/measure}
   {:id 20 :name "User Measure" :table-id 20 :lib/type :metadata/measure}])

(def ^:private mock-dimensions
  [{:id "dim-1" :name "Category" :metric-id 1 :measure-id nil :table-id 10 :lib/type :metadata/dimension}
   {:id "dim-2" :name "Created At" :metric-id 1 :measure-id nil :table-id 10 :lib/type :metadata/dimension}
   {:id "dim-3" :name "Amount" :metric-id nil :measure-id 10 :table-id 10 :lib/type :metadata/dimension}])

(def ^:private mock-tables
  {10 {:id 10 :name "orders" :db-id 1 :lib/type :metadata/table}
   20 {:id 20 :name "users" :db-id 2 :lib/type :metadata/table}
   30 {:id 30 :name "products" :db-id 1 :lib/type :metadata/table}})

(def ^:private mock-columns
  {10 [{:id 100 :name "id" :table-id 10 :lib/type :metadata/column}
       {:id 101 :name "amount" :table-id 10 :lib/type :metadata/column}]
   20 [{:id 200 :name "id" :table-id 20 :lib/type :metadata/column}
       {:id 201 :name "email" :table-id 20 :lib/type :metadata/column}]})

(def ^:private table->db-id
  {10 1
   20 2
   30 1})

(def ^:private mock-settings
  {:site-name "Test Site"
   :enable-nested-queries true})

;;; -------------------------------------------------- Mock Provider --------------------------------------------------

(defn- mock-metric-fn [metric-id]
  (some #(when (= (:id %) metric-id) %) mock-metrics))

(defn- mock-measure-fn [measure-id]
  (some #(when (= (:id %) measure-id) %) mock-measures))

(defn- mock-dimension-fn [dimension-uuid]
  (some #(when (= (:id %) dimension-uuid) %) mock-dimensions))

(defn- mock-dims-for-metric-fn [metric-id]
  (filterv #(= (:metric-id %) metric-id) mock-dimensions))

(defn- mock-dims-for-measure-fn [measure-id]
  (filterv #(= (:measure-id %) measure-id) mock-dimensions))

(defn- mock-dims-for-table-fn [table-id]
  (filterv #(= (:table-id %) table-id) mock-dimensions))

(defn- mock-cols-for-table-fn [table-id]
  (get mock-columns table-id []))

(defn- mock-table-fn [table-id]
  (get mock-tables table-id))

(defn- mock-setting-fn [k]
  (get mock-settings k))

(defn- mock-db-provider
  "Create a mock database provider."
  [db-id]
  (reify lib.metadata.protocols/MetadataProvider
    (database [_this]
      {:id db-id :name (str "DB-" db-id) :lib/type :metadata/database})
    (metadatas [_this {metadata-type :lib/type, id-set :id, :keys [table-id], :as _spec}]
      (case metadata-type
        :metadata/table
        (if id-set
          (into []
                (filter #(and (contains? id-set (:id %))
                              (= (:db-id %) db-id)))
                (vals mock-tables))
          (into []
                (filter #(= (:db-id %) db-id))
                (vals mock-tables)))
        :metadata/column
        (when table-id
          (get mock-columns table-id []))
        []))
    (setting [_this k]
      (get mock-settings k))))

(defn- mock-db-provider-for-table [table-id]
  (when-let [db-id (get table->db-id table-id)]
    (mock-db-provider db-id)))

(defn- create-mock-provider []
  (provider/metric-context-metadata-provider
   {:metric-fn           mock-metric-fn
    :measure-fn          mock-measure-fn
    :dimension-fn        mock-dimension-fn
    :dims-for-metric-fn  mock-dims-for-metric-fn
    :dims-for-measure-fn mock-dims-for-measure-fn
    :dims-for-table-fn   mock-dims-for-table-fn
    :cols-for-table-fn   mock-cols-for-table-fn
    :col-fn              (fn [table-id field-id]
                           (some #(when (= (:id %) field-id) %)
                                 (mock-cols-for-table-fn table-id)))
    :table-fn            mock-table-fn
    :setting-fn          mock-setting-fn
    :db-provider-fn      mock-db-provider-for-table}))

;;; -------------------------------------------------- Tests --------------------------------------------------

(deftest ^:parallel metric-fetch-test
  (testing "metric fetches by ID"
    (let [mp (create-mock-provider)]
      (is (= "Revenue" (:name (provider/metric mp 1))))
      (is (nil? (provider/metric mp 999))))))

(deftest ^:parallel measure-fetch-test
  (testing "measure fetches by ID"
    (let [mp (create-mock-provider)]
      (is (= "Rev Measure" (:name (provider/measure mp 10))))
      (is (nil? (provider/measure mp 999))))))

(deftest ^:parallel dimension-fetch-test
  (testing "dimension fetches by UUID"
    (let [mp (create-mock-provider)]
      (is (= "Category" (:name (provider/dimension mp "dim-1"))))
      (is (nil? (provider/dimension mp "dim-nonexistent"))))))

(deftest ^:parallel dimensions-for-metric-test
  (testing "dimensions-for-metric returns dims for a given metric"
    (let [mp (create-mock-provider)]
      (is (= 2 (count (provider/dimensions-for-metric mp 1))))
      (is (= 0 (count (provider/dimensions-for-metric mp 999)))))))

(deftest ^:parallel dimensions-for-measure-test
  (testing "dimensions-for-measure returns dims for a given measure"
    (let [mp (create-mock-provider)]
      (is (= 1 (count (provider/dimensions-for-measure mp 10))))
      (is (= 0 (count (provider/dimensions-for-measure mp 999)))))))

(deftest ^:parallel dimensions-for-table-test
  (testing "dimensions-for-table returns all dims mapped to a table"
    (let [mp (create-mock-provider)]
      (is (= 3 (count (provider/dimensions-for-table mp 10))))
      (is (= 0 (count (provider/dimensions-for-table mp 999)))))))

(deftest ^:parallel columns-for-table-test
  (testing "columns-for-table routes to appropriate columns"
    (let [mp (create-mock-provider)
          columns (provider/columns-for-table mp 10)]
      (is (= 2 (count columns)))
      (is (every? #(= 10 (:table-id %)) columns)))))

(deftest ^:parallel column-test
  (testing "column returns a single column by table-id and field-id"
    (let [mp (create-mock-provider)]
      (is (= "amount" (:name (provider/column mp 10 101))))
      (is (nil? (provider/column mp 10 999)))
      (is (nil? (provider/column mp 999 101))))))

(deftest ^:parallel metric-table-test
  (testing "metric-table returns table metadata"
    (let [mp (create-mock-provider)]
      (is (= "orders" (:name (provider/metric-table mp 10))))
      (is (nil? (provider/metric-table mp 999))))))

(deftest ^:parallel setting-returns-values-test
  (testing "metric-setting returns setting values"
    (let [mp (create-mock-provider)]
      (is (= "Test Site" (provider/metric-setting mp :site-name)))
      (is (true? (provider/metric-setting mp :enable-nested-queries)))
      (is (nil? (provider/metric-setting mp :nonexistent-setting))))))

(deftest ^:parallel database-provider-for-table-returns-provider-test
  (testing "database-provider-for-table should return the database provider for a table"
    (let [mp (create-mock-provider)
          db-provider (provider/database-provider-for-table mp 10)]
      (is (some? db-provider))
      (is (= 1 (:id (lib.metadata.protocols/database db-provider)))))))

(deftest ^:parallel database-provider-for-table-returns-nil-for-unknown-test
  (testing "database-provider-for-table should return nil for unknown table"
    (let [mp (create-mock-provider)]
      (is (nil? (provider/database-provider-for-table mp 999))))))

(deftest ^:parallel metric-metadata-provider?-test
  (testing "metric-metadata-provider? returns true for our provider"
    (let [mp (create-mock-provider)]
      (is (provider/metric-metadata-provider? mp))))
  (testing "metric-metadata-provider? returns false for other things"
    (is (not (provider/metric-metadata-provider? {})))
    (is (not (provider/metric-metadata-provider? nil)))))
