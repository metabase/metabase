(ns metabase.timeline.api.timeline-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
    (mt/with-model-cleanup [:model/Collection]
      (let [coll-a (first (collection/create-collections! [{:location "/" :name "Collection A"}]))
            coll-b (first (collection/create-collections! [{:location "/" :name "Collection B"}]))
            coll-c (first (collection/create-collections! [{:location "/" :name "Collection C"}]))]
        (mt/with-temp [:model/Timeline tl-a      {:name          "Timeline A"
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
                   (->> (collection-timelines-request coll-c true) first :events)))))))))

(deftest timeline-events-archived-test
  (testing "GET /api/timeline/:id?include=events"
    (mt/with-temp [:model/Timeline      tl        {:name "Timeline"}
                   :model/TimelineEvent _event    {:name "event" :timeline_id (u/the-id tl)}
                   :model/TimelineEvent _event-old {:name "event-old" :timeline_id (u/the-id tl) :archived true}]
      (testing "without `archived` returns only un-archived events"
        (is (= #{"event"}
               (event-names [(mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id tl))
                                                   :include "events")]))))
      (testing "with `archived=true` returns archived and un-archived events"
        (is (= #{"event" "event-old"}
               (event-names [(mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id tl))
                                                   :include "events" :archived true)])))))))

(deftest collection-archived-timelines-test
  (testing "GET /api/timeline/collection/:id?archived=true returns only archived timelines"
    (mt/with-model-cleanup [:model/Collection]
      (let [coll-b (first (collection/create-collections! [{:location "/" :name "Collection B"}]))]
        (mt/with-temp [:model/Timeline _tl-b     {:name          "Timeline B"
                                                  :collection_id (u/the-id coll-b)}
                       :model/Timeline _tl-b-old {:name          "Timeline B-old"
                                                  :collection_id (u/the-id coll-b)
                                                  :archived      true}]
          (is (= #{"Timeline B-old"}
                 (timeline-names (mt/user-http-request :rasta :get 200
                                                       (str "timeline/collection/" (u/the-id coll-b)) :archived true)))))))))

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

(deftest timeline-entity-id-test
  (testing "GET, PUT and DELETE /api/timeline/:id accept an entity id"
    (mt/with-temp [:model/Timeline {timeline-id :id entity-id :entity_id} {:name "Entity id timeline"}]
      (testing "GET"
        (is (=? {:id timeline-id :name "Entity id timeline"}
                (mt/user-http-request :crowberto :get 200 (str "timeline/" entity-id)))))
      (testing "PUT"
        (is (=? {:id timeline-id :name "Renamed by entity id"}
                (mt/user-http-request :crowberto :put 200 (str "timeline/" entity-id)
                                      {:name "Renamed by entity id"}))))
      (testing "an unknown entity id is a 404"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 "timeline/aaaaaaaaaaaaaaaaaaaaa"))))
      (testing "DELETE"
        (mt/user-http-request :crowberto :delete 204 (str "timeline/" entity-id))
        (is (not (t2/exists? :model/Timeline :id timeline-id)))))))

(deftest timeline-body-entity-ids-test
  (testing "POST and PUT /api/timeline take an entity id for the Collection"
    (mt/with-model-cleanup [:model/Timeline]
      (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id}   {}
                     :model/Collection {other-id :id other-eid :entity_id} {}]
        (let [{timeline-id :id} (mt/user-http-request :crowberto :post 200 "timeline"
                                                      {:name "Timeline by entity id" :collection_id coll-eid})]
          (is (= coll-id (t2/select-one-fn :collection_id :model/Timeline :id timeline-id)))
          (mt/user-http-request :crowberto :put 200 (str "timeline/" timeline-id) {:collection_id other-eid})
          (is (= other-id (t2/select-one-fn :collection_id :model/Timeline :id timeline-id))))))))
