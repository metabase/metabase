(ns metabase.timeline.models.timeline-event-test
  "Tests for TimelineEvent model namespace."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.test-util :as events.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
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
  (mt/with-temp [:model/Timeline {timeline-id :id} {:icon "cake"}]
    (testing "an event without an icon gets the icon of its Timeline"
      (let [id (:id (first (timeline-event/create-timeline-events! [(event-row timeline-id {})])))]
        (is (= "cake" (t2/select-one-fn :icon :model/TimelineEvent :id id)))
        (t2/delete! :model/TimelineEvent :id id)))
    (testing "the event schema refuses an icon outside the allowed set"
      (is (mr/validate ::timeline.schema/timeline-event.update {:id 1 :icon "cake"}))
      (is (not (mr/validate ::timeline.schema/timeline-event.update {:id 1 :icon "nope"})))
      (is (not (mr/validate ::timeline.schema/timeline-event.update {:id 1 :icon nil}))))))

(deftest column-rules-test
  (mt/with-temp [:model/Timeline      {timeline-id :id} {}
                 :model/TimelineEvent {event-id :id}    {:timeline_id timeline-id}]
    (testing "the event schema refuses a blank name, a non-boolean time_matters and a nil timestamp"
      (is (not (mr/validate ::timeline.schema/timeline-event.update {:id 1 :name " "})))
      (is (not (mr/validate ::timeline.schema/timeline-event.update {:id 1 :time_matters nil})))
      (is (not (mr/validate ::timeline.schema/timeline-event.update {:id 1 :timestamp nil}))))
    (testing "a timezone the request check would refuse is stored, as an import of an old event carries it"
      (mt/with-temp [:model/TimelineEvent {odd-id :id} (event-row timeline-id {:timezone "Nowhere/Land"})]
        (is (= "Nowhere/Land" (t2/select-one-fn :timezone :model/TimelineEvent :id odd-id)))
        (t2/update! :model/TimelineEvent :id event-id {:timezone "Nowhere/Land"})
        (is (= "Nowhere/Land" (t2/select-one-fn :timezone :model/TimelineEvent :id event-id)))))
    (testing "the creator cannot change"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot change the creator of a Timeline event"
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

(deftest create-timeline-events-takes-timeline-icon-test
  (mt/with-temp [:model/Timeline {timeline-id :id} {:icon "cake"}]
    (mt/with-model-cleanup [:model/TimelineEvent]
      (let [[without with] (timeline-event/create-timeline-events!
                            [(event-row timeline-id {:name "without"})
                             (event-row timeline-id {:name "with" :icon "bell"})])]
        (is (= "cake" (:icon without)))
        (is (= "bell" (:icon with)))))))

(deftest create-timeline-events-runs-fixed-statements-test
  (letfn [(creating [n]
            (mt/with-temp [:model/Timeline {timeline-id :id} {}]
              (mt/with-model-cleanup [:model/TimelineEvent]
                (t2/with-call-count [call-count]
                  (timeline-event/create-timeline-events!
                   (for [i (range n)]
                     (event-row timeline-id {:name (str "event " i)})))
                  (call-count)))))]
    (creating 1)
    (is (= (creating 2) (creating 6)))))

(deftest create-timeline-events-with-different-columns-test
  (mt/with-temp [:model/Timeline {timeline-id :id} {}]
    (mt/with-model-cleanup [:model/TimelineEvent]
      (let [creator-id (mt/user->id :rasta)
            timestamp  (java.time.OffsetDateTime/now)
            events     (timeline-event/create-timeline-events! [{:timeline_id timeline-id :name "Plain" :timestamp timestamp
                                                                 :creator_id creator-id :time_matters false :timezone "UTC"}
                                                                {:timeline_id timeline-id :name "Archived" :timestamp timestamp
                                                                 :creator_id creator-id :time_matters false :timezone "UTC" :archived true}])]
        (is (= ["Plain" "Archived"] (map :name events)))
        (is (= [false true] (map #(t2/select-one-fn :archived :model/TimelineEvent :id (:id %)) events)))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/TimelineEvent :model/Timeline]
    (let [user-id     (mt/user->id :rasta)
          timeline-id (t2/insert-returning-pk! :model/Timeline (mt/with-temp-defaults :model/Timeline))
          rows        (fn [n]
                        (mapv (fn [i]
                                (cond-> {:timeline_id timeline-id :name (mt/random-name) :timestamp (java.time.Instant/now)
                                         :creator_id user-id :time_matters false :timezone "UTC"}
                                  (odd? i) (assoc :icon "cake")))
                              (range n)))
          fresh!      (fn [n]
                        (let [ids (mapv :id (timeline-event/create-timeline-events! (rows n)))]
                          (timeline-event/update-timeline-events! (mapv (fn [id] {:id id :description "Same"}) (take-nth 2 ids)))
                          ids))]
      (testing "creating events, some with an icon of their own"
        (events.tu/statement-count! #(timeline-event/create-timeline-events! (rows 1)))
        (is (= (events.tu/statement-count! #(timeline-event/create-timeline-events! (rows 2)))
               (events.tu/statement-count! #(timeline-event/create-timeline-events! (rows 6))))))
      (testing "updating events, some already holding the new value"
        (let [update! (fn [n]
                        (let [ids (fresh! n)]
                          (events.tu/statement-count!
                           #(timeline-event/update-timeline-events! (mapv (fn [id] {:id id :description "Same"}) ids)))))]
          (update! 1)
          (is (= (update! 2) (update! 6)))))
      (testing "deleting events"
        (let [delete! (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(timeline-event/delete-timeline-events! ids))))]
          (delete! 1)
          (is (= (delete! 2) (delete! 6))))))))
