(ns metabase-enterprise.data-testing.segment-remote-sync-test
  "Remote sync of segment tests: a segment test syncs when its segment's table is synced and the segment is not
  archived."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- synced-segment-test-ids
  "The ids of the segment tests whose documents a push would commit."
  []
  (into #{}
        (keep (fn [{[model id] :row}] (when (= :model/SegmentTest model) id)))
        (vals (content/local-documents))))

(defn- definition
  "A segment definition on the table `table-id` keeping the rows whose field `field-id` is 1."
  [table-id field-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp table-id))
        (lib/filter (lib/= (lib.metadata/field mp field-id) 1)))))

(defn- do-with-synced-and-unsynced-tables
  "Call `f` with a map of `:synced`, a table published in a synced collection, `:unsynced`, one that is not, and
  `:synced-field` and `:unsynced-field`, a field of each."
  [f]
  (mt/with-temp [:model/Collection        coll           {:name "Synced" :is_remote_synced true :location "/"}
                 :model/Table             synced         {:db_id         (mt/id)
                                                          :name          "synced_table"
                                                          :is_published  true
                                                          :collection_id (:id coll)}
                 :model/Field             synced-field   {:table_id (:id synced) :name "id" :base_type :type/Integer}
                 :model/TableUserSettings _              {:table_id      (:id synced)
                                                          :is_published  true
                                                          :collection_id (:id coll)}
                 :model/Table             unsynced       {:db_id (mt/id) :name "unsynced_table"}
                 :model/Field             unsynced-field {:table_id (:id unsynced) :name "id" :base_type :type/Integer}]
    (f {:synced synced :synced-field synced-field :unsynced unsynced :unsynced-field unsynced-field})))

(deftest segment-tests-follow-their-segments-test
  (mt/with-premium-features #{:remote-sync}
    (do-with-synced-and-unsynced-tables
     (fn [{:keys [synced synced-field unsynced unsynced-field]}]
       (mt/with-temp [:model/Segment     on-synced   {:table_id   (:id synced)
                                                      :name       "On a synced table"
                                                      :definition (definition (:id synced) (:id synced-field))}
                      :model/Segment     archived    {:table_id   (:id synced)
                                                      :name       "Archived"
                                                      :archived   true
                                                      :definition (definition (:id synced) (:id synced-field))}
                      :model/Segment     on-unsynced {:table_id   (:id unsynced)
                                                      :name       "On an unsynced table"
                                                      :definition (definition (:id unsynced) (:id unsynced-field))}
                      :model/SegmentTest t-synced    {:segment_id (:id on-synced)}
                      :model/SegmentTest t-archived  {:segment_id (:id archived)}
                      :model/SegmentTest t-unsynced  {:segment_id (:id on-unsynced)}]
         (let [synced-ids (synced-segment-test-ids)]
           (testing "a test of a segment on a table published in a synced collection is synced"
             (is (contains? synced-ids (:id t-synced))))
           (testing "a test of an archived segment is not synced"
             (is (not (contains? synced-ids (:id t-archived)))))
           (testing "a test of a segment on a table that is not synced is not synced"
             (is (not (contains? synced-ids (:id t-unsynced)))))))))))

(deftest push-and-pull-segment-tests-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/SegmentTest]
        (do-with-synced-and-unsynced-tables
         (fn [{:keys [synced synced-field]}]
           (mt/with-temp [:model/Segment     segment {:table_id   (:id synced)
                                                      :name       "Ones"
                                                      :definition (definition (:id synced) (:id synced-field))}
                          :model/SegmentTest t       {:segment_id (:id segment) :name "Only ones"}]
             (let [{v1 :version} (remote-sync.tu/push! url nil)
                   segment-path  (remote-sync.tu/entity-path! url "main" segment)
                   t-path        (remote-sync.tu/entity-path! url "main" t)]
               (testing "a push writes the test in the segment's directory, under its own name"
                 (is (some? segment-path))
                 (is (= (str (str/replace segment-path #"\.yaml$" "") "/only_ones.yaml") t-path)))
               (when t-path
                 (let [t-yaml (remote-sync.tu/read-file! url "main" t-path)]
                   (testing "a pull that removes the test's file deletes the test and keeps its segment"
                     (remote-sync.tu/commit! url "main" {t-path nil})
                     (let [{v2 :version :as result} (remote-sync.tu/pull! url v1)]
                       (is (=? {:status :success} result))
                       (is (not (t2/exists? :model/SegmentTest :entity_id (:entity_id t))))
                       (is (t2/exists? :model/Segment :id (:id segment)))
                       (testing "a pull that adds the test's file inserts the test"
                         (remote-sync.tu/commit! url "main" {t-path t-yaml})
                         (is (=? {:status :success} (remote-sync.tu/pull! url v2)))
                         (is (=? {:name "Only ones" :segment_id (:id segment)}
                                 (t2/select-one :model/SegmentTest :entity_id (:entity_id t)))))))))))))))))

(deftest dirty-list-shows-segment-tests-under-their-segments-tables-test
  (remote-sync.tu/with-repository [url]
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (do-with-synced-and-unsynced-tables
         (fn [{:keys [synced synced-field]}]
           (mt/with-temp [:model/Segment     segment {:table_id   (:id synced)
                                                      :name       "Ones"
                                                      :definition (definition (:id synced) (:id synced-field))}
                          :model/SegmentTest t       {:segment_id (:id segment) :name "Only ones"}]
             (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                           {:branch "main" :message "Push"})]
               (is (=? {:status "successful"} (remote-sync.tu/wait-for-task! task_id))))
             (t2/update! :model/SegmentTest :id (:id t) {:description "changed"})
             (testing "a changed segment test is listed with its segment, the segment's table, and the table's collection"
               (is (=? [{:id          (:id t)
                         :model       "segmenttest"
                         :sync_status "update"
                         :data        {:segment {:id    (:id segment)
                                                 :table {:id         (:id synced)
                                                         :collection {:name "Synced"}}}}}]
                       (filter (comp #{"segmenttest"} :model)
                               (:dirty (mt/user-http-request :crowberto :get 200 "ee/remote-sync/dirty")))))))))))))
