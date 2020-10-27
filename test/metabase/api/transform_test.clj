(ns metabase.api.transform-test
  (:require [clojure.test :refer :all]
            [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [permissions :as perms]
             [permissions-group :as perms-group]]
            [metabase.query-processor :as qp]
            [metabase.test
             [data :as data]
             [domain-entities :refer :all]
             [fixtures :as fixtures]
             [transforms :refer :all]
             [util :as tu]]
            [metabase.test.data.users :as test-users]))

(use-fixtures :once (fixtures/initialize :db))

(defn- test-endpoint
  []
  (format "transform/%s/%s/%s" (data/id) "PUBLIC" "Test transform"))

;; Run the transform and make sure it produces the correct result
(expect
 [[1 "Red Medicine" 4 10.0646 -165.374 3 1.5 4 3 2 1]
  [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0 11 2 1 1]
  [3 "The Apple Pan" 11 34.0406 -118.428 2 2.0 11 2 1 1]]
  (test-users/with-test-user :rasta
    (with-test-transform-specs
      (with-test-domain-entity-specs
        (tu/with-model-cleanup [Card Collection]
          (-> ((test-users/user->client :rasta) :get 200 (test-endpoint))
              first
              :dataset_query
              qp/process-query
              :data
              :rows))))))

(deftest permissions-test
  (testing "GET /api/transform/:db-id/:schema/:transform-name"
    (testing "Do we correctly check for permissions?"
      (try
        (perms/revoke-permissions! (perms-group/all-users) (data/id))
        (is (= "You don't have permissions to do that."
               ((test-users/user->client :rasta) :get 403 (test-endpoint))))
        (finally
          (perms/grant-permissions! (perms-group/all-users) (perms/object-path (data/id))))))))
