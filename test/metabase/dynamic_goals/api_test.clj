(ns metabase.dynamic-goals.api-test
  "Tests for `POST /api/dynamic-goal/values`."
  {:clj-kondo/config '{:linters
                       ;; saved cards and dashboards are the input here, as in [[metabase.query-processor.card-test]]
                       {:discouraged-var {metabase.test/with-temp           {:level :off}
                                          toucan2.tools.with-temp/with-temp {:level :off}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.dynamic-goals.core :as dynamic-goals]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(defn- count-query [table]
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id table) :aggregation [[:count]]}})

(defn- goal-values
  "`POST /api/dynamic-goal/values` for `sources` as `user`, with `body` merged in."
  [user sources & {:as body}]
  (mt/user-http-request user :post 202 "dynamic-goal/values" (merge {:sources sources} body)))

(deftest requires-a-session-test
  (is (= (get api.response/response-unauthentic :body)
         (client/client :post 401 "dynamic-goal/values" {:sources []}))))

(deftest request-validation-test
  (testing "an unrecognized source type is a 400"
    (mt/user-http-request :crowberto :post 400 "dynamic-goal/values" {:sources [{:type "dashboard" :id 1}]}))
  (testing "a non-positive id is a 400"
    (mt/user-http-request :crowberto :post 400 "dynamic-goal/values" {:sources [{:type "card" :id 0}]}))
  (testing "an unknown key is dropped, like on every endpoint"
    (is (= {} (mt/user-http-request :crowberto :post 202 "dynamic-goal/values" {:sources [] :parameters []})))
    (is (=? {:card {Integer/MAX_VALUE {:error_type "not-found"}}}
            (mt/user-http-request :crowberto :post 202 "dynamic-goal/values"
                                  {:sources [{:type "card" :id Integer/MAX_VALUE :max_rows 3}]}))))
  (testing "`sources` is required"
    (mt/user-http-request :crowberto :post 400 "dynamic-goal/values" {}))
  (testing "a request runs at most 20 distinct sources, like a saved chart"
    (let [sources (fn [n] (mapv (fn [id] {:type "card" :id id}) (range 1 (inc n))))]
      (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (constantly {:status "completed"})]
        (testing "past 20, each extra source fails on its own"
          (let [results (:card (goal-values :crowberto (sources 21)))]
            (is (= 20 (count (filter #(= "completed" (:status %)) (vals results)))))
            (is (=? {:status "failed" :error_type "too-many-sources"} (get results 21)))))
        (testing "duplicates count once"
          (is (= #{"completed"}
                 (set (map :status (vals (:card (goal-values :crowberto (take 25 (cycle (sources 3))))))))))))
      (testing "an absurdly long list is a 400"
        (mt/user-http-request :crowberto :post 400 "dynamic-goal/values" {:sources (sources 1001)})))))

(deftest response-shape-test
  (testing "the body is keyed by source type, then id, with one result per source"
    (mt/with-temp [:model/Card    {card-id :id}    {:dataset_query (count-query :checkins)}
                   :model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (let [mp (mt/metadata-provider)]
                                                                  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                      (lib/aggregate (lib/count))))}]
      ;; the test client keywordizes the type key and parses numeric keys back to ints
      (is (=? {:card    {card-id           {:status "completed"
                                            :data   {:cols [{:name "count"}] :rows [[1000]]}}
                         Integer/MAX_VALUE {:status "failed" :error_type "not-found" :error string?}}
               :measure {measure-id {:status "completed" :data {:rows [[100]]}}}}
              (goal-values :crowberto [{:type "card" :id card-id :columns ["count"]}
                                       {:type "card" :id Integer/MAX_VALUE}
                                       {:type "measure" :id measure-id}])))
      (testing "no sources, an empty body"
        (is (= {} (goal-values :crowberto [])))))))

(deftest runs-as-the-current-user-test
  (testing "a card the caller can't read fails on its own; the request still succeeds"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id}    {}
                     :model/Collection {ok-coll-id :id} {}
                     :model/Card       {hidden-id :id}  {:collection_id coll-id :dataset_query (count-query :checkins)}
                     :model/Card       {ok-id :id}      {:collection_id ok-coll-id :dataset_query (count-query :venues)}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) ok-coll-id)
        (is (=? {:card {hidden-id {:status "failed" :error "You don't have permissions to do that."}
                        ok-id     {:status "completed" :data {:rows [[100]]}}}}
                (goal-values :rasta [{:type "card" :id hidden-id} {:type "card" :id ok-id}])))))))

(deftest dashboard-id-and-ignore-cache-test
  (testing "`dashboard_id` and `ignore_cache` reach the runner"
    (let [seen (atom nil)]
      (mt/with-dynamic-fn-redefs [dynamic-goals/goal-values (fn [sources & {:as opts}]
                                                              (reset! seen [sources opts])
                                                              {})]
        (goal-values :crowberto [{:type "card" :id 1}] :dashboard_id 7 :ignore_cache true))
      (is (=? [[{:type "card" :id 1}] {:dashboard-id 7 :ignore-cache? true :check-sources nil}]
              @seen))))
  (testing "a goal run is recorded as the current user, on the given dashboard"
    (mt/with-temp [:model/Card      {goal-id :id} {:dataset_query (count-query :venues)}
                   :model/Dashboard {dash-id :id} {}]
      (goal-values :rasta [{:type "card" :id goal-id}] :dashboard_id dash-id)
      (process-userland-query/flush-execution-metadata!)
      (is (=? [{:card_id goal-id :executor_id (mt/user->id :rasta) :dashboard_id dash-id :context :dynamic-goal}]
              (t2/select [:model/QueryExecution :card_id :executor_id :dashboard_id :context]
                         :context :dynamic-goal :card_id goal-id))))))

(deftest data-app-request-is-checked-test
  (testing "a request that is not a data app's has no source check"
    (let [seen (atom ::unset)]
      (mt/with-dynamic-fn-redefs [dynamic-goals/goal-values (fn [_sources & {:keys [check-sources]}]
                                                              (reset! seen check-sources)
                                                              {})]
        (goal-values :crowberto [{:type "card" :id 1}]))
      (is (nil? @seen)))))
