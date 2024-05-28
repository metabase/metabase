(ns metabase.api.timeline-test
  "Tests for /api/timeline endpoints."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.http-client :as client]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.timeline :refer [Timeline]]
   [metabase.models.timeline-event :refer [TimelineEvent]]
   [metabase.server.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest auth-tests
  (testing "Authentication"
    (is (= (get req.util/response-unauthentic :body)
           (client/client :get 401 "/timeline")))
    (is (= (get req.util/response-unauthentic :body)
           (client/client :get 401 "/timeline/1")))))

(deftest list-timelines-test
  (testing "GET /api/timeline"
    (t2.with-temp/with-temp [Collection collection {:name "Important Data"}]
      (let [id        (u/the-id collection)
            events-of (fn [tls]
                        (into #{} (comp (filter (comp #{id} :collection_id))
                                        (map :name))
                              tls))]
        (mt/with-temp [Timeline _ {:name "Timeline A" :collection_id id}
                       Timeline _ {:name "Timeline B" :collection_id id}
                       Timeline _ {:name "Timeline C" :collection_id id :archived true}]
          (testing "check that we only get un-archived timelines"
            (is (= #{"Timeline A" "Timeline B"}
                   (events-of (mt/user-http-request :rasta :get 200 "timeline")))))
          (testing "check that we only get archived timelines when `archived=true`"
            (is (= #{"Timeline C"}
                   (events-of (mt/user-http-request :rasta :get 200 "timeline" :archived true)))))
          (testing "check that `:collection` key is hydrated on each timeline"
            (is (= #{id}
                   (->> (mt/user-http-request :rasta :get 200 "timeline")
                        (filter (comp #{id} :collection_id))
                        (map #(get-in % [:collection :id]))
                        set))))
          (testing "check that `:can_write` key is hydrated"
            (is (every?
                 #(contains? % :can_write)
                 (->> (mt/user-http-request :rasta :get 200 "timeline")
                      (filter (comp #{id} :collection_id))
                      :collection)))))))
    (testing "checks permissions"
      (mt/with-temp [Collection    {coll-id :id} {:name "private collection"}
                     Timeline      tl-a {:name "Timeline A" :collection_id coll-id}
                     Timeline      tl-b {:name "Timeline B" :collection_id coll-id}
                     TimelineEvent _    {:name "Event 1" :timeline_id (u/the-id tl-a)}
                     TimelineEvent _    {:name "Event 2" :timeline_id (u/the-id tl-b)}]
        (letfn [(events-for [user events?]
                  (->> (m/mapply mt/user-http-request user :get 200 "timeline" (when events? {:include "events"}))
                       (filter (comp #{coll-id} :collection_id))))]
          (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
          (testing "a non-admin user cannot see any timelines"
            (is (= [] (events-for :rasta true)))
            (is (= [] (events-for :rasta false))))
          (testing "an admin user can see these timelines"
            (is (partial= [{:name "Timeline A"
                            :events [{:name "Event 1"}]}
                           {:name "Timeline B"
                            :events [{:name "Event 2"}]}]
                          (events-for :crowberto true)))
            (is (partial= [{:name "Timeline A"} {:name "Timeline B"}]
                          (events-for :crowberto false)))))))))

(deftest get-timeline-test
  (testing "GET /api/timeline/:id"
    (mt/with-temp [Timeline tl-a {:name "Timeline A"}
                   Timeline tl-b {:name "Timeline B" :archived true}]
      (testing "check that we get the timeline with the id specified"
        (is (= "Timeline A"
               (->> (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id tl-a)))
                    :name))))
      (testing "check that we hydrate the timeline's `:collection` key"
        (is (= "root"
               (-> (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id tl-a)))
                   (get-in [:collection :id])))))
      (testing "check that `:can_write` key is hydrated"
        (is (contains?
             (->> (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id tl-a)))
                  :collection)
             :can_write)))
      (testing "check that we get the timeline with the id specified, even if the timeline is archived"
        (is (= "Timeline B"
               (->> (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id tl-b)))
                    :name)))))))

(defn- timelines-range-request
  [timeline {:keys [start end]}]
  (apply mt/user-http-request (concat [:rasta :get 200
                                       (str "timeline/" (u/the-id timeline))
                                       :include "events"]
                                      (when start [:start start])
                                      (when end [:end end]))))

(defn- event-names [timeline]
  (->> timeline :events (map :name) set))

(deftest timelines-range-test
  (testing "GET /api/timeline/:id?include=events&start=TIME&end=TIME"
    (mt/with-temp [Collection    collection {:name "Collection"}
                   Timeline      tl-a       {:name          "Timeline A"
                                             :collection_id (u/the-id collection)}
                   ;; the temp defaults set {:time_matters true}
                   TimelineEvent _          {:name        "event-a"
                                                      :timeline_id (u/the-id tl-a)
                                                      :timestamp   #t "2020-01-01T10:00:00.0Z"}
                   TimelineEvent _          {:name        "event-b"
                                             :timeline_id (u/the-id tl-a)
                                             :timestamp   #t "2021-01-01T10:00:00.0Z"}
                   TimelineEvent _          {:name        "event-c"
                                             :timeline_id (u/the-id tl-a)
                                             :timestamp   #t "2022-01-01T10:00:00.0Z"}
                   TimelineEvent _          {:name        "event-d"
                                             :timeline_id (u/the-id tl-a)
                                             :timestamp   #t "2023-01-01T10:00:00.0Z"}]
      (testing "Events are properly filtered when given only `start=` parameter"
        (is (= #{"event-c" "event-d"}
               (event-names (timelines-range-request tl-a {:start "2022-01-01T10:00:00.0Z"})))))
      (testing "Events are properly filtered when given only `end=` parameter"
        (is (= #{"event-a" "event-b" "event-c"}
               (event-names (timelines-range-request tl-a {:end "2022-01-01T10:00:00.0Z"})))))
      (testing "Events are properly filtered when given `start=` and `end=` parameters"
        (is (= #{"event-b" "event-c"}
               (event-names (timelines-range-request tl-a {:start "2020-12-01T10:00:00.0Z"
                                                           :end   "2022-12-01T10:00:00.0Z"})))))
      (t2.with-temp/with-temp [TimelineEvent _event-a2 {:name         "event-a2"
                                                        :timeline_id  (u/the-id tl-a)
                                                        :timestamp    #t "2020-01-01T10:00:00.0Z"
                                                        :time_matters false}]
        (testing "Events are properly filtered considering the `time_matters` state."
          ;; notice that event-a and event-a2 have the same timestamp, but different time_matters states.
          ;; time_matters = false effectively means "We care only about the DATE of this event", so
          ;; if a start or end timestamp is on the same DATE (regardless of time), include the event
          (is (= #{"event-a2"}
                 (event-names (timelines-range-request tl-a {:start "2020-01-01T11:00:00.0Z"
                                                             :end   "2020-12-01T10:00:00.0Z"})))))))))

(deftest create-timeline-test
  (testing "POST /api/timeline"
    (mt/with-model-cleanup [Timeline]
      (t2.with-temp/with-temp [Collection collection {:name "Important Data"}]
        (let [id (u/the-id collection)]
          (testing "Create a new timeline"
            ;; make an API call to create a timeline
            (mt/user-http-request :rasta :post 200 "timeline"
                                  {:name          "Rasta's TL"
                                   :default       false
                                   :creator_id    (u/the-id (mt/fetch-user :rasta))
                                   :collection_id id})
            (testing "check the collection to see if the timeline is there"
              (is (= "Rasta's TL"
                     (-> (t2/select-one Timeline :collection_id id) :name))))
            (testing "Check that the icon is 'star' by default"
              (is (= "star"
                     (-> (t2/select-one-fn :icon Timeline :collection_id id)))))))))))

(deftest update-timeline-test
  (testing "PUT /api/timeline/:id"
    (t2.with-temp/with-temp [Collection _ {:name "Important Data"}
                             Timeline tl-a {:name "Timeline A" :archived true}
                             Timeline tl-b {:name "Timeline B"}
                             TimelineEvent _ {:name        "event-a"
                                              :timeline_id (u/the-id tl-b)}
                             TimelineEvent _ {:name        "event-b"
                                              :timeline_id (u/the-id tl-b)}]
      (testing "check that we successfully updated a timeline"
        (is (false?
             (->> (mt/user-http-request :rasta :put 200 (str "timeline/" (u/the-id tl-a)) {:archived false})
                  :archived))))
      (testing "check that we archive all events in a timeline when the timeline is archived"
        ;; update the timeline to be archived
        (mt/user-http-request :rasta :put 200 (str "timeline/" (u/the-id tl-b)) {:archived true})
        (is (true?
             (->> (t2/select TimelineEvent :timeline_id (u/the-id tl-b))
                  (map :archived)
                  (every? true?)))))
      (testing "check that we un-archive all events in a timeline when the timeline is un-archived"
        ;; since we archived in the previous step, we unarchive the same timeline here.
        (mt/user-http-request :rasta :put 200 (str "timeline/" (u/the-id tl-b)) {:archived false})
        (is (true?
             (->> (t2/select TimelineEvent :timeline_id (u/the-id tl-b))
                  (map :archived)
                  (every? false?))))))))

(defn- include-events-request
  [timeline archived?]
  (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id timeline))
                        :include "events" :archived archived?))

(deftest timeline-hydration-test
  (testing "GET /api/timeline/:id?include=events"
    (t2.with-temp/with-temp [Collection collection {:name "Important Data"}
                             Timeline empty-tl {:name          "Empty TL"
                                                :collection_id (u/the-id collection)}
                             Timeline unarchived-tl {:name          "Un-archived Events TL"
                                                     :collection_id (u/the-id collection)}
                             Timeline archived-tl {:name          "Archived Events TL"
                                                   :collection_id (u/the-id collection)}
                             Timeline timeline {:name          "All Events TL"
                                                :collection_id (u/the-id collection)}
                             TimelineEvent _ {:name        "event-a"
                                              :timeline_id (u/the-id unarchived-tl)}
                             TimelineEvent _ {:name        "event-b"
                                              :timeline_id (u/the-id unarchived-tl)}
                             TimelineEvent _ {:name        "event-c"
                                              :timeline_id (u/the-id archived-tl)
                                              :archived    true}
                             TimelineEvent _ {:name        "event-d"
                                              :timeline_id (u/the-id archived-tl)
                                              :archived    true}
                             TimelineEvent _ {:name        "event-e"
                                              :timeline_id (u/the-id timeline)}
                             TimelineEvent _ {:name        "event-f"
                                              :timeline_id (u/the-id timeline)
                                              :archived    true}]
      (testing "a timeline with no events returns an empty list"
        (is (= '() (:events (include-events-request empty-tl false)))))
      (testing "a timeline with both (un-)archived events"
        (testing "Returns only unarchived events when archived is false"
          (is (= #{"event-e"}
                 (event-names (include-events-request timeline false)))))
        (testing "Returns all events when archived is true"
          (is (= #{"event-e" "event-f"}
                 (event-names (include-events-request timeline true)))))))))
