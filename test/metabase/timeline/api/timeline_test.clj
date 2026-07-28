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

(deftest collection-archived-timelines-test
  (testing "GET /api/timeline/collection/:id?archived=true returns only archived timelines"
    (mt/with-temp [:model/Collection coll-b {:name "Collection B"}
                   :model/Timeline _tl-b     {:name          "Timeline B"
                                              :collection_id (u/the-id coll-b)}
                   :model/Timeline _tl-b-old {:name          "Timeline B-old"
                                              :collection_id (u/the-id coll-b)
                                              :archived      true}]
      (is (= #{"Timeline B-old"}
             (timeline-names (mt/user-http-request :rasta :get 200
                                                   (str "timeline/collection/" (u/the-id coll-b)) :archived true)))))))

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

(deftest list-timelines-id-filter-test
  (testing "GET /api/timeline?id="
    (mt/with-temp [:model/Collection coll-a {:name "Collection A"}
                   :model/Collection coll-b {:name "Collection B"}
                   :model/Timeline tl-a  {:name          "Timeline A"
                                          :collection_id (u/the-id coll-a)}
                   :model/Timeline tl-b  {:name          "Timeline B"
                                          :collection_id (u/the-id coll-b)}
                   :model/Timeline _tl-c {:name          "Timeline C"
                                          :collection_id (u/the-id coll-b)}]
      (testing "only the requested timelines are returned"
        (is (= #{"Timeline A" "Timeline B"}
               (timeline-names (mt/user-http-request :rasta :get 200 "timeline"
                                                     :id [(u/the-id tl-a) (u/the-id tl-b)])))))
      (testing "a single id can be passed"
        (is (= #{"Timeline A"}
               (timeline-names (mt/user-http-request :rasta :get 200 "timeline"
                                                     :id (u/the-id tl-a))))))
      (testing "requested timelines in unreadable collections are silently omitted"
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-b)
        (is (= #{"Timeline A"}
               (timeline-names (mt/user-http-request :rasta :get 200 "timeline"
                                                     :id [(u/the-id tl-a) (u/the-id tl-b)]))))))))

(deftest list-timelines-events-range-test
  (testing "GET /api/timeline?include=events&start=TIME&end=TIME"
    (mt/with-temp [:model/Collection coll {:name "Collection"}
                   :model/Timeline tl {:name          "Timeline"
                                       :collection_id (u/the-id coll)}
                   ;; the temp defaults set {:time_matters true}
                   :model/TimelineEvent _ {:name        "event-2020"
                                           :timeline_id (u/the-id tl)
                                           :timestamp   #t "2020-01-01T10:00:00.0Z"}
                   :model/TimelineEvent _ {:name        "event-2021"
                                           :timeline_id (u/the-id tl)
                                           :timestamp   #t "2021-01-01T10:00:00.0Z"}
                   :model/TimelineEvent _ {:name        "event-2022"
                                           :timeline_id (u/the-id tl)
                                           :timestamp   #t "2022-01-01T10:00:00.0Z"}]
      (testing "start and end bound the hydrated events"
        (is (= #{"event-2021"}
               (event-names (mt/user-http-request :rasta :get 200 "timeline"
                                                  :id (u/the-id tl)
                                                  :include "events"
                                                  :start "2020-06-01T00:00:00.0Z"
                                                  :end   "2021-06-01T00:00:00.0Z")))))
      (testing "without start/end all unarchived events are returned"
        (is (= #{"event-2020" "event-2021" "event-2022"}
               (event-names (mt/user-http-request :rasta :get 200 "timeline"
                                                  :id (u/the-id tl)
                                                  :include "events"))))))))
