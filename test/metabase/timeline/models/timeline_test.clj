(ns metabase.timeline.models.timeline-test
  "Tests for the Timeline model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.timeline.models.timeline :as timeline]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
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
    (mt/with-temp [:model/Timeline a {}
                   :model/Timeline b {:icon "cake"}]
      (t2/query-one {:update :timeline :set {:icon "balloons"} :where [:= :id (u/the-id a)]})
      (is (= timeline-event/default-icon
             (t2/select-one-fn :icon :model/Timeline :id (u/the-id a))))
      (is (= "cake"
             (t2/select-one-fn :icon :model/Timeline :id (u/the-id b)))))))

(deftest hydrate-timeline-test
  (mt/with-temp [:model/Timeline      tl  {:name "tl-a"}
                 :model/TimelineEvent tle {:timeline_id (:id tl) :name "e-a"}]
    (is (= tl (:timeline (t2/hydrate tle :timeline))))))

(deftest icon-test
  (mt/with-temp [:model/Timeline {timeline-id :id} {}]
    (testing "a Timeline without an icon gets the default icon"
      (let [id (t2/insert-returning-pk! :model/Timeline {:name "Icons" :creator_id (mt/user->id :rasta)})]
        (is (= timeline-event/default-icon (t2/select-one-fn :icon :model/Timeline :id id)))
        (t2/delete! :model/Timeline :id id)))
    (testing "the Timeline schema refuses a blank name and an icon outside the allowed set"
      (is (not (mr/validate ::timeline.schema/timeline.update {:name ""})))
      (is (not (mr/validate ::timeline.schema/timeline.update {:icon "nope"})))
      (is (mr/validate ::timeline.schema/timeline.update {:name "Icons" :icon "cake"})))
    (testing "an allowed icon is accepted on update"
      (t2/update! :model/Timeline :id timeline-id {:icon "cake"})
      (is (= "cake" (t2/select-one-fn :icon :model/Timeline :id timeline-id))))))

(deftest collection-namespace-test
  (mt/with-temp [:model/Collection {snippets-id :id} {:namespace :snippets}
                 :model/Collection {other-id :id}    {}
                 :model/Timeline   {timeline-id :id} {:collection_id other-id}]
    (testing "a Timeline cannot go in a Collection of another namespace on insert"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only go in Collections"
                            (t2/insert! :model/Timeline {:name "T" :creator_id (mt/user->id :rasta) :collection_id snippets-id}))))
    (testing "a Timeline cannot move to a Collection of another namespace"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can only go in Collections"
                            (t2/update! :model/Timeline :id timeline-id {:collection_id snippets-id})))
      (is (= other-id (t2/select-one-fn :collection_id :model/Timeline :id timeline-id))))))

(deftest update-check-test
  (mt/with-temp [:model/Collection {from-id :id}   {}
                 :model/Collection {to-id :id}     {}
                 :model/Timeline   {timeline-id :id} {:collection_id from-id}]
    (perms/revoke-collection-permissions! (perms/all-users-group) from-id)
    (perms/revoke-collection-permissions! (perms/all-users-group) to-id)
    (perms/grant-collection-readwrite-permissions! (perms/all-users-group) from-id)
    (let [timeline (t2/select-one :model/Timeline :id timeline-id)]
      (mt/with-test-user :rasta
        (testing "a move to a Collection the user cannot write is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                                (api/update-check timeline {:collection_id to-id}))))
        (testing "a change that keeps the Collection is allowed"
          (is (some? (api/update-check timeline {:name "Renamed"}))))
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) to-id)
        (testing "a move to a Collection the user can write is allowed"
          (is (some? (api/update-check timeline {:collection_id to-id}))))))))
