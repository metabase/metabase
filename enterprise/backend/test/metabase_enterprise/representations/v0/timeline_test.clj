(ns metabase-enterprise.representations.v0.timeline-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest representation-type-test
  (mt/with-temp [:model/Timeline timeline {}]
    (is (= :timeline (v0-common/representation-type timeline)))))

(deftest export-timeline-with-events-test
  (mt/with-temp [:model/Timeline timeline {:name "Timeline with Events"
                                           :description "A timeline that has events"
                                           :icon "star"
                                           :default false
                                           :archived false}
                 :model/TimelineEvent _event1 {:timeline_id (:id timeline)
                                               :name "Event 1"
                                               :description "First event"
                                               :timestamp #t "2025-01-01T12:00:00Z"
                                               :time_matters true
                                               :timezone "UTC"
                                               :icon "bell"
                                               :archived false}
                 :model/TimelineEvent _event2 {:timeline_id (:id timeline)
                                               :name "Event 2"
                                               :timestamp #t "2025-02-01T12:00:00Z"
                                               :time_matters false
                                               :timezone "UTC"
                                               :icon "cake"
                                               :archived false}]
    (let [exported (export/export-entity timeline)
          imported (import/yaml->toucan exported nil)]
      (testing "exported timeline validates against schema"
        (let [yaml-str (yaml/generate-string exported)
              rep (yaml/parse-string yaml-str)]
          (is (rep-read/parse rep))))
      (testing "exporting a timeline works"
        (is (= {:type :timeline,
                :version :v0
                :name (format "timeline-%d" (:id timeline)),
                :display_name "Timeline with Events"
                :description "A timeline that has events",
                :icon "star",
                :archived false,
                :default false,
                :events [{:name "Event 1",
                          :description "First event",
                          :timestamp "2025-01-01T12:00:00Z",
                          :time_matters true,
                          :timezone "UTC",
                          :icon "bell",
                          :archived false}
                         {:name "Event 2",
                          :timestamp "2025-02-01T12:00:00Z",
                          :time_matters false,
                          :timezone "UTC",
                          :icon "cake",
                          :archived false}]}
               exported)))
      (testing "importing an exported timeline back works"
        (is (= {:name "Timeline with Events",
                :description "A timeline that has events",
                :icon "star",
                :default false,
                :archived false,
                :events [{:name "Event 1",
                          :description "First event",
                          :timestamp #t "2025-01-01T12:00Z[UTC]",
                          :time_matters true,
                          :timezone "UTC",
                          :icon "bell",
                          :archived false}
                         {:name "Event 2",
                          :timestamp #t "2025-02-01T12:00Z[UTC]",
                          :time_matters false,
                          :timezone "UTC",
                          :icon "cake",
                          :archived false}]}
               imported)))
      (testing "inserting and updating an exported timeline works"
        (let [inserted-timeline (import/insert! exported nil)
              inserted-id (:id inserted-timeline)
              fetched-timeline (t2/select-one :model/Timeline :id inserted-id)
              fetched-events (t2/select :model/TimelineEvent :timeline_id inserted-id)]
          (is (= (assoc fetched-timeline :events fetched-events)
                 inserted-timeline))
          (let [new-events [(assoc (first (:events exported)) :name "Updated event name")]
                new-timeline (-> exported
                                 (assoc :display_name "Update timeline name")
                                 (assoc :events new-events))
                updated-timeline (import/update! new-timeline inserted-id nil)
                updated-fetched (t2/select-one :model/Timeline :id inserted-id)
                updated-events (t2/select :model/TimelineEvent :timeline_id inserted-id)]
            (is (= (assoc updated-fetched :events updated-events)
                   updated-timeline)))
          (t2/delete! :model/Timeline :id inserted-id))))))
