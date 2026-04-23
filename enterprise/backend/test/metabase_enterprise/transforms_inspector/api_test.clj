(ns ^:mb/driver-tests metabase-enterprise.transforms-inspector.api-test
  "Tests for transform inspector endpoints at /api/ee/transforms/:id/inspect*."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus-test :as prometheus-test]
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

;;; -------------------------------------------------- Metrics --------------------------------------------------

;; All metric assertions share one `with-prometheus-system!` (expensive to boot).
;; Each `testing` block uses a distinct (metric, labels) combo, so no `prometheus/clear!` is
;; needed to flush the metrics.
(deftest inspect-metrics-test
  (mt/with-premium-features #{:transforms-basic :transforms-python}
    (mt/with-prometheus-system! [_ system]
      (mt/with-temp [:model/Transform {transform-id :id} {}]
        (testing "Permission-denied failures do NOT bump inspector counters"
          (mt/user-http-request :rasta :get 403
                                (format "ee/transforms/%d/inspect" transform-id))
          (mt/user-http-request :rasta :get 403
                                (format "ee/transforms/%d/inspect/generic-summary" transform-id))
          (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-transforms/inspector-discovery
                                                          {:status "ok"})))
          (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-transforms/inspector-discovery
                                                          {:status "error"})))
          (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-transforms/inspector-lens
                                                          {:lens-type  "generic-summary"
                                                           :complexity "fast"
                                                           :status     "ok"}))))
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
            (testing "GET /api/ee/transforms/:id/inspect bumps inspector-discovery{status=ok}"
              (mt/user-http-request :lucky :get 200
                                    (format "ee/transforms/%d/inspect" transform-id))
              (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/inspector-discovery
                                                              {:status "ok"}))))
            (testing "GET /api/ee/transforms/:id/inspect/:lens-id bumps inspector-lens{status=ok} with complexity label"
              (mt/user-http-request :lucky :get 200
                                    (format "ee/transforms/%d/inspect/generic-summary" transform-id))
              (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/inspector-lens
                                                              {:lens-type  "generic-summary"
                                                               :complexity "fast"
                                                               :status     "ok"}))))
            (testing "404 from non-applicable lens bumps inspector-lens{lens-type=unknown,complexity=unknown,status=error}"
              ;; Unknown lens-ids clamp both :lens-type and :complexity to \"unknown\" to prevent
              ;; Prometheus cardinality explosion from arbitrary path-param values.
              (mt/user-http-request :lucky :get 404
                                    (format "ee/transforms/%d/inspect/no-such-lens" transform-id))
              (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-transforms/inspector-lens
                                                              {:lens-type  "unknown"
                                                               :complexity "unknown"
                                                               :status     "error"}))))
            ;; Run the failure case before the success case so we can assert that a QP {:status :failed}
            ;; bumps the error bucket but NOT the ok bucket — the specific regression covered by the
            ;; streaming-error-path fix in api.clj (detecting :failed status from qp/process-query).
            (testing "POST .../query bumps inspector-query-duration-ms{status=error} when the QP returns {:status :failed}"
              (mt/user-http-request :lucky :post
                                    (format "ee/transforms/%d/inspect/generic-summary/query" transform-id)
                                    {:query {:database (mt/id)
                                             :type     :query
                                             :query    {:source-table 99999999}}})
              (is (pos? (:count (mt/metric-value system :metabase-transforms/inspector-query-duration-ms
                                                 {:lens-type "generic-summary" :status "error"}))))
              (is (zero? (:count (mt/metric-value system :metabase-transforms/inspector-query-duration-ms
                                                  {:lens-type "generic-summary" :status "ok"})))))
            (testing "POST .../query bumps inspector-query-duration-ms{status=ok} on success"
              (let [mp    (mt/metadata-provider)
                    query (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))]
                (mt/user-http-request :lucky :post 202
                                      (format "ee/transforms/%d/inspect/generic-summary/query" transform-id)
                                      {:query query})
                (is (pos? (:count (mt/metric-value system :metabase-transforms/inspector-query-duration-ms
                                                   {:lens-type "generic-summary" :status "ok"}))))))))))))
