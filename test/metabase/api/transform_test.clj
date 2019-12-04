(ns metabase.api.transform-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [permissions :as perms]
             [permissions-group :as perms-group]]
            [metabase.query-processor :as qp]
            [metabase.test
             [data :as data]
             [domain-entities :refer :all]
             [transforms :refer :all]
             [util :as tu]]
            [metabase.test.data.users :as test-users]))

(defn- test-endpoint
  []
  (format "transform/%s/%s/%s" (data/id) "PUBLIC" "Test transform"))

;; Run the transform and make sure it produces the correct result
(expect
  [[4 1 10.0646 -165.374 "Red Medicine" 3 1 4 3 2 1]
   [11 2 34.0996 -118.329 "Stout Burgers & Beers" 2 2 11 2 1 1]
   [11 3 34.0406 -118.428 "The Apple Pan" 2 2 11 2 1 1]]
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

;; Do we correctly check for permissions?
(expect
  (try
    (do
      (perms/revoke-permissions! (perms-group/all-users) (data/id))
      (= ((test-users/user->client :rasta) :get 403 (test-endpoint))
         "You don't have permissions to do that."))
    (finally
      (perms/grant-permissions! (perms-group/all-users) (perms/object-path (data/id))))))
