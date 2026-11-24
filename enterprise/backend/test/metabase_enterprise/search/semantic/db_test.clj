(ns metabase-enterprise.search.semantic.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.search.semantic.db :as semantic.db]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest collection-dashboards-over-partitions-test
  (mt/with-temp [:model/Collection {c1 :id} {}
                 :model/Collection {c2 :id} {}
                 :model/Collection {c3 :id} {}
                 :model/Dashboard {d1 :id} {:collection_id c1}
                 :model/Dashboard {d2 :id} {:collection_id c2}
                 :model/Dashboard {d3 :id} {:collection_id c3}]
    (let [collection-ids [c1 c2 c3]
          read-all       (fn []
                           {:dashboards (into #{} (map :id) (semantic.db/unarchived-dashboard-ids-in-collections-reducible collection-ids))
                            :locations  (set (map :id (semantic.db/collection-owners-and-locations (set collection-ids))))})]
      (is (= {:dashboards #{d1 d2 d3}, :locations (set collection-ids)} (read-all)))
      (with-redefs [mdb.query/select-partition-size 2
                    mdb/select-partition-size       2]
        (is (= {:dashboards #{d1 d2 d3}, :locations (set collection-ids)} (read-all)))))))
