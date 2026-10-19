(ns metabase-enterprise.remote-sync.stats-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.stats :as stats]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-remote-sync
  [& body]
  `(mt/with-empty-h2-app-db!
     (mt/with-premium-features #{:remote-sync :transforms-basic}
       (mt/with-temporary-setting-values [remote-sync-url        "file:///tmp/remote-sync-repo"
                                          remote-sync-transforms true]
         ~@body))))

(deftest card-counts-test
  (with-remote-sync
    (mt/with-temp [:model/Collection {synced-id :id}   {:is_remote_synced true}
                   :model/Collection {child-id :id}    {:is_remote_synced true :location (str "/" synced-id "/")}
                   :model/Collection {archived-id :id} {:is_remote_synced true :archived true}
                   :model/Collection {local-id :id}    {}
                   :model/Card       {source-id :id}   {:collection_id local-id :type :model}
                   :model/Card       _                 {:collection_id synced-id :type :question
                                                        :dataset_query (let [mp (mt/metadata-provider)]
                                                                         (lib/query mp (lib.metadata/card mp source-id)))}
                   :model/Card       _                 {:collection_id child-id :type :metric}
                   :model/Card       _                 {:collection_id synced-id :type :model :archived true}
                   :model/Card       _                 {:collection_id archived-id :type :model}
                   :model/Card       _                 {:collection_id local-id :type :question}]
      (testing "cards in synced collections and their local sources count, archived ones do not"
        (is (=? {:remote-sync-card-count     3
                 :remote-sync-model-count    1
                 :remote-sync-question-count 1
                 :remote-sync-metric-count   1
                 :remote-sync-content-count  3}
                (stats/remote-sync-stats)))))))

(deftest table-content-counts-test
  (with-remote-sync
    (mt/with-temp [:model/Collection {coll-id :id}        {:is_remote_synced true :type "library-data"}
                   :model/Database   {db-id :id}          {}
                   :model/Table      {published-id :id}   {:db_id db-id :is_published true :collection_id coll-id}
                   :model/Table      {unpublished-id :id} {:db_id db-id :is_published false :collection_id coll-id}
                   :model/Measure    _                    {:table_id published-id}
                   :model/Measure    _                    {:table_id published-id :archived true}
                   :model/Measure    _                    {:table_id unpublished-id}
                   :model/Segment    _                    {:table_id published-id}
                   :model/Segment    _                    {:table_id unpublished-id}]
      (is (=? {:remote-sync-table-count   1
               :remote-sync-measure-count 1
               :remote-sync-segment-count 1
               :remote-sync-content-count 3}
              (stats/remote-sync-stats))))))

(deftest transform-counts-test
  (with-remote-sync
    (mt/with-temp [:model/Collection {folder-id :id}   {:namespace collection/transforms-ns}
                   :model/Collection {archived-id :id} {:namespace collection/transforms-ns :archived true}
                   :model/Transform  _                 {}
                   :model/Transform  _                 {:collection_id folder-id}
                   :model/Transform  _                 {:collection_id archived-id}]
      (testing "transforms in archived folders do not count"
        (is (=? {:remote-sync-transform-count 2}
                (stats/remote-sync-stats))))
      (testing "transforms do not count when transform sync is off"
        (mt/with-temporary-setting-values [remote-sync-transforms false]
          (is (=? {:remote-sync-transform-count 0}
                  (stats/remote-sync-stats))))))))

(deftest disabled-sync-test
  (mt/with-empty-h2-app-db!
    (mt/with-temp [:model/Collection {id :id} {:is_remote_synced true}
                   :model/Card       _        {:collection_id id}]
      (testing "leftover sync flags do not count when Git sync is not configured"
        (mt/with-premium-features #{:remote-sync}
          (is (= {} (stats/remote-sync-stats)))))
      (testing "nothing counts when the token lacks Git sync"
        (mt/with-premium-features #{}
          (mt/with-temporary-setting-values [remote-sync-url "file:///tmp/remote-sync-repo"]
            (is (= {} (stats/remote-sync-stats)))))))))
