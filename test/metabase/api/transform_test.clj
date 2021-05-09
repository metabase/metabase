(ns metabase.api.transform-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.domain-entities :refer :all]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.transforms :refer :all]))

(use-fixtures :once (fixtures/initialize :db))

(defn- test-endpoint []
  (format "transform/%s/%s/%s" (mt/id) "PUBLIC" "Test transform"))

(deftest transform-test
  (testing "GET /api/transform/:db-id/:schema/:transform-name"
    (testing "Run the transform and make sure it produces the correct result"
      (mt/with-test-user :rasta
        (with-test-transform-specs
          (with-test-domain-entity-specs
            (mt/with-model-cleanup [Card Collection]
              (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 1.5 4 3 2 1]
                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0 11 2 1 1]
                      [3 "The Apple Pan" 11 34.0406 -118.428 2 2.0 11 2 1 1]]
                     (-> (mt/user-http-request :rasta :get 200 (test-endpoint))
                         first
                         :dataset_query
                         qp/process-query
                         mt/rows))))))))))

(deftest permissions-test
  (testing "GET /api/transform/:db-id/:schema/:transform-name"
    (testing "Do we correctly check for permissions?"
      (try
        (perms/revoke-permissions! (perms-group/all-users) (mt/id))
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (test-endpoint))))
        (finally
          (perms/grant-permissions! (perms-group/all-users) (perms/object-path (mt/id))))))))
