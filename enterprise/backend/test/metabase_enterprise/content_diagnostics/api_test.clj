(ns ^:synchronized metabase-enterprise.content-diagnostics.api-test
  "Who may invoke the content-diagnostics endpoints at all. The reads take the same union as the FE
  `canAccessContentDiagnostics` guard. What an authorized caller then sees is collection-filtered in
  `api.common` and covered by the per-finding-type suites."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.api :as cd.api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private read-endpoints
  ["ee/content-diagnostics/counts"
   "ee/content-diagnostics/stale"
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

(defn- default-list-counts
  [user]
  (into {}
        (for [[tab endpoint params] [[:stale "stale" []]
                                     [:duplicated "duplicated" []]
                                     [:slow "slow" []]
                                     [:empty "imbalanced" [:finding-types "empty"]]
                                     [:sparse "imbalanced" [:finding-types "sparse"]]
                                     [:crowded "imbalanced" [:finding-types "crowded"]]]]
          [tab (:total (apply mt/user-http-request user :get 200
                              (str "ee/content-diagnostics/" endpoint)
                              :include-personal-collections true :limit 1 params))])))

(defn- insert-counted-findings!
  [entity-type entity-id finding-types]
  (t2/insert-returning-instances!
   :model/ContentDiagnosticsFinding
   (for [finding-type finding-types]
     {:scan_id         (mt/random-name)
      :entity_type     entity-type
      :entity_kind     entity-type
      :entity_id       entity-id
      :entity_name     "Counter fixture"
      :finding_type    finding-type
      :duration_ms     20000
      :duplicate_count 2
      :content_count   0
      :details         (case finding-type
                         :stale          {:threshold_days 30}
                         :slow           {:slow_entity_ids []}
                         :duplicate_name {:normalized_name "counter fixture" :duplicate_entity_ids []}
                         {:threshold 5 :unit "items"})})))

(deftest counts-default-populations-test
  (testing "counters match the UI's personal-inclusive defaults, excluding archived and missing entities"
    (mt/with-premium-features #{:content-diagnostics}
      (let [baseline (default-list-counts :crowberto)
            expected (merge-with + baseline {:stale 3 :duplicated 4 :slow 4 :empty 4 :sparse 4 :crowded 4})
            finding-types [:stale :duplicate_name :slow :empty :sparse :crowded]
            personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Dashboard {first-id :id} {}
                         :model/Dashboard {second-id :id} {}
                         :model/Dashboard {archived-id :id} {:archived true}
                         :model/Dashboard {personal-dash :id} {:collection_id personal-id}
                         :model/Collection {nested-personal :id} {:location (str "/" personal-id "/")}
                         :model/Dashboard {nested-dash :id} {:collection_id nested-personal}
                         :model/Collection {archived-folder :id} {:archived true}
                         :model/Dashboard {folder-dash :id} {:collection_id archived-folder}]
            (doseq [id [first-id second-id archived-id personal-dash nested-dash folder-dash Integer/MAX_VALUE]]
              (insert-counted-findings! :dashboard id finding-types))
            ;; A partial new scan can leave two active rows. Only the newest may count.
            (insert-counted-findings! :dashboard first-id [:duplicate_name])
            (let [newest-stale (first (insert-counted-findings! :dashboard second-id [:stale]))]
              (t2/update! :model/ContentDiagnosticsFinding (:id newest-stale) {:invalidated_at (t/offset-date-time)}))
            (is (= expected (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/counts")))
            (testing "optional table filters and pagination never narrow badge populations"
              (is (= expected (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/counts"
                                                    :include-personal-collections false :query "no matches"
                                                    :entity-types "card" :finding-types "empty"
                                                    :threshold-days 100000 :min-duration-ms 99999999
                                                    :min-duplicate-count 99 :offset 1000 :limit 1))))
            (is (= expected (default-list-counts :crowberto)))
            (testing "dismissal removes a finding from its tab without collapsing other finding types"
              (let [empty-id (t2/select-one-pk :model/ContentDiagnosticsFinding
                                               :entity_type :dashboard :entity_id first-id :finding_type :empty)]
                (mt/user-http-request :crowberto :post 200 "ee/content-diagnostics/invalidate" {:ids [empty-id]})
                (is (= (update expected :empty dec)
                       (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/counts")))))))))))

(deftest counts-live-collection-visibility-test
  (testing "an analyst's counts follow current collection permissions and moves, not the scan-time collection"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (mt/with-non-admin-groups-no-root-collection-perms
          (let [baseline (default-list-counts :rasta)]
            (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
              (mt/with-temp [:model/Collection {readable :id} {}
                             :model/Collection {hidden :id} {}
                             :model/Dashboard {visible-dash :id} {:collection_id readable}
                             :model/Dashboard {hidden-dash :id} {:collection_id hidden}]
                (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
                (doseq [id [visible-dash hidden-dash]]
                  (insert-counted-findings! :dashboard id [:stale :duplicate_name :slow :empty :sparse :crowded]))
                (is (= (update-vals baseline inc)
                       (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/counts")))
                (t2/update! :model/Dashboard visible-dash {:collection_id hidden})
                (is (= baseline (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/counts")))
                (perms/grant-collection-read-permissions! (perms/all-users-group) hidden)
                (is (= (update-vals baseline #(+ % 2))
                       (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/counts")))))))))))

(deftest counts-transform-entitlements-test
  (testing "transform findings require both an entitled analyst and an enabled transforms feature"
    (mt/with-user-in-groups [group {:name "Counter monitoring"}
                             user [group]]
      (mt/with-premium-features #{:content-diagnostics :advanced-permissions :transforms-basic :hosting}
        (perms/grant-application-permissions! group :monitoring)
        (let [baseline (default-list-counts user)]
          (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
            (mt/with-temp [:model/Transform {transform-id :id} {}]
              (insert-counted-findings! :transform transform-id [:stale :slow :duplicate_name])
              (is (= baseline (mt/user-http-request user :get 200 "ee/content-diagnostics/counts")))
              (mt/with-data-analyst-role! (:id user)
                (is (= (merge-with + baseline {:stale 1 :slow 1 :duplicated 1})
                       (mt/user-http-request user :get 200 "ee/content-diagnostics/counts")))
                (mt/with-premium-features #{:content-diagnostics :advanced-permissions}
                  (is (= baseline (mt/user-http-request user :get 200 "ee/content-diagnostics/counts"))))))))))))
