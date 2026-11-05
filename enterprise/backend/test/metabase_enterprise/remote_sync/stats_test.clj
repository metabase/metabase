(ns metabase-enterprise.remote-sync.stats-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.stats :as stats]
   [metabase.analytics.stats :as analytics.stats]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.remote-sync.test-util :as remote-sync.tu]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(use-fixtures :each remote-sync.tu/allow-remote-synced-collections)

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
                   :model/Card       _                 {:collection_id synced-id :type :question}
                   :model/Card       _                 {:collection_id child-id :type :metric}
                   :model/Card       _                 {:collection_id synced-id :type :model :archived true}
                   :model/Card       _                 {:collection_id archived-id :type :model}
                   :model/Card       _                 {:collection_id local-id :type :question}]
      (is (=? {:remote-sync-card-count     4
               :remote-sync-model-count    1
               :remote-sync-question-count 2
               :remote-sync-metric-count   1}
              (stats/remote-sync-stats))))))

(deftest table-counts-test
  (with-remote-sync
    (mt/with-temp [:model/Collection        {coll-id :id}        {:is_remote_synced true :type "library-data"}
                   :model/Database          {db-id :id}          {}
                   :model/Table             {published-id :id}   {:db_id db-id :is_published true :collection_id coll-id}
                   :model/Table             {unpublished-id :id} {:db_id db-id :is_published false :collection_id coll-id}
                   :model/Field             {field-id :id}       {:table_id published-id}
                   :model/Field             {other-id :id}       {:table_id published-id}
                   :model/TableUserSettings _                    {:table_id published-id :display_name "Renamed"}
                   :model/TableUserSettings _                    {:table_id unpublished-id :display_name "Renamed"}
                   :model/FieldUserSettings _                    {:field_id field-id :description "Curated" :description_set true}
                   :model/Dimension         _                    {:field_id other-id :name "Other" :type :internal}
                   :model/Measure           _                    {:table_id published-id}
                   :model/Measure           _                    {:table_id published-id :archived true}
                   :model/Measure           _                    {:table_id unpublished-id}
                   :model/Segment           _                    {:table_id published-id}
                   :model/Segment           _                    {:table_id unpublished-id}]
      (is (=? {:remote-sync-table-user-settings-count 1
               :remote-sync-field-user-settings-count 1
               :remote-sync-dimension-count           1
               :remote-sync-measure-count             1
               :remote-sync-segment-count             1}
              (stats/remote-sync-stats))))))

(deftest content-counts-test
  (with-remote-sync
    (mt/with-temp [:model/Collection         _        {:type "library" :is_remote_synced true}
                   :model/Collection         {id :id} {:is_remote_synced true}
                   :model/Dashboard          _        {:collection_id id}
                   :model/Document           _        {:collection_id id}
                   :model/Timeline           _        {:collection_id id}
                   :model/Action             _        {:type :query :name "Library action" :model_id nil}
                   :model/NativeQuerySnippet _        {}
                   :model/Glossary           _        {:term "Term" :definition "A definition"}
                   :model/DataApp            _        {:name "app" :display_name "App" :bundle_path "app.js"}]
      (is (=? {:remote-sync-action-count         1
               :remote-sync-dashboard-count      1
               :remote-sync-data-app-count       1
               :remote-sync-document-count       1
               :remote-sync-glossary-entry-count 1
               :remote-sync-snippet-count        1
               :remote-sync-timeline-count       1}
              (stats/remote-sync-stats))))))

(deftest content-total-test
  (with-remote-sync
    (mt/with-temp [:model/Collection {id :id} {:is_remote_synced true}
                   :model/Dashboard  _        {:collection_id id}]
      (is (=? {:remote-sync-content-count 2}
              (stats/remote-sync-stats))))))

(deftest transform-counts-test
  (with-remote-sync
    (mt/with-temp [:model/Collection {folder-id :id}   {:namespace collection/transforms-ns}
                   :model/Collection {archived-id :id} {:namespace collection/transforms-ns :archived true}
                   :model/Transform  _                 {}
                   :model/Transform  _                 {:collection_id folder-id}
                   :model/Transform  _                 {:collection_id archived-id}]
      (is (=? {:remote-sync-transform-count 2}
              (stats/remote-sync-stats))))))

(deftest disabled-sync-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temp [:model/Collection {id :id} {:is_remote_synced true}
                     :model/Card       _        {:collection_id id}]
        (is (= {} (stats/remote-sync-stats)))))))

(deftest missing-feature-test
  (mt/with-empty-h2-app-db!
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [remote-sync-url "file:///tmp/remote-sync-repo"]
        (mt/with-temp [:model/Collection {id :id} {:is_remote_synced true}
                       :model/Card       _        {:collection_id id}]
          (is (= {} (stats/remote-sync-stats))))))))

(deftest snowplow-metrics-test
  (with-remote-sync
    (is (= (set (map (comp name u/->snake_case_en) (keys (stats/remote-sync-stats))))
           (into #{}
                 (comp (map #(get % "name")) (filter #(str/starts-with? % "remote_sync_")))
                 (get (#'analytics.stats/snowplow-anonymous-usage-stats (analytics.stats/legacy-anonymous-usage-stats))
                      "metrics"))))))
