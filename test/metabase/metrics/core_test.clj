(ns metabase.metrics.core-test
  "Tests for metrics.core dimension sync functionality."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helper Functions ------------------------------------------------

(defn- metric-query
  "Create a metric-style dataset query (a query with a single aggregation)."
  []
  (let [mp (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (mt/id :venues))]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

(defn- measure-definition
  "Create an MBQL5 measure definition with the given aggregation clause.
   Uses lib/aggregate to create a proper MBQL5 query."
  [aggregation-clause]
  (let [mp (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (mt/id :venues))]
    (-> (lib/query mp table-metadata)
        (lib/aggregate aggregation-clause))))

;;; ------------------------------------------------ Metric Dimension Sync Tests ------------------------------------------------

(deftest metric-sync-dimensions-basic-test
  (testing "sync-dimensions! computes and persists dimensions from visible columns for metrics"
    (mt/with-temp [:model/Card metric {:name "Test Metric"
                                       :type :metric
                                       :database_id (mt/id)
                                       :table_id (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [reloaded (t2/select-one :model/Card :id (:id metric))]
        (is (some? (:dimensions reloaded))
            "Should have dimensions populated")
        (is (some? (:dimension_mappings reloaded))
            "Should have dimension-mappings populated")
        ;; Venues table has ID, NAME, CATEGORY_ID, LATITUDE, LONGITUDE, PRICE columns
        (is (>= (count (:dimensions reloaded)) 1)
            "Should have at least one dimension from the venues table")
        (is (= (count (:dimensions reloaded)) (count (:dimension_mappings reloaded)))
            "Should have same number of dimensions and mappings")))))

(deftest metric-sync-dimensions-persists-on-first-read-test
  (testing "sync-dimensions! persists dimensions and mappings to database on first call for metrics"
    (mt/with-temp [:model/Card metric {:name "Test Metric"
                                       :type :metric
                                       :database_id (mt/id)
                                       :table_id (mt/id :venues)
                                       :dataset_query (metric-query)}]
      ;; Initially, dimensions should be nil in the database
      (is (nil? (:dimensions (t2/select-one :model/Card :id (:id metric))))
          "Dimensions should be nil before sync")
      ;; Sync dimensions
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      ;; Now check that dimensions were persisted
      (let [reloaded (t2/select-one :model/Card :id (:id metric))]
        (is (some? (:dimensions reloaded))
            "Dimensions should be persisted to database")
        (is (some? (:dimension_mappings reloaded))
            "Dimension mappings should be persisted to database")))))

(deftest metric-sync-dimensions-picks-default-test
  (testing "new metrics persist the preferred seeded dimension as default (UXW-4788)"
    (let [mp (mt/metadata-provider)
          orders-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                         :type          :metric
                                         :database_id   (mt/id)
                                         :table_id      (mt/id :orders)
                                         :dataset_query orders-query}]
        (metrics/sync-dimensions! :metadata/metric (:id metric))
        (let [defaults (filter :default
                               (:dimensions (t2/select-one :model/Card :id (:id metric))))]
          (is (= ["CREATED_AT"] (mapv :name defaults))))))))

(deftest metric-sync-dimensions-preserves-user-modifications-test
  (testing "sync-dimensions! preserves user modifications like display-name for metrics"
    (mt/with-temp [:model/Card metric {:name "Test Metric"
                                       :type :metric
                                       :database_id (mt/id)
                                       :table_id (mt/id :venues)
                                       :dataset_query (metric-query)}]
      ;; First sync to get dimensions
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [first-dim (first (:dimensions (t2/select-one :model/Card :id (:id metric))))
            dim-id (:id first-dim)]
        ;; Manually update the dimension to have a custom display name
        (t2/update! :model/Card (:id metric)
                    {:dimensions [{:id dim-id
                                   :name (:name first-dim)
                                   :display-name "My Custom Metric Dimension"
                                   :status :status/active}]})
        ;; Sync again
        (metrics/sync-dimensions! :metadata/metric (:id metric))
        (let [reloaded (t2/select-one :model/Card :id (:id metric))
              matching-dim (first (filter #(= dim-id (:id %)) (:dimensions reloaded)))]
          (is (= "My Custom Metric Dimension" (:display-name matching-dim))
              "User's custom display-name should be preserved"))))))

(deftest metric-sync-dimensions-no-op-without-query-test
  (testing "sync-dimensions! is a no-op when dataset_query is empty for metrics"
    (mt/with-temp [:model/Card metric {:name "Test Metric"
                                       :type :metric
                                       :database_id (mt/id)
                                       :table_id (mt/id :venues)
                                       :dataset_query (metric-query)}]
      ;; Set dataset_query to empty - metrics can't have nil queries, so use empty
      (t2/update! :model/Card (:id metric) {:dataset_query {}})
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [reloaded (t2/select-one :model/Card :id (:id metric))]
        ;; Should remain unchanged (without :dimensions or :dimension_mappings added)
        (is (nil? (:dimensions reloaded))
            "Dimensions should remain nil when query is empty")
        (is (nil? (:dimension_mappings reloaded))
            "Dimension mappings should remain nil when query is empty")))))

(deftest metric-sync-dimensions-does-not-re-add-removed-test
  (testing "sync-dimensions! does not re-add a user-removed dimension on subsequent syncs"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [{:keys [dimensions dimension_mappings]} (t2/select-one :model/Card :id (:id metric))
            removed-id    (:id (first dimensions))
            kept          (rest dimensions)
            kept-ids      (into #{} (map :id) kept)
            kept-mappings (filter (comp kept-ids :dimension-id)
                                  dimension_mappings)]
        (is (>= (count dimensions) 2)
            "Venues should yield multiple dimensions to curate")
        ;; Simulate the user removing the first dimension (and its mapping).
        (t2/update! :model/Card (:id metric)
                    {:dimensions         kept
                     :dimension_mappings kept-mappings})
        (metrics/sync-dimensions! :metadata/metric (:id metric))
        (let [reloaded-ids (into #{} (map :id)
                                 (t2/select-one-fn :dimensions :model/Card :id (:id metric)))]
          (is (not (contains? reloaded-ids removed-id))
              "Removed dimension must not reappear")
          (is (= kept-ids reloaded-ids)
              "Only the curated dimensions remain"))))))

(deftest metric-sync-dimensions-does-not-reseed-when-emptied-test
  (testing "sync-dimensions! does not regenerate dimensions after the user removes them all"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      ;; User removes every dimension; the empty `:dimensions` is authoritative, not "uninitialized".
      (t2/update! :model/Card (:id metric) {:dimensions         []
                                            :dimension_mappings []})
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (is (zero? (count (t2/select-one-fn :dimensions :model/Card :id (:id metric))))
          "Emptied dimensions must not be re-seeded"))))

(deftest metric-sync-dimensions-orphans-deleted-column-test
  (testing "sync-dimensions! marks a dimension whose underlying column no longer exists as orphaned"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :database_id   (mt/id)
                                       :table_id      (mt/id :venues)
                                       :dataset_query (metric-query)}]
      (metrics/sync-dimensions! :metadata/metric (:id metric))
      (let [{:keys [dimensions dimension_mappings]} (t2/select-one :model/Card :id (:id metric))
            dim     (first dimensions)
            mapping (m/find-first #(= (:id dim) (:dimension-id %))
                                  dimension_mappings)
            ;; Repoint this dimension at a column the venues query can't see (users.name is not
            ;; reachable from venues), simulating a deleted column — keeping the rest of the
            ;; field ref (incl. :lib/uuid) intact.
            orphan-mapping (assoc-in mapping [:target 2] (mt/id :users :name))]
        (t2/update! :model/Card (:id metric)
                    {:dimensions         [dim]
                     :dimension_mappings [orphan-mapping]})
        (metrics/sync-dimensions! :metadata/metric (:id metric))
        (let [reloaded (first (t2/select-one-fn :dimensions :model/Card :id (:id metric)))]
          (is (= :status/orphaned (:status reloaded))
              "A dimension with a missing column should be orphaned")
          (is (some? (:status-message reloaded))
              "Orphaned dimension should carry a status message"))))))

;;; ------------------------------------------------ Measure Dimension Sync Tests ------------------------------------------------

(deftest measure-sync-dimensions-basic-test
  (testing "sync-dimensions! computes and persists dimensions from visible columns"
    (mt/with-temp [:model/Measure measure {:name "Test Measure"
                                           :table_id (mt/id :venues)
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      (metrics/sync-dimensions! :metadata/measure (:id measure))
      (let [reloaded (t2/select-one :model/Measure :id (:id measure))]
        (is (some? (:dimensions reloaded))
            "Should have dimensions populated")
        (is (some? (:dimension_mappings reloaded))
            "Should have dimension-mappings populated")
        ;; Venues table has ID, NAME, CATEGORY_ID, LATITUDE, LONGITUDE, PRICE columns
        (is (>= (count (:dimensions reloaded)) 1)
            "Should have at least one dimension from the venues table")
        (is (= (count (:dimensions reloaded)) (count (:dimension_mappings reloaded)))
            "Should have same number of dimensions and mappings")))))

(deftest measure-sync-dimensions-persists-on-first-read-test
  (testing "sync-dimensions! persists dimensions and mappings to database on first call"
    (mt/with-temp [:model/Measure measure {:name "Test Measure"
                                           :table_id (mt/id :venues)
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      ;; Initially, dimensions should be nil in the database
      (is (nil? (:dimensions (t2/select-one :model/Measure :id (:id measure))))
          "Dimensions should be nil before sync")
      ;; Sync dimensions
      (metrics/sync-dimensions! :metadata/measure (:id measure))
      ;; Now check that dimensions were persisted
      (let [reloaded (t2/select-one :model/Measure :id (:id measure))]
        (is (some? (:dimensions reloaded))
            "Dimensions should be persisted to database")
        (is (some? (:dimension_mappings reloaded))
            "Dimension mappings should be persisted to database")))))

(deftest measure-sync-dimensions-preserves-user-modifications-test
  (testing "sync-dimensions! preserves user modifications like display-name"
    (mt/with-temp [:model/Measure measure {:name "Test Measure"
                                           :table_id (mt/id :venues)
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      ;; First sync to get dimensions
      (metrics/sync-dimensions! :metadata/measure (:id measure))
      (let [first-dim (first (:dimensions (t2/select-one :model/Measure :id (:id measure))))
            dim-id (:id first-dim)]
        ;; Manually update the dimension to have a custom display name
        (t2/update! :model/Measure (:id measure)
                    {:dimensions [{:id dim-id
                                   :name (:name first-dim)
                                   :display-name "My Custom Name"
                                   :status :status/active}]})
        ;; Sync again
        (metrics/sync-dimensions! :metadata/measure (:id measure))
        (let [reloaded (t2/select-one :model/Measure :id (:id measure))
              matching-dim (first (filter #(= dim-id (:id %)) (:dimensions reloaded)))]
          (is (= "My Custom Name" (:display-name matching-dim))
              "User's custom display-name should be preserved"))))))

(deftest measure-sync-dimensions-fully-resyncs-test
  (testing "measures fully re-sync on every load: columns missing from storage are re-added, and the
            UUIDs of dimensions that still existed are preserved (measures have no curation)"
    (mt/with-temp [:model/Measure measure {:name       "Test Measure"
                                           :table_id   (mt/id :venues)
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      (metrics/sync-dimensions! :metadata/measure (:id measure))
      (let [{:keys [dimensions dimension_mappings]} (t2/select-one :model/Measure :id (:id measure))
            kept          (rest dimensions)
            kept-ids      (into #{} (map :id) kept)
            kept-mappings (filter (comp kept-ids :dimension-id)
                                  dimension_mappings)]
        (is (>= (count dimensions) 2)
            "Venues should yield multiple dimensions")
        ;; Drop one dimension from storage; a full re-sync should bring it back.
        (t2/update! :model/Measure (:id measure)
                    {:dimensions         kept
                     :dimension_mappings kept-mappings})
        (metrics/sync-dimensions! :metadata/measure (:id measure))
        (let [reloaded-ids (into #{} (map :id) (t2/select-one-fn :dimensions :model/Measure :id (:id measure)))]
          (is (= (count dimensions) (count reloaded-ids))
              "the column dropped from storage is re-added by the full sync")
          (is (every? reloaded-ids kept-ids)
              "UUIDs of dimensions that still existed are preserved"))))))

;; Note: There's no test for "no-op without definition" for measures
;; because measures have a NOT NULL constraint on the definition column - they must always have a definition.
