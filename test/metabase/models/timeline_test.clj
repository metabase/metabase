(ns metabase.models.timeline-test
  "Tests for the Timeline model."
  (:require
   [clojure.test :refer :all]
   [metabase.models.timeline :as timeline]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest timelines-for-collection-test
  (mt/with-temp [:model/Collection collection {:name "Rasta's Collection"}]
    (let [coll-id  (u/the-id collection)
          event-names (fn [timelines]
                        (into #{} (comp (mapcat :events) (map :name)) timelines))]
      (mt/with-temp [:model/Timeline tl-a {:name "tl-a" :collection_id coll-id}
                     :model/Timeline tl-b {:name "tl-b" :collection_id coll-id}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "e-a"}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "e-b" :archived true}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "e-c"}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "e-d" :archived true}]
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
    (mt/with-temp [:model/Timeline a {:icon "balloons"}
                   :model/Timeline b {:icon "cake"}]
      (is (= timeline-event/default-icon
             (t2/select-one-fn :icon :model/Timeline (u/the-id a))))
      (is (= "cake"
             (t2/select-one-fn :icon :model/Timeline (u/the-id b)))))))

(deftest hydrate-timeline-test
  (mt/with-temp [:model/Timeline      tl  {:name "tl-a"}
                 :model/TimelineEvent tle {:timeline_id (:id tl) :name "e-a"}]
    (is (= tl (:timeline (t2/hydrate tle :timeline))))))
