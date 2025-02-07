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
  (testing "GET /api/collection/root|id/timelines"
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

(defn- card-timelines-request
  [card include-events?]
  (if include-events?
    (mt/user-http-request :rasta :get 200 (str "timeline/card/" (u/the-id card)) :include "events")
    (mt/user-http-request :rasta :get 200 (str "timeline/card/" (u/the-id card)))))

(defn- card-timelines-range-request
  [card {:keys [start end]}]
  (apply mt/user-http-request (concat [:rasta :get 200
                                       (str "timeline/card/" (u/the-id card))
                                       :include "events"]
                                      (when start [:start start])
                                      (when end [:end end]))))

(deftest ^:parallel card-timelines-test
  (testing "GET /api/timeline/card/:id"
    (mt/with-temp [:model/Collection coll-a {:name "Collection A"}
                   :model/Collection coll-b {:name "Collection B"}
                   :model/Collection coll-c {:name "Collection C"}
                   :model/Card card-a {:name          "Card A"
                                       :collection_id (u/the-id coll-a)}
                   :model/Card card-b {:name          "Card B"
                                       :collection_id (u/the-id coll-b)}
                   :model/Card card-c {:name          "Card C"
                                       :collection_id (u/the-id coll-c)}
                   :model/Timeline tl-a {:name          "Timeline A"
                                         :collection_id (u/the-id coll-a)}
                   :model/Timeline tl-b {:name          "Timeline B"
                                         :collection_id (u/the-id coll-b)}
                   :model/Timeline _ {:name          "Timeline B-old"
                                      :collection_id (u/the-id coll-b)
                                      :archived      true}
                   :model/Timeline _ {:name          "Timeline C"
                                      :collection_id (u/the-id coll-c)}
                   :model/TimelineEvent _ {:name        "event-aa"
                                           :timeline_id (u/the-id tl-a)}
                   :model/TimelineEvent _ {:name        "event-ab"
                                           :timeline_id (u/the-id tl-a)}
                   :model/TimelineEvent _ {:name        "event-ba"
                                           :timeline_id (u/the-id tl-b)}
                   :model/TimelineEvent _ {:name        "event-bb"
                                           :timeline_id (u/the-id tl-b)
                                           :archived    true}]
      (testing "Timelines in the collection of the card are returned"
        (is (= #{"Timeline A"}
               (timeline-names (card-timelines-request card-a false)))))
      (testing "Timelines in the collection have a hydrated `:collection` key"
        (is (= #{(u/the-id coll-a)}
               (->> (card-timelines-request card-a false)
                    (map #(get-in % [:collection :id]))
                    set))))
      (testing "check that `:can_write` key is hydrated"
        (is (every?
             #(contains? % :can_write)
             (map :collection (card-timelines-request card-a false)))))
      (testing "Only un-archived timelines in the collection of the card are returned"
        (is (= #{"Timeline B"}
               (timeline-names (card-timelines-request card-b false)))))
      (testing "Timelines have events when `include=events` is passed"
        (is (= #{"event-aa" "event-ab"}
               (event-names (card-timelines-request card-a true)))))
      (testing "Timelines have only un-archived events when `include=events` is passed"
        (is (= #{"event-ba"}
               (event-names (card-timelines-request card-b true)))))
      (testing "Timelines with no events have an empty list on `:events` when `include=events` is passed"
        (is (= '()
               (->> (card-timelines-request card-c true) first :events)))))))

(deftest ^:parallel card-timelines-range-test
  (testing "GET /api/timeline/card/:id?include=events&start=TIME&end=TIME"
    (mt/with-temp [:model/Collection collection {:name "Collection"}
                   :model/Card card {:name          "Card A"
                                     :collection_id (u/the-id collection)}
                   :model/Timeline tl-a {:name          "Timeline A"
                                         :collection_id (u/the-id collection)}
                   ;; the temp defaults set {:time_matters true}
                   :model/TimelineEvent _ {:name        "event-a"
                                           :timeline_id (u/the-id tl-a)
                                           :timestamp   #t "2020-01-01T10:00:00.0Z"}
                   :model/TimelineEvent _ {:name        "event-b"
                                           :timeline_id (u/the-id tl-a)
                                           :timestamp   #t "2021-01-01T10:00:00.0Z"}
                   :model/TimelineEvent _ {:name        "event-c"
                                           :timeline_id (u/the-id tl-a)
                                           :timestamp   #t "2022-01-01T10:00:00.0Z"}
                   :model/TimelineEvent _ {:name        "event-d"
                                           :timeline_id (u/the-id tl-a)
                                           :timestamp   #t "2023-01-01T10:00:00.0Z"}]
      (testing "Events are properly filtered when given only `start=` parameter"
        (is (= #{"event-c" "event-d"}
               (event-names (card-timelines-range-request card {:start "2022-01-01T10:00:00.0Z"})))))
      (testing "Events are properly filtered when given only `end=` parameter"
        (is (= #{"event-a" "event-b" "event-c"}
               (event-names (card-timelines-range-request card {:end "2022-01-01T10:00:00.0Z"})))))
      (testing "Events are properly filtered when given `start=` and `end=` parameters"
        (is (= #{"event-b" "event-c"}
               (event-names (card-timelines-range-request card {:start "2020-12-01T10:00:00.0Z"
                                                                :end   "2022-12-01T10:00:00.0Z"})))))
      (mt/with-temp [:model/TimelineEvent _ {:name         "event-a2"
                                             :timeline_id  (u/the-id tl-a)
                                             :timestamp    #t "2020-01-01T10:00:00.0Z"
                                             :time_matters false}]
        (testing "Events are properly filtered considering the `time_matters` state."
          ;; notice that event-a and event-a2 have the same timestamp, but different time_matters states.
          ;; time_matters = false effectively means "We care only about the DATE of this event", so
          ;; if a start or end timestamp is on the same DATE (regardless of time), include the event
          (is (= #{"event-a2"}
                 (event-names (card-timelines-range-request card {:start "2020-01-01T11:00:00.0Z"
                                                                  :end   "2020-12-01T10:00:00.0Z"})))))))))
