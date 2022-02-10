(ns metabase.api.timeline-test
  "Tests for /api/timeline endpoints."
  (:require [clojure.test :refer :all]
            [metabase.http-client :as http]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.server.middleware.util :as middleware.u]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(comment
  (get middleware.u/response-unauthentic :body)
  (http/client :get 401 "timeline")

  (mt/with-temp Collection [collection {:name "Important Data"}]
    (println collection))

  )

(deftest auth-tests
  (testing "Authentication"
    (is (= (get middleware.u/response-unauthentic :body)
           (http/client :get 401 "collection/root/timeline")))
    (is (= (get middleware.u/response-unauthentic :body)
           (http/client :get 401 "collection/root/timeline/1")))))

(deftest list-timelines-test
  (testing "GET /api/timeline/:id"
    (testing "check that we can see timeline details of a collection with :id"
      (mt/with-temp Collection [collection {:name "Important Data"}]
        (mt/with-temp Timeline [timeline {:name "Important Events"
                                          :creator_id 1
                                          :collection_id (u/the-id collection)}]
          (perms/grant-collection-read-permissions! (group/all-users) collection)
          (is (= "Important Events"
                 (:name (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id timeline))))))))))
  (testing "GET /api/timeline/root"
    (testing "check that we can see timeline details of the root collection"
      (mt/with-temp Timeline [timeline {:name "More Important Events"
                                        :creator_id 1
                                        :collection_id nil}]
        (is (= "More Important Events"
               (:name (mt/user-http-request :rasta :get 200 (str "timeline/" (u/the-id timeline))))))))))
