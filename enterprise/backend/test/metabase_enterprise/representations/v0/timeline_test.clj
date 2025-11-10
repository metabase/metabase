(ns metabase-enterprise.representations.v0.timeline-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest representation-type-test
  (testing "Timeline representation type is :timeline"
    (mt/with-temp [:model/Timeline timeline {:name "Test Timeline"
                                             :icon "star"
                                             :default false}]
      (is (= :timeline (v0-common/representation-type timeline))))))

(deftest export-timeline-test
  (testing "Timeline exports with correct structure"
    (mt/with-temp [:model/Timeline timeline {:name "Test Timeline"
                                             :description "A test timeline"
                                             :icon "star"
                                             :default false
                                             :archived false}]
      (let [exported (export/export-entity timeline)]
        (is (= :timeline (:type exported)))
        (is (= :v0 (:version exported)))
        (is (= "Test Timeline" (:display_name exported)))
        (is (= "A test timeline" (:description exported)))
        (is (= "star" (:icon exported)))
        (is (= false (:default exported)))
        (is (= false (:archived exported)))
        (is (string? (:name exported)))))))

(deftest export-timeline-with-events-test
  (testing "Timeline exports with its events"
    (mt/with-temp [:model/Timeline timeline {:name "Timeline with Events"
                                             :icon "star"
                                             :default false}
                   :model/TimelineEvent event1 {:timeline_id (:id timeline)
                                                :name "Event 1"
                                                :description "First event"
                                                :timestamp #t "2025-01-01T12:00:00Z"
                                                :time_matters true
                                                :timezone "UTC"
                                                :icon "bell"
                                                :archived false}
                   :model/TimelineEvent event2 {:timeline_id (:id timeline)
                                                :name "Event 2"
                                                :timestamp #t "2025-02-01T12:00:00Z"
                                                :time_matters false
                                                :timezone "America/New_York"
                                                :icon "cake"
                                                :archived false}]
      (let [exported (export/export-entity timeline)
            events (:events exported)]
        (is (= 2 (count events)))
        (is (= "Event 1" (:name (first events))))
        (is (= "First event" (:description (first events))))
        (is (true? (:time_matters (first events))))
        (is (= "UTC" (:timezone (first events))))
        (is (= "bell" (:icon (first events))))
        (is (= "Event 2" (:name (second events))))
        (is (false? (:time_matters (second events))))
        (is (= "America/New_York" (:timezone (second events))))
        (is (= "cake" (:icon (second events))))))))

(deftest export-timeline-in-collection-test
  (testing "Timeline in collection exports with collection reference"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"}
                   :model/Timeline timeline {:name "Timeline in Collection"
                                             :icon "star"
                                             :collection_id (:id collection)
                                             :default false}]
      (let [exported (export/export-entity timeline)]
        (is (= :timeline (:type exported)))
        (is (= "Timeline in Collection" (:display_name exported)))
        (is (:collection exported))
        (is (string? (:collection exported)))))))

(deftest validate-exported-timeline-test
  (testing "Exported timeline validates against schema"
    (mt/with-temp [:model/Timeline timeline {:name "Valid Timeline"
                                             :icon "star"
                                             :default false}]
      (let [edn (export/export-entity timeline)
            yaml-str (yaml/generate-string edn)
            rep (yaml/parse-string yaml-str)]
        (is (rep-read/parse rep))))))

(deftest import-timeline-test
  (testing "Timeline can be imported from representation"
    (let [rep {:type :timeline
               :version :v0
               :name "imported-timeline"
               :display_name "Imported Timeline"
               :description "A timeline imported from YAML"
               :icon "star"
               :default false
               :archived false}
          imported (import/yaml->toucan rep nil)]
      (is (= "Imported Timeline" (:name imported)))
      (is (= "A timeline imported from YAML" (:description imported)))
      (is (= "star" (:icon imported)))
      (is (= false (:default imported)))
      (is (= false (:archived imported))))))

(deftest import-timeline-with-events-test
  (testing "Timeline with events can be imported from representation"
    (let [rep {:type :timeline
               :version :v0
               :name "timeline-with-events"
               :display_name "Timeline with Events"
               :icon "star"
               :default false
               :events [{:name "Imported Event"
                         :description "An imported event"
                         :timestamp "2025-03-01T10:00:00Z"
                         :time_matters true
                         :timezone "UTC"
                         :icon "bell"
                         :archived false}]}
          imported (import/yaml->toucan rep nil)]
      (is (= "Timeline with Events" (:name imported)))
      (is (= "star" (:icon imported))))))

(deftest persist-timeline-test
  (testing "Timeline can be persisted to database"
    (mt/with-test-user :crowberto
      (let [rep {:type :timeline
                 :version :v0
                 :name "persisted-timeline"
                 :display_name "Persisted Timeline"
                 :description "A persisted timeline"
                 :icon "star"
                 :default false
                 :archived false
                 :events [{:name "Persisted Event"
                           :timestamp "2025-04-01T14:00:00Z"
                           :time_matters false
                           :timezone "America/Los_Angeles"
                           :icon "warning"
                           :archived false}]}
            persisted (import/persist! rep nil)]
        (is (some? (:id persisted)))
        (is (= "Persisted Timeline" (:name persisted)))
        (is (= "A persisted timeline" (:description persisted)))
        (is (= "star" (:icon persisted)))
        (let [events (t2/select :model/TimelineEvent :timeline_id (:id persisted))]
          (is (= 1 (count events)))
          (is (= "Persisted Event" (:name (first events))))
          (is (= "America/Los_Angeles" (:timezone (first events))))
          (is (= "warning" (:icon (first events)))))))))

(deftest roundtrip-timeline-test
  (testing "Timeline export → import → export preserves data"
    (mt/with-temp [:model/Timeline timeline {:name "Roundtrip Timeline"
                                             :description "Testing roundtrip"
                                             :icon "bell"
                                             :default false
                                             :archived false}
                   :model/TimelineEvent event {:timeline_id (:id timeline)
                                               :name "Roundtrip Event"
                                               :timestamp #t "2025-05-01T09:00:00Z"
                                               :time_matters true
                                               :timezone "UTC"
                                               :icon "cake"
                                               :archived false}]
      (let [export-1 (export/export-entity timeline)
            yaml-str (yaml/generate-string export-1)
            rep (yaml/parse-string yaml-str)
            normalized (rep-read/parse rep)
            persisted (mt/with-test-user :crowberto
                        (import/persist! normalized nil))
            export-2 (export/export-entity persisted)]
        (is (= (:display_name export-1) (:display_name export-2)))
        (is (= (:description export-1) (:description export-2)))
        (is (= (:icon export-1) (:icon export-2)))
        (is (= (:default export-1) (:default export-2)))
        (is (= (:type export-1) (:type export-2)))
        (is (= (count (:events export-1)) (count (:events export-2))))
        (is (= (:name (first (:events export-1)))
               (:name (first (:events export-2)))))))))
