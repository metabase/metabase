(ns metabase-enterprise.content-diagnostics.api-test
  "Who may invoke the content-diagnostics endpoints at all. The reads take the same union as the FE
  `canAccessContentDiagnostics` guard. What an authorized caller then sees is collection-filtered in
  `api.common` and covered by the per-finding-type suites."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(def ^:private read-endpoints
  ["ee/content-diagnostics/stale"
   "ee/content-diagnostics/slow"
   "ee/content-diagnostics/imbalanced"
   "ee/content-diagnostics/duplicated"])

(defn- check-reads
  "Assert `status` on every finding-list endpoint - they share one gate, so they share one row of the
  matrix."
  [user status]
  (doseq [endpoint read-endpoints]
    (testing endpoint
      (mt/user-http-request user :get status endpoint))))

(deftest read-endpoints-are-all-covered-test
  (testing "every GET the namespace defines is exercised by this suite's matrix"
    ;; The gate is namespace-wide middleware, so a new endpoint is gated automatically - but it would go
    ;; uncovered here. Fail loudly instead, so whoever adds one classifies it.
    (is (= (set (map #(str "ee/content-diagnostics" %)
                     (keep (fn [[method route]] (when (= :get method) route))
                           (keys (:api/endpoints (meta (the-ns 'metabase-enterprise.content-diagnostics.api)))))))
           (set read-endpoints)))))

(deftest reads-allow-superuser-test
  (testing "GET reads serve a superuser"
    (mt/with-premium-features #{:content-diagnostics}
      (check-reads :crowberto 200))))

(deftest reads-reject-plain-user-test
  (testing "GET reads 403 a plain authed user - no analyst flag, no `:monitoring` grant"
    ;; The behavior change: before the gate these answered 200 with an empty-or-filtered list.
    (mt/with-premium-features #{:content-diagnostics}
      (check-reads :rasta 403))))

(deftest reads-reject-unauthenticated-test
  (testing "an unauthenticated request still gets 401, not the audience gate's 403"
    ;; Pins the middleware order in `api/routes`: `+auth` must stay outermost.
    (mt/with-premium-features #{:content-diagnostics}
      (doseq [endpoint read-endpoints]
        (testing endpoint
          (mt/client :get 401 endpoint))))))

(deftest reads-allow-data-analyst-test
  (testing "GET reads serve a non-admin data analyst"
    ;; This arm is a plain `core_user` column, so it needs no premium feature beyond the mount's.
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (check-reads :rasta 200)))))

(deftest reads-allow-monitoring-grantee-test
  (testing "GET reads serve a non-admin holding the `:monitoring` application permission"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
      (mt/with-user-in-groups [group {:name "Content Diagnostics Monitoring"}
                               user  [group]]
        (testing "before the grant"
          (check-reads user 403))
        (perms/grant-application-permissions! group :monitoring)
        (testing "after the grant"
          (check-reads user 200))))))

(deftest reads-monitoring-arm-needs-advanced-permissions-test
  (testing "without `:advanced-permissions` the `:monitoring` arm is the OSS stub, so a grantee stays 403"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-user-in-groups [group {:name "Content Diagnostics Monitoring"}
                               user  [group]]
        (perms/grant-application-permissions! group :monitoring)
        (check-reads user 403)))))

(deftest feature-gate-precedes-audience-gate-test
  (testing "an unlicensed instance still answers 402, not 403 - the mount's feature gate runs first"
    ;; Both gates would reject a plain user; the license answer has to stay the visible one, since it is
    ;; what tells an operator the feature is unavailable rather than the caller unauthorized.
    (mt/with-premium-features #{}
      (check-reads :rasta 402))))
