(ns metabase.search.appdb.metrics-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.metrics :as metrics]
   [metabase.search.appdb.table :as search.table]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest active-index-size-test
  (testing "estimated row count of the active index, for the metabase_search_appdb_index_size metric -- see #75064"
    (search.tu/with-temp-index-table
      (binding [search.ingestion/*force-sync* true]
        (mt/dataset test-data
          (mt/with-temp [:model/User       {}           (when-not (t2/exists? :model/User 1) {:id 1})
                         :model/Collection {col-id :id} {:name "Collection"}
                         :model/Card       {}           {:name "Customer Satisfaction" :collection_id col-id}
                         :model/Card       {}           {:name "Projected Revenue"     :collection_id col-id}]
            (search.engine/reindex! :search.engine/appdb {:in-place? true})
            (let [exact (t2/count (search.index/active-table))]
              (is (pos? exact))
              (if (= :postgres (mdb/db-type))
                (testing "uses the pg_class estimate (no full count(*)) after ANALYZE"
                  (t2/query (str "ANALYZE " (name (search.index/active-table))))
                  (is (= exact (#'metrics/active-index-size))))
                (testing "returns an exact count on H2"
                  (is (= exact (#'metrics/active-index-size)))))))))))
  (testing "is accurate immediately after a fresh index table is rotated in (no waiting for autoanalyze) -- see #75064"
    ;; A full (background) reindex builds a fresh pending table, ANALYZEs it, then rotates it in. Rotation only
    ;; happens against the real state store, so use a throwaway index version rather than with-temp-index-table.
    (binding [search.spec/*testing-only-index-version-hash* "metrics-rotation-test"
              search.ingestion/*force-sync*                 true]
      (try
        (mt/dataset test-data
          (mt/with-temp [:model/User       {}           (when-not (t2/exists? :model/User 1) {:id 1})
                         :model/Collection {col-id :id} {:name "Collection"}
                         :model/Card       {}           {:name "Quarterly Forecast" :collection_id col-id}]
            (search.engine/reset-tracking! :search.engine/appdb)
            (search.engine/reindex! :search.engine/appdb {})
            (let [exact (t2/count (search.index/active-table))]
              (is (pos? exact))
              (is (= exact (#'metrics/active-index-size))))))
        (finally
          (search.engine/reset-tracking! :search.engine/appdb)
          (t2/delete! :model/SearchIndexMetadata :version "metrics-rotation-test")
          (#'search.table/delete-obsolete-tables!)))))
  (testing "returns nil when this instance has no active index to serve from"
    (search.tu/with-temp-index-table
      (index-state/set-state! search.index/*state-store* {:active nil :pending nil})
      (is (nil? (#'metrics/active-index-size))))))
