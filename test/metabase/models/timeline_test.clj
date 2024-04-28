(ns metabase.models.timeline-test
  "Tests for the Timeline model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.timeline :as timeline :refer [Timeline]]
   [metabase.models.timeline-event :refer [TimelineEvent] :as timeline-event]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest timelines-for-collection-test
  (t2.with-temp/with-temp [Collection collection {:name "Rasta's Collection"}]
    (let [coll-id  (u/the-id collection)
          event-names (fn [timelines]
                        (into #{} (comp (mapcat :events) (map :name)) timelines))]
      (mt/with-temp [Timeline tl-a {:name "tl-a" :collection_id coll-id}
                     Timeline tl-b {:name "tl-b" :collection_id coll-id}
                     TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "e-a"}
                     TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "e-b" :archived true}
                     TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "e-c"}
                     TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "e-d" :archived true}]
        (testing "Fetching timelines"
          (testing "don't include events by default"
            (is (= #{}
                   (->> (timeline/timelines-for-collection (u/the-id collection) {})
                        event-names))))
          (testing "include only unarchived events by default"
            (is (= #{"e-a" "e-c"}
                   (->> (timeline/timelines-for-collection (u/the-id collection)
                                                           {:timeline/events? true})
                        event-names))))
          (testing "can load all events if specify `:events/all?`"
            (is (= #{"e-a" "e-b" "e-c" "e-d"}
                   (->> (timeline/timelines-for-collection (u/the-id collection)
                                                           {:timeline/events? true
                                                            :events/all?      true})
                        event-names)))))))))

(deftest balloon-icon-migration-test
  (testing "timelines with icon=balloons should use the default icon instead when selected"
    (mt/with-temp [Timeline a {:icon "balloons"}
                   Timeline b {:icon "cake"}]
      (is (= timeline-event/default-icon
             (t2/select-one-fn :icon Timeline (u/the-id a))))
      (is (= "cake"
             (t2/select-one-fn :icon Timeline (u/the-id b)))))))

(deftest hydrate-timeline-test
  (mt/with-temp [Timeline      tl  {:name "tl-a"}
                 TimelineEvent tle {:timeline_id (:id tl) :name "e-a"}]
    (is (= tl (:timeline (t2/hydrate tle :timeline))))))
