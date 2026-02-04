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

(defn- mock-metric-fetcher
  "Mock metric fetcher that filters mock-metrics based on spec."
  [{id-set :id, name-set :name, :keys [table-id card-id], :as _spec}]
  (let [active-only? (not (or id-set name-set))]
    (into []
          (comp
           (if id-set
             (filter #(contains? id-set (:id %)))
             identity)
           (if name-set
             (filter #(contains? name-set (:name %)))
             identity)
           (if table-id
             (filter #(and (= (:table-id %) table-id)
                           (nil? (:source-card-id %))))
             identity)
           (if card-id
             (filter #(= (:source-card-id %) card-id))
             identity)
           (if active-only?
             (filter #(not (:archived %)))
             identity)
           (filter #(= (:type %) :metric)))
          mock-metrics)))

(defn- mock-table->db-fn [table-id]
  (get table->db-id table-id))

(defn- mock-db-provider
  "Create a mock database provider that returns tables and columns for that db."
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

(defn- mock-setting-fn [k]
  (get mock-settings k))

(defn- create-mock-provider []
  (provider/metric-context-metadata-provider
   mock-metric-fetcher
   mock-table->db-fn
   mock-db-provider
   mock-setting-fn))

;;; -------------------------------------------------- Tests --------------------------------------------------

(deftest ^:parallel database-returns-nil-test
  (testing "database() should return nil for MetricContextMetadataProvider"
    (let [mp (create-mock-provider)]
      (is (nil? (lib.metadata.protocols/database mp))))))

(deftest ^:parallel metadatas-fetches-all-active-metrics-test
  (testing "metadatas should fetch all active metrics when no filters specified"
    (let [mp (create-mock-provider)
          metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric})]
      (is (= 4 (count metrics)))
      (is (every? #(= :metric (:type %)) metrics))
      (is (not-any? :archived metrics)))))

(deftest ^:parallel metadatas-fetches-metrics-by-id-test
  (testing "metadatas should fetch metrics by ID"
    (let [mp (create-mock-provider)
          metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :id #{1 2}})]
      (is (= 2 (count metrics)))
      (is (= #{1 2} (set (map :id metrics)))))))

(deftest ^:parallel metadatas-fetches-metrics-by-table-id-test
  (testing "metadatas should fetch metrics by table-id (excludes card-based metrics)"
    (let [mp (create-mock-provider)
          metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :table-id 10})]
      (is (= 2 (count metrics)))
      (is (every? #(= 10 (:table-id %)) metrics))
      (is (every? #(nil? (:source-card-id %)) metrics)))))

(deftest ^:parallel metadatas-fetches-metrics-by-card-id-test
  (testing "metadatas should fetch metrics by card-id"
    (let [mp (create-mock-provider)
          metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :card-id 100})]
      (is (= 1 (count metrics)))
      (is (= 100 (:source-card-id (first metrics)))))))

(deftest ^:parallel metadatas-fetches-archived-metrics-when-id-specified-test
  (testing "metadatas should include archived metrics when fetching by ID"
    (let [mp (create-mock-provider)
          metrics (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :id #{4}})]
      (is (= 1 (count metrics)))
      (is (= 4 (:id (first metrics))))
      (is (:archived (first metrics))))))

(deftest ^:parallel metadatas-routes-columns-to-db-provider-test
  (testing "metadatas should route column requests to the appropriate database provider"
    (let [mp (create-mock-provider)
          columns (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column :table-id 10})]
      (is (= 2 (count columns)))
      (is (every? #(= 10 (:table-id %)) columns)))))

(deftest ^:parallel metadatas-routes-columns-returns-empty-without-table-id-test
  (testing "metadatas should return empty for columns without table-id"
    (let [mp (create-mock-provider)
          columns (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column})]
      (is (empty? columns)))))

(deftest ^:parallel metadatas-routes-tables-by-id-test
  (testing "metadatas should route table requests and group by database"
    (let [mp (create-mock-provider)
          tables (lib.metadata.protocols/metadatas mp {:lib/type :metadata/table :id #{10 20}})]
      (is (= 2 (count tables)))
      (is (= #{10 20} (set (map :id tables)))))))

(deftest ^:parallel metadatas-returns-empty-for-tables-without-ids-test
  (testing "metadatas should return empty for table requests without specific IDs"
    (let [mp (create-mock-provider)
          tables (lib.metadata.protocols/metadatas mp {:lib/type :metadata/table})]
      (is (empty? tables)))))

(deftest ^:parallel setting-returns-values-test
  (testing "setting should return setting values"
    (let [mp (create-mock-provider)]
      (is (= "Test Site" (lib.metadata.protocols/setting mp :site-name)))
      (is (= true (lib.metadata.protocols/setting mp :enable-nested-queries)))
      (is (nil? (lib.metadata.protocols/setting mp :nonexistent-setting))))))

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

;;; -------------------------------------------------- Cache Tests --------------------------------------------------

(deftest ^:parallel cached-metadatas-returns-cached-metrics-test
  (testing "cached-metadatas should return metrics from cache"
    (let [mp (create-mock-provider)
          ;; First fetch to populate cache (metadatas stores in cache internally via fetcher)
          _ (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric :id #{1}})
          ;; Store a metric manually
          _ (lib.metadata.protocols/store-metadata! mp {:id 1 :name "Cached" :lib/type :metadata/metric})
          cached (lib.metadata.protocols/cached-metadatas mp :metadata/metric [1])]
      (is (= 1 (count cached)))
      (is (= "Cached" (:name (first cached)))))))

(deftest ^:parallel has-cache?-returns-true-test
  (testing "has-cache? should return true"
    (let [mp (create-mock-provider)]
      (is (lib.metadata.protocols/has-cache? mp)))))

(deftest ^:parallel clear-cache!-clears-cache-test
  (testing "clear-cache! should clear the cache"
    (let [mp (create-mock-provider)]
      (lib.metadata.protocols/store-metadata! mp {:id 1 :name "Test" :lib/type :metadata/metric})
      (is (= 1 (count (lib.metadata.protocols/cached-metadatas mp :metadata/metric [1]))))
      (lib.metadata.protocols/clear-cache! mp)
      (is (empty? (lib.metadata.protocols/cached-metadatas mp :metadata/metric [1]))))))

(deftest ^:parallel cache-value!-and-cached-value-work-test
  (testing "cache-value! and cached-value should work for arbitrary values"
    (let [mp (create-mock-provider)]
      (lib.metadata.protocols/cache-value! mp :my-key {:some "value"})
      (is (= {:some "value"} (lib.metadata.protocols/cached-value mp :my-key :not-found)))
      (is (= :not-found (lib.metadata.protocols/cached-value mp :other-key :not-found))))))
