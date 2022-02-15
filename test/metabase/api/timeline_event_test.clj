(ns metabase.api.timeline-event-test
  "Tests for /api/timeline-event endpoints"
  (:require [clojure.test :refer :all]
            [metabase.http-client :as http]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.models.timeline-event :refer [TimelineEvent]]
            [metabase.server.middleware.util :as middleware.u]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest auth-tests
  (testing "Authentication"
    (is (= (get middleware.u/response-unauthentic :body)
           (http/client :get 401 "/timeline-event")))
    (is (= (get middleware.u/response-unauthentic :body)
           (http/client :get 401 "/timeline-event/1")))))

(deftest get-timeline-event-test
  (testing "GET /api/timeline-event/:id"
    (mt/with-temp TimelineEvent [event {:name "Very Important Event"
                                        :timestamp "NOW"}]
      (testing "check that we get the timeline-event with `id`"
        (is (= (->> (mt/user-http-request :rasta :get 200 "timeline-event")
                    (filter #(= (:collection_id %) id))
                    (map :name)
                    set)
               #{"Timeline A" "Timeline B"}))))))

#_(deftest create-timeline-event-test
  (testing "POST /api/timeline-event"
    (mt/with-temp Collection [collection {:name "Important Data"}]
      (let [id          (u/the-id collection)
            tl-defaults {:creator_id    (u/the-id (mt/fetch-user :rasta))
                         :collection_id id}]
        (testing "Create a new timeline"
          ;; make an API call to create a timeline
          (mt/user-http-request :rasta :post 200 "timeline" (merge tl-defaults {:name "Rasta's TL"}))
          ;; check the collection to see if the timeline is there
          (is (= (-> (db/select-one Timeline :collection_id id) :name)
                 "Rasta's TL")))))))

#_(deftest update-timeline-event-test
  (testing "PUT /api/timeline-event/:id"
    (mt/with-temp Collection [collection {:name "Important Data"}]
      (let [id          (u/the-id collection)
            tl-defaults {:creator_id    (u/the-id (mt/fetch-user :rasta))
                         :collection_id id}]
        (mt/with-temp* [Timeline [tl-a (merge tl-defaults {:name "Timeline A" :archived true})]]
          (testing "check that we successfully updated a timeline"
            (is (= (->> (mt/user-http-request :rasta :put 200 (str "timeline/" (u/the-id tl-a)) {:archived false})
                        :archived)
                   false))))))))
