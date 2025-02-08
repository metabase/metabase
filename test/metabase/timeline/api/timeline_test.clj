(ns metabase.timeline.api.timeline-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- collection-timelines-request
  [collection include-events?]
  (if include-events?
    (mt/user-http-request :rasta :get 200 (str "timeline/collection/" (u/the-id collection)) :include "events")
    (mt/user-http-request :rasta :get 200 (str "timeline/collection/" (u/the-id collection)))))

(defn- timeline-names [timelines]
  (->> timelines (map :name) set))

(defn- event-names [timelines]
  (->> timelines (mapcat :events) (map :name) set))

(deftest collection-timelines-test
  (testing "GET /api/timeline/collection/root|id"
    (mt/with-temp [:model/Collection coll-a {:name "Collection A"}
                   :model/Collection coll-b {:name "Collection B"}
                   :model/Collection coll-c {:name "Collection C"}
                   :model/Timeline tl-a      {:name          "Timeline A"
                                              :collection_id (u/the-id coll-a)}
                   :model/Timeline tl-b      {:name          "Timeline B"
                                              :collection_id (u/the-id coll-b)}
                   :model/Timeline _tl-b-old {:name          "Timeline B-old"
                                              :collection_id (u/the-id coll-b)
                                              :archived      true}
                   :model/Timeline _tl-c     {:name          "Timeline C"
                                              :collection_id (u/the-id coll-c)}
                   :model/TimelineEvent _event-aa {:name        "event-aa"
                                                   :timeline_id (u/the-id tl-a)}
                   :model/TimelineEvent _event-ab {:name        "event-ab"
                                                   :timeline_id (u/the-id tl-a)}
                   :model/TimelineEvent _event-ba {:name        "event-ba"
                                                   :timeline_id (u/the-id tl-b)}
                   :model/TimelineEvent _event-bb {:name        "event-bb"
                                                   :timeline_id (u/the-id tl-b)
                                                   :archived    true}]
      (testing "Timelines in the collection of the card are returned"
        (is (= #{"Timeline A"}
               (timeline-names (collection-timelines-request coll-a false)))))
      (testing "Timelines in the collection have a hydrated `:collection` key"
        (is (= #{(u/the-id coll-a)}
               (->> (collection-timelines-request coll-a false)
                    (map #(get-in % [:collection :id]))
                    set))))
      (testing "check that `:can_write` key is hydrated"
        (is (every?
             #(contains? % :can_write)
             (map :collection (collection-timelines-request coll-a false)))))
      (testing "Only un-archived timelines in the collection of the card are returned"
        (is (= #{"Timeline B"}
               (timeline-names (collection-timelines-request coll-b false)))))
      (testing "Timelines have events when `include=events` is passed"
        (is (= #{"event-aa" "event-ab"}
               (event-names (collection-timelines-request coll-a true)))))
      (testing "Timelines have only un-archived events when `include=events` is passed"
        (is (= #{"event-ba"}
               (event-names (collection-timelines-request coll-b true)))))
      (testing "Timelines with no events have an empty list on `:events` when `include=events` is passed"
        (is (= '()
               (->> (collection-timelines-request coll-c true) first :events)))))))

(deftest collection-timelines-permissions-test
  (testing "GET /api/timeline/collection/:id"
    (mt/with-temp [:model/Collection coll-a {:name "Collection A"}
                   :model/Timeline tl-a      {:name          "Timeline A"
                                              :collection_id (u/the-id coll-a)}
                   :model/TimelineEvent _event-aa {:name        "event-aa"
                                                   :timeline_id (u/the-id tl-a)}]
      (testing "You can't query a collection's timelines if you don't have perms on it."
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-a)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (str "timeline/collection/" (u/the-id coll-a)) :include "events"))))
      (testing "If we grant perms, then we can read the timelines"
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-a)
        (mt/user-http-request :rasta :get 200 (str "timeline/collection/" (u/the-id coll-a)) :include "events")))))

(deftest collection-timelines-permissions-test-2
  (testing "GET /api/timeline/collection/root"
    (mt/with-temp [:model/Timeline tl-a      {:name          "Timeline A"
                                              :collection_id nil}
                   :model/TimelineEvent _event-aa {:name        "event-aa"
                                                   :timeline_id (u/the-id tl-a)}]
      (testing "You can't query a collection's timelines if you don't have perms on it."
        (mt/with-non-admin-groups-no-root-collection-perms
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "timeline/collection/root" :include "events")))))
      (testing "If we grant perms, then we can read the timelines"
        (mt/user-http-request :rasta :get 200 "timeline/collection/root" :include "events")))))
