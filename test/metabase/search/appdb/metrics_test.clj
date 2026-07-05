(ns metabase.search.appdb.metrics-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.index-state :as index-state]
   [metabase.search.appdb.metrics :as metrics]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;; ^:synchronized: the rotation block drives a real reindex (taking the global cluster reindex-lock and sweeping
;; obsolete physical tables), so it stays serialized with other tests that touch the shared search index. The
;; rotation itself runs against an *isolated* state store (with-temp-real-index), so it never mutates the global
;; tracking state.
(deftest ^:synchronized active-index-size-test
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
    ;; happens against a real (db-backed) state store, so we can't use with-temp-index-table (mock store).
    ;; with-temp-real-index gives a real but *isolated* store, so the rotation never touches the shared global
    ;; state (which would leak our throwaway table into other parallel tests -- see its docstring).
    (search.tu/with-temp-real-index "metrics-rotation-test"
      (binding [search.ingestion/*force-sync* true]
        (mt/dataset test-data
          (mt/with-temp [:model/User       {}           (when-not (t2/exists? :model/User 1) {:id 1})
                         :model/Collection {col-id :id} {:name "Collection"}
                         :model/Card       {}           {:name "Quarterly Forecast" :collection_id col-id}]
            (search.engine/reindex! :search.engine/appdb {})
            (let [exact (t2/count (search.index/active-table))]
              (is (pos? exact))
              (is (= exact (#'metrics/active-index-size)))))))))
  (testing "returns nil when this instance has no active index to serve from"
    (search.tu/with-temp-index-table
      (index-state/set-state! search.index/*state-store* {:active nil :pending nil})
      (is (nil? (#'metrics/active-index-size))))))
