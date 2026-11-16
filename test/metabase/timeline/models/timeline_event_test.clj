(ns metabase.timeline.models.timeline-event-test
  "Tests for TimelineEvent model namespace."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- names [timelines]
  (into #{} (comp (mapcat :events) (map :name)) timelines))

(deftest hydrate-events-test
  (testing "hydrate-events function hydrates all timelines events"
    (mt/with-temp [:model/Collection _collection {:name "Rasta's Collection"}
                   :model/Timeline tl-a {:name "tl-a"}
                   :model/Timeline tl-b {:name "tl-b"}
                   :model/TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "un-1"}
                   :model/TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "archived-1"
                                           :archived true}
                   :model/TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "un-2"}
                   :model/TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "archived-2"
                                           :archived true}]
      (testing "only unarchived events by default"
        (is (= #{"un-1" "un-2"}
               (names (timeline-event/include-events [tl-a tl-b] {})))))
      (testing "all events when specified"
        (is (= #{"un-1" "un-2" "archived-1" "archived-2"}
               (names (timeline-event/include-events [tl-a tl-b] {:events/all? true}))))))))

(deftest balloon-icon-migration-test
  (testing "timeline events with icon=balloons should use the default icon instead when selected"
    (mt/with-temp [:model/Timeline tl-a {}
                   :model/Timeline tl-b {:icon "cake"}
                   :model/TimelineEvent a {:timeline_id (u/the-id tl-a)}
                   :model/TimelineEvent b {:timeline_id (u/the-id tl-b) :icon "cake"}]
      (t2/query-one {:update :timeline_event :set {:icon "balloons"} :where [:= :id (u/the-id a)]})
      (is (= timeline-event/default-icon
             (t2/select-one-fn :icon :model/TimelineEvent :id (u/the-id a))))
      (is (= "cake"
             (t2/select-one-fn :icon :model/TimelineEvent :id (u/the-id b)))))))

(defn- event-row
  [timeline-id overrides]
  (merge {:name        "Event"
          :timeline_id timeline-id
          :timestamp   (java.time.Instant/parse "2027-10-20T00:00:00Z")
          :timezone    "UTC"
          :time_matters true
          :creator_id  (mt/user->id :rasta)}
         overrides))

(deftest icon-test
  (mt/with-temp [:model/Timeline      {timeline-id :id} {:icon "cake"}
                 :model/TimelineEvent {event-id :id}    {:timeline_id timeline-id}]
    (testing "an event without an icon gets the icon of its Timeline"
      (let [id (t2/insert-returning-pk! :model/TimelineEvent (event-row timeline-id {}))]
        (is (= "cake" (t2/select-one-fn :icon :model/TimelineEvent :id id)))
        (t2/delete! :model/TimelineEvent :id id)))
    (testing "an icon outside the allowed set is refused on insert and update"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid Timeline event icon"
                            (t2/insert! :model/TimelineEvent (event-row timeline-id {:icon "nope"}))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid Timeline event icon"
                            (t2/update! :model/TimelineEvent :id event-id {:icon "nope"}))))))

(deftest column-rules-test
  (mt/with-temp [:model/Timeline      {timeline-id :id} {}
                 :model/TimelineEvent {event-id :id}    {:timeline_id timeline-id}]
    (testing "a blank name is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must have a name"
                            (t2/insert! :model/TimelineEvent (event-row timeline-id {:name " "}))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must have a name"
                            (t2/update! :model/TimelineEvent :id event-id {:name ""}))))
    (testing "an unknown timezone is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid Timeline event timezone"
                            (t2/insert! :model/TimelineEvent (event-row timeline-id {:timezone "Nowhere/Land"}))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid Timeline event timezone"
                            (t2/update! :model/TimelineEvent :id event-id {:timezone "Nowhere/Land"}))))
    (testing "time_matters must be a boolean"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"time_matters"
                            (t2/insert! :model/TimelineEvent (event-row timeline-id {:time_matters nil}))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"time_matters"
                            (t2/update! :model/TimelineEvent :id event-id {:time_matters nil}))))
    (testing "a timestamp is required"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must have a timestamp"
                            (t2/insert! :model/TimelineEvent (dissoc (event-row timeline-id {}) :timestamp))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must have a timestamp"
                            (t2/update! :model/TimelineEvent :id event-id {:timestamp nil}))))
    (testing "the creator cannot change"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"creator_id"
                            (t2/update! :model/TimelineEvent :id event-id {:creator_id (mt/user->id :crowberto)}))))))

(deftest update-check-test
  (mt/with-temp [:model/Collection    {from-id :id}     {}
                 :model/Collection    {to-id :id}       {}
                 :model/Timeline      {from-tl :id}     {:collection_id from-id}
                 :model/Timeline      {to-tl :id}       {:collection_id to-id}
                 :model/TimelineEvent {event-id :id}    {:timeline_id from-tl}]
    (perms/revoke-collection-permissions! (perms/all-users-group) from-id)
    (perms/revoke-collection-permissions! (perms/all-users-group) to-id)
    (perms/grant-collection-readwrite-permissions! (perms/all-users-group) from-id)
    (let [event (t2/select-one :model/TimelineEvent :id event-id)]
      (mt/with-test-user :rasta
        (testing "a move to a Timeline the user cannot write is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                                (api/update-check event {:timeline_id to-tl}))))
        (testing "a change that keeps the Timeline is allowed"
          (is (some? (api/update-check event {:name "Renamed"}))))
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) to-id)
        (testing "a move to a Timeline the user can write is allowed"
          (is (some? (api/update-check event {:timeline_id to-tl}))))))
    (testing "creating needs write access to the Timeline's Collection"
      (perms/revoke-collection-permissions! (perms/all-users-group) to-id)
      (mt/with-test-user :rasta
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/create-check :model/TimelineEvent {:timeline_id to-tl})))
        (is (some? (api/create-check :model/TimelineEvent {:timeline_id from-tl})))))))
