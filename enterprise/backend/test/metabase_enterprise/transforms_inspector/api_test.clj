(ns ^:mb/driver-tests metabase-enterprise.transforms-inspector.api-test
  "Tests for transform inspector endpoints at /api/ee/transforms/:id/inspect*."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest inspect-lens-not-found-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (testing "GET /api/ee/transforms/:id/inspect/:lens-id returns 404 for a nonexistent lens"
      (mt/with-temp [:model/Transform {transform-id :id} {}]
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (is (= "Lens data not available"
                   (:message (mt/user-http-request :lucky :get 404
                                                   (format "ee/transforms/%d/inspect/no-such-lens" transform-id)))))))))))

;;; -------------------------------------------------- Inspector Query API --------------------------------------------------

(deftest inspect-query-execute-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "POST /api/ee/transforms/:id/inspect/:lens-id/query executes a query with inspector context"
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (let [mp     (mt/metadata-provider)
                    query  (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))
                    result (mt/user-http-request :lucky :post 202
                                                 (format "ee/transforms/%d/inspect/generic-summary/query" transform-id)
                                                 {:query query})]
                (testing "returns completed query results"
                  (is (= "completed" (:status result)))
                  (is (pos? (:row_count result)))
                  (is (seq (get-in result [:data :rows]))))
                (testing "context is set to transform-inspector"
                  (is (= "transform-inspector" (:context result))))))))))))

(deftest inspect-query-with-lens-params-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (testing "POST /api/ee/transforms/:id/inspect/:lens-id/query passes lens_params through to query execution"
        (mt/with-temp [:model/Transform {transform-id :id} {}]
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
              (let [mp     (mt/metadata-provider)
                    query  (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))
                    result (mt/user-http-request :lucky :post 202
                                                 (format "ee/transforms/%d/inspect/unmatched-rows/query" transform-id)
                                                 {:query       query
                                                  :lens_params {:join-index 0 :filter-col "status"}})]
                (is (= "completed" (:status result)))
                (is (= "transform-inspector" (:context result)))))))))))

(deftest inspect-query-permissions-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (testing "POST /api/ee/transforms/:id/inspect/:lens-id/query requires transforms permission"
      (mt/with-temp [:model/Transform {transform-id :id} {}]
        (let [mp (mt/metadata-provider)]
          (testing "user without transform permission gets 403"
            (mt/user-http-request :rasta :post 403
                                  (format "ee/transforms/%d/inspect/generic-summary/query" transform-id)
                                  {:query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}))
          (testing "data analysts with transform permission can access"
            (mt/with-data-analyst-role! (mt/user->id :lucky)
              (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
                (is (= "completed"
                       (:status (mt/user-http-request :lucky :post 202
                                                      (format "ee/transforms/%d/inspect/generic-summary/query" transform-id)
                                                      {:query (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))}))))))))))))

(deftest inspect-query-not-found-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (testing "POST /api/ee/transforms/:id/inspect/:lens-id/query returns 404 for non-existent transform"
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/user-http-request :lucky :post 404
                              "ee/transforms/999999/inspect/generic-summary/query"
                              {:query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))})))))

(deftest inspect-query-invalid-params-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (testing "POST /api/ee/transforms/:id/inspect/:lens-id/query validates parameters"
      (mt/with-temp [:model/Transform {transform-id :id} {}]
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (testing "missing query body returns 400"
              (is (some? (:errors (mt/user-http-request :lucky :post 400
                                                        (format "ee/transforms/%d/inspect/generic-summary/query" transform-id)
                                                        {})))))))))))
