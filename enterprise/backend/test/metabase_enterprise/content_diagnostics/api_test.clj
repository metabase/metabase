(ns metabase-enterprise.content-diagnostics.api-test
  "Who may invoke the content-diagnostics endpoints at all. The reads take the same union as the FE
  `canAccessContentDiagnostics` guard. What an authorized caller then sees is collection-filtered in
  `api.common` and covered by the per-finding-type suites."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.api :as cd.api]
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

(def ^:private write-endpoints
  ["ee/content-diagnostics/invalidate"])

(defn- check-writes
  "Assert `status` on every POST endpoint. The body names an id no finding has, so a 200 changes nothing."
  [user status]
  (doseq [endpoint write-endpoints]
    (testing endpoint
      (mt/user-http-request user :post status endpoint {:ids [Integer/MAX_VALUE]}))))

(defn- routes-for
  [method]
  (set (map #(str "ee/content-diagnostics" %)
            (keep (fn [[m route]] (when (= method m) route))
                  (keys (:api/endpoints (meta (the-ns 'metabase-enterprise.content-diagnostics.api))))))))

(deftest read-endpoints-are-all-covered-test
  (testing "every GET the namespace defines is exercised by this suite's matrix"
    ;; The gate is namespace-wide middleware, so a new endpoint is gated automatically - but it would go
    ;; uncovered here. Fail loudly instead, so whoever adds one classifies it.
    (is (= (routes-for :get)
           (set read-endpoints)))))

(deftest write-endpoints-are-all-covered-test
  (testing "every POST the namespace defines is exercised by this suite's matrix"
    (is (= (routes-for :post)
           (set write-endpoints)))))

(deftest writes-access-matrix-test
  (testing "POST writes take the same audience gate as the reads"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
      (testing "superuser"
        (check-writes :crowberto 200))
      (testing "plain authed user"
        (check-writes :rasta 403))
      (testing "unauthenticated"
        (doseq [endpoint write-endpoints]
          (testing endpoint
            (mt/client :post 401 endpoint {:ids [Integer/MAX_VALUE]}))))
      (testing "non-admin data analyst"
        (mt/with-data-analyst-role! (mt/user->id :rasta)
          (check-writes :rasta 200)))
      (testing "non-admin `:monitoring` grantee"
        (mt/with-user-in-groups [group {:name "Content Diagnostics Monitoring"}
                                 user  [group]]
          (perms/grant-application-permissions! group :monitoring)
          (check-writes user 200))))
    (testing "an unlicensed instance answers 402"
      (mt/with-premium-features #{}
        (check-writes :rasta 402)))))

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
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (check-reads :rasta 200)))))

(deftest reads-analyst-arm-needs-advanced-permissions-test
  (testing "without `:advanced-permissions` the role is not entitled, so a non-admin data analyst stays 403"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (check-reads :rasta 403)))))

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

(defn- remembered-sort-columns
  "The `sort_column` values the user-key-value schema accepts, read from the edn that declares them."
  []
  (->> (slurp (io/resource "user_key_value_types/content_diagnostics.edn"))
       edn/read-string
       (tree-seq coll? seq)
       ;; keyed on the :sort_column entry, not on one of the enum's own members - a second
       ;; [:enum … "name" …] added earlier in the file would otherwise silently redirect this
       (filter #(and (vector? %) (= :sort_column (first %))))
       first
       last
       rest
       set))

(deftest remembered-sort-column-covers-every-endpoint-test
  (testing "the user-key-value `sort_column` enum accepts exactly what the endpoints accept"
    ;; All four pages persist their params with `withSetLastUsedParams: true`, so a sort the endpoint
    ;; honours but the stored schema rejects works for the current visit and is then silently forgotten -
    ;; the PUT 400s and nothing surfaces it. `collection-name` and `finding-type` were both in that gap.
    (let [served (into #{} (comp (mapcat keys) (map name))
                       [@#'cd.api/stale-sort-column->field
                        @#'cd.api/slow-sort-column->field
                        @#'cd.api/imbalanced-sort-column->field
                        @#'cd.api/duplicated-sort-column->field])]
      (is (= served (remembered-sort-columns)))
      ;; the PUTs below write :rasta's real content_diagnostics/stale preference row in the shared app DB
      (mt/with-model-cleanup [:model/UserKeyValue]
        (testing "and each one really survives the PUT the pages make"
          (doseq [col (sort served)]
            (testing col
              (mt/user-http-request :rasta :put 200 "user-key-value/namespace/content_diagnostics/key/stale"
                                    {:value {:sort_column col}}))))
        (testing "a column no endpoint serves is still rejected"
          (mt/user-http-request :rasta :put 400 "user-key-value/namespace/content_diagnostics/key/stale"
                                {:value {:sort_column "not-a-sortable-column"}}))))))
