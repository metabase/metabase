(ns metabase.models.timeline-event-test
  "Tests for TimelineEvent model namespace."
  (:require
   [clojure.test :refer :all]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.timeline :refer [Timeline]]
   [metabase.models.timeline-event
    :as timeline-event
    :refer [TimelineEvent]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- names [timelines]
  (into #{} (comp (mapcat :events) (map :name)) timelines))

(deftest hydrate-events-test
  (testing "hydrate-events function hydrates all timelines events"
    (mt/with-temp [Collection _collection {:name "Rasta's Collection"}
                   Timeline tl-a {:name "tl-a"}
                   Timeline tl-b {:name "tl-b"}
                   TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "un-1"}
                   TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "archived-1"
                                    :archived true}
                   TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "un-2"}
                   TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "archived-2"
                                    :archived true}]
      (testing "only unarchived events by default"
        (is (= #{"un-1" "un-2"}
               (names (timeline-event/include-events [tl-a tl-b] {})))))
      (testing "all events when specified"
        (is (= #{"un-1" "un-2" "archived-1" "archived-2"}
               (names (timeline-event/include-events [tl-a tl-b] {:events/all? true}))))))))

(deftest balloon-icon-migration-test
  (testing "timeline events with icon=balloons should use the default icon instead when selected"
    (mt/with-temp [Timeline tl-a {:icon "balloons"}
                   Timeline tl-b {:icon "cake"}
                   TimelineEvent a {:timeline_id (u/the-id tl-a) :icon "balloons"}
                   TimelineEvent b {:timeline_id (u/the-id tl-b) :icon "cake"}]
      (is (= timeline-event/default-icon
             (t2/select-one-fn :icon TimelineEvent (u/the-id a))))
      (is (= "cake"
             (t2/select-one-fn :icon TimelineEvent (u/the-id b)))))))
