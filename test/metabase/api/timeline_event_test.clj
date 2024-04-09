(ns metabase.api.timeline-event-test
  "Tests for /api/timeline-event endpoints"
  (:require
   [clojure.test :refer :all]
   [metabase.http-client :as client]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.timeline :refer [Timeline]]
   [metabase.models.timeline-event :refer [TimelineEvent]]
   [metabase.server.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest auth-tests
  (testing "Authentication"
    (is (= (get req.util/response-unauthentic :body)
           (client/client :get 401 "/timeline-event")))
    (is (= (get req.util/response-unauthentic :body)
           (client/client :get 401 "/timeline-event/1")))))

(deftest get-timeline-event-test
  (testing "GET /api/timeline-event/:id"
    (mt/with-temp [Collection    collection {:name "Important Data"}
                   Timeline      timeline   {:name          "Important Events"
                                             :collection_id (u/the-id collection)}
                   TimelineEvent event      {:name         "Very Important Event"
                                             :timestamp    (java.time.OffsetDateTime/now)
                                             :time_matters false
                                             :timeline_id  (u/the-id timeline)}]
      (testing "check that we get the timeline-event with `id`"
        (is (= "Very Important Event"
               (->> (mt/user-http-request :rasta :get 200 (str "timeline-event/" (u/the-id event)))
                    :name)))))))

(deftest create-timeline-event-test
  (testing "POST /api/timeline-event"
    (mt/with-temp [Collection    collection {:name "Important Data"}
                   Timeline      timeline   {:name          "Important Events"
                                             :collection_id (u/the-id collection)}]
      (testing "create a timeline event"
        ;; make an API call to create a timeline
        (mt/user-http-request :rasta :post 200 "timeline-event" {:name         "Rasta Migrates to Florida for the Winter"
                                                                 :timestamp    (java.time.OffsetDateTime/now)
                                                                 :timezone     "US/Pacific"
                                                                 :time_matters false
                                                                 :timeline_id  (u/the-id timeline)}))
      ;; check the Timeline to see if the event is there
      (is (= "Rasta Migrates to Florida for the Winter"
             (-> (t2/select-one TimelineEvent :timeline_id (u/the-id timeline)) :name))))))

(deftest update-timeline-event-test
  (testing "PUT /api/timeline-event/:id"
    (testing "Can archive the timeline event"
      (mt/with-temp [Collection    collection {:name "Important Data"}
                     Timeline      timeline   {:name          "Important Events"
                                               :collection_id (u/the-id collection)}
                     TimelineEvent event      {:name         "Very Important Event"
                                               :timeline_id  (u/the-id timeline)}]
        (testing "check that we can adjust the timestamp for timeline-event with `id`"
          (is (= "2022-01-01T00:00:00Z"
                 (->> (mt/user-http-request :rasta :put 200 (str "timeline-event/" (u/the-id event)) {:timestamp "2022-01-01"})
                      :timestamp))))
        (testing "check that we have archived the timeline-event with `id`"
          (is (true?
               (->> (mt/user-http-request :rasta :put 200 (str "timeline-event/" (u/the-id event)) {:archived true})
                    :archived))))))))

(deftest delete-timeline-event-test
  (testing "DELETE /api/timeline-event/:id"
    (mt/with-temp [Collection    {collection-id :id} {:name "Example Data"}
                   Timeline      {timeline-id :id}   {:name "Some Events"
                                                      :collection_id collection-id}
                   TimelineEvent {event-id :id}      {:name "Example Event"
                                                      :timeline_id timeline-id}]
      (testing "delete an existing timeline-event `id`"
        (is (= nil
               (mt/user-http-request :rasta :delete 204 (str "timeline-event/" event-id))))
        (is (= "Not found."
               (mt/user-http-request :rasta :get 404 (str "timeline-event/" event-id)))))
      (testing "delete a non-existent timeline-event `id`"
        (is (= "Not found."
               (mt/user-http-request :rasta :get 404 (str "timeline-event/" Integer/MAX_VALUE))))))))
