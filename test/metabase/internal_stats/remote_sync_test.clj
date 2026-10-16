(ns metabase.internal-stats.remote-sync-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.internal-stats.remote-sync :as remote-sync]
   [metabase.test :as mt]
   [metabase.util :as u]))

(use-fixtures :each
  (fn [f]
    (mt/with-dynamic-fn-redefs [remote-sync/remote-sync-configuration (constantly {:enabled? true :transforms? false})]
      (f))))

(deftest remote-sync-stats-test
  (mt/with-temp [:model/Collection {synced-id :id} {:is_remote_synced true}
                 :model/Collection {child-id :id} {:location (str "/" synced-id "/") :is_remote_synced true}
                 :model/Collection {local-id :id} {}
                 :model/Collection {archived-id :id} {:is_remote_synced true :archived true}
                 :model/Collection {metrics-id :id} {:is_remote_synced true :type "library-metrics"}
                 :model/Collection {metrics-child-id :id} {:location (str "/" metrics-id "/")
                                                           :is_remote_synced true :type "library-metrics"}
                 :model/Dashboard {dashboard-id :id} {:collection_id synced-id}]
    (let [before (remote-sync/remote-sync-stats)]
      (mt/with-temp [:model/Card _ {:collection_id synced-id :type :model}
                     :model/Card _ {:collection_id child-id :type :model}
                     :model/Card _ {:collection_id synced-id :type :question}
                     :model/Card _ {:collection_id synced-id :type :metric}
                     :model/Card _ {:collection_id child-id :type :metric}
                     :model/Card _ {:collection_id metrics-id :type :metric}
                     :model/Card _ {:collection_id metrics-child-id :type :metric}
                     :model/Card _ {:collection_id synced-id :type :question :dashboard_id dashboard-id}
                     :model/Card _ {:collection_id synced-id :type :model :archived true}
                     :model/Card _ {:collection_id synced-id :type :question :archived true}
                     :model/Card _ {:collection_id synced-id :type :metric :archived true}
                     :model/Card _ {:collection_id archived-id :type :model}
                     :model/Card _ {:collection_id local-id :type :model}
                     :model/Card _ {:collection_id local-id :type :question}
                     :model/Card _ {:collection_id local-id :type :metric}
                     :model/Card _ {:collection_id nil :type :question}]
        (testing "counts active synced content, including descendants and content with no sync ledger entry"
          (is (= {:remote-sync-card-count    8
                  :remote-sync-model-count   2
                  :remote-sync-question-count 2
                  :remote-sync-metric-count  4
                  :remote-sync-content-count 8}
                 (select-keys (merge-with - (remote-sync/remote-sync-stats) before)
                              [:remote-sync-card-count :remote-sync-model-count :remote-sync-question-count
                               :remote-sync-metric-count :remote-sync-content-count]))))))))

(deftest collection-content-counts-test
  (mt/with-temp [:model/Collection {synced-id :id} {:is_remote_synced true}
                 :model/Collection {local-id :id} {}
                 :model/Collection {app-id :id} {:namespace "data-apps"}]
    (let [before (remote-sync/remote-sync-stats)]
      (mt/with-temp [:model/Dashboard _ {:collection_id synced-id}
                     :model/Dashboard _ {:collection_id synced-id :archived true}
                     :model/Dashboard _ {:collection_id local-id}
                     :model/Document _ {:collection_id synced-id}
                     :model/Document _ {:collection_id synced-id :archived true}
                     :model/Document _ {:collection_id local-id}
                     :model/Timeline _ {:collection_id synced-id}
                     :model/Timeline _ {:collection_id local-id}
                     :model/Card _ {:collection_id app-id :type :question}]
        (is (= {:remote-sync-dashboard-count 1
                :remote-sync-document-count 1
                :remote-sync-timeline-count 1
                :remote-sync-card-count 1
                :remote-sync-content-count 4}
               (select-keys (merge-with - (remote-sync/remote-sync-stats) before)
                            [:remote-sync-dashboard-count :remote-sync-document-count :remote-sync-timeline-count
                             :remote-sync-card-count :remote-sync-content-count])))))))

(deftest transform-count-test
  (mt/with-dynamic-fn-redefs [remote-sync/remote-sync-configuration (constantly {:enabled? true :transforms? true})]
    (let [before (remote-sync/remote-sync-stats)]
      (mt/with-temp [:model/Transform _ {}
                     :model/Transform _ {}]
        (is (= 2 (- (:remote-sync-transform-count (remote-sync/remote-sync-stats)) (:remote-sync-transform-count before)))))))
  (testing "transforms are excluded when their sync switch is off"
    (mt/with-temp [:model/Transform _ {}]
      (is (zero? (:remote-sync-transform-count (remote-sync/remote-sync-stats)))))))

(deftest library-content-counts-test
  (mt/with-temp [:model/Collection _ {:type "library" :is_remote_synced true}]
    (let [before (remote-sync/remote-sync-stats)]
      (mt/with-temp [:model/NativeQuerySnippet _ {}
                     :model/NativeQuerySnippet _ {:archived true}
                     :model/Glossary _ {:term (mt/random-name) :definition "A definition"}
                     :model/Action _ {:type :query :name "Library action" :model_id nil}]
        (is (= {:remote-sync-snippet-count 1
                :remote-sync-glossary-entry-count 1
                :remote-sync-action-count 1
                :remote-sync-content-count 3}
               (select-keys (merge-with - (remote-sync/remote-sync-stats) before)
                            [:remote-sync-snippet-count :remote-sync-glossary-entry-count
                             :remote-sync-action-count :remote-sync-content-count])))))))

(deftest data-app-count-test
  (let [before (remote-sync/remote-sync-stats)]
    (mt/with-temp [:data_app _ {:name (mt/random-name) :entity_id (u/generate-nano-id)
                                :display_name "App" :bundle_path "data_apps/app/index.js"
                                :created_at :%now :updated_at :%now :enabled false}]
      (testing "a disabled app still has content in Git"
        (is (= 1 (- (:remote-sync-data-app-count (remote-sync/remote-sync-stats)) (:remote-sync-data-app-count before))))))))

(deftest disabled-sync-counts-test
  (mt/with-dynamic-fn-redefs [remote-sync/remote-sync-configuration (constantly {:enabled? false :transforms? true})]
    (mt/with-temp [:model/Collection {id :id} {:is_remote_synced true}
                   :model/Card _ {:collection_id id}]
      (is (every? zero? (vals (remote-sync/remote-sync-stats)))
          "leftover sync flags do not count when Git sync is disabled"))))

(deftest table-content-counts-test
  (mt/with-temp [:model/Collection {collection-id :id} {:is_remote_synced true :type "library-data"}]
    (let [before (remote-sync/remote-sync-stats)]
      (mt/with-temp [:model/Table {published-id :id} {:is_published true :collection_id collection-id}
                     :model/Table {unpublished-id :id} {:is_published false :collection_id collection-id}
                     :model/Measure _ {:table_id published-id}
                     :model/Measure _ {:table_id published-id :archived true}
                     :model/Measure _ {:table_id unpublished-id}
                     :model/Segment _ {:table_id published-id}
                     :model/Segment _ {:table_id unpublished-id}]
        (is (= {:remote-sync-table-count 1
                :remote-sync-measure-count 1
                :remote-sync-segment-count 1
                :remote-sync-content-count 3}
               (select-keys (merge-with - (remote-sync/remote-sync-stats) before)
                            [:remote-sync-table-count :remote-sync-measure-count
                             :remote-sync-segment-count :remote-sync-content-count])))))))
