(ns metabase.explorations.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.jvm :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- do-with-sample-metrics-archived
  "Temporarily archive any metric cards belonging to the sample database so they
   don't interfere with test assertions. Restores them after `thunk` completes."
  [thunk]
  (let [sample-db-id   (t2/select-one-pk :model/Database :is_sample true)
        metric-ids     (when sample-db-id
                         (t2/select-pks-vec :model/Card
                                            :type :metric
                                            :archived false
                                            :database_id sample-db-id))]
    (if (seq metric-ids)
      (try
        (t2/query {:update :report_card
                   :set    {:archived true}
                   :where  [:in :id metric-ids]})
        (thunk)
        (finally
          (t2/query {:update :report_card
                     :set    {:archived false}
                     :where  [:in :id metric-ids]})))
      (thunk))))

(defmacro with-sample-metrics-archived
  "Execute `body` with any sample-database metric cards temporarily archived."
  [& body]
  `(do-with-sample-metrics-archived (fn [] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    GET /api/exploration/dimensions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dimensions-returns-hydrated-metrics-test
  (testing "GET /api/exploration/dimensions returns metrics referencing dimensions by id"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m1 {:name          "Alpha Metric"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _m2 {:name          "Beta Metric"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions")
              metrics  (:metrics response)
              groups   (:dimension_groups response)
              dim-ids  (set (mapcat #(map :id (:dimensions %)) groups))]
          (is (= 2 (count metrics)))
          (is (every? #(contains? % :dimension_ids) metrics))
          (is (every? #(not (contains? % :dimensions)) metrics))
          (is (every? #(contains? % :dimension_mappings) metrics))
          (testing "every group has a name and a non-empty dimension list"
            (is (every? :name groups))
            (is (every? #(seq (:dimensions %)) groups)))
          (testing "every metric's dimension_ids appear in some group"
            (doseq [m metrics]
              (is (every? #(contains? dim-ids %) (:dimension_ids m))))))))))

(deftest dimensions-search-by-name-test
  (testing "GET /api/exploration/dimensions filters case-insensitively by metric name"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m1 {:name          "Revenue"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _m2 {:name          "Order Count"
                                      :type          :metric
                                      :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions" :q "reven")]
          (is (= 1 (count (:metrics response))))
          (is (= "Revenue" (:name (first (:metrics response))))))))))

(deftest dimensions-search-by-dimension-display-name-test
  (testing "GET /api/exploration/dimensions matches metrics whose dimension display-name contains q"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card metric {:name          "Sales"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [hydrated (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
              dim-name (some-> hydrated :dimensions first :display_name)]
          (is (some? dim-name) "metric should have at least one hydrated dimension with a display_name")
          (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions"
                                               :q (subs dim-name 0 (min 3 (count dim-name))))]
            (is (some #(= (:id metric) (:id %)) (:metrics response))
                "metric should be returned because a dimension display-name matched")))))))

(deftest dimensions-search-no-match-test
  (testing "GET /api/exploration/dimensions returns empty lists when nothing matches"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _m {:name          "Hello"
                                     :type          :metric
                                     :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions"
                                             :q "zzz_no_such_thing_zzz")]
          (is (= [] (:metrics response)))
          (is (= [] (:dimension_groups response))))))))

(deftest dimensions-respects-collection-perms-test
  (testing "GET /api/exploration/dimensions excludes metrics in collections the user can't read"
    (with-sample-metrics-archived
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/Card _hidden {:name          "Hidden Metric"
                                            :type          :metric
                                            :collection_id (:id collection)
                                            :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [response (mt/user-http-request :rasta :get 200 "exploration/dimensions")]
            (is (not-any? #(= "Hidden Metric" (:name %)) (:metrics response)))))))))

(defn- valid-metric-card [user-id]
  {:type          :metric
   :creator_id    user-id
   :dataset_query {:database 1
                   :type     :query
                   :query    {:source-table 1
                              :aggregation  [[:count]]}}})

(deftest exploration-create-persists-everything-and-runs-test
  (testing "POST / creates an exploration with one thread, persists selections, and materializes queries"
    (mt/with-temp [:model/User u {:email "create@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [body {:name         "Why is revenue down"
                  :description  "Q3 dip"
                  :prompt       "break down by region"
                  :metrics      [{:card_id (:id metric)
                                  :dimension_mappings [{:dimension_id "d1"
                                                        :table_id 1
                                                        :target ["field" {} 1]}]}]
                  :dimensions   [{:dimension_id "d1" :display_name "Total"
                                  :effective_type "type/Number"}]
                  :timeline_ids [(:id tl)]}
            resp (mt/user-http-request u :post 200 "exploration" body)
            thread (-> resp :threads first)
            q      (-> thread :queries first)]
        (is (= "Why is revenue down" (:name resp)))
        (is (= 1 (count (:threads resp))))
        (is (= "break down by region" (:prompt thread)))
        (is (some? (:started_at thread)))
        (is (= 1 (count (:metrics thread))))
        (is (= 1 (count (:dimensions thread))))
        (is (= 1 (count (:timelines thread))))
        (is (= 1 (count (:queries thread))))
        (is (= "d1" (:dimension_id q)))
        (is (= "pending" (:status q)))
        (let [mp  (lib-be/application-database-metadata-provider 1)
              qry (lib/query mp (:dataset_query q))
              brk (first (lib/breakouts qry))]
          (is (= 1 (count (lib/breakouts qry)))
              "snapshot MBQL adds a breakout from the dimension's target")
          (is (= :default (:strategy (lib/binning brk)))
              "numeric dim picks up default auto-binning"))))))

(deftest exploration-create-applies-default-binning-test
  (testing "POST / picks a sensible default temporal bucket / numeric binning per dim type"
    (mt/with-temp [:model/User u {:email "binning@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [body {:name    "binning"
                  :metrics [{:card_id (:id metric)
                             :dimension_mappings [{:dimension-id "dt"  :table-id 1 :target ["field" {} 1]}
                                                  {:dimension-id "d"   :table-id 1 :target ["field" {} 2]}
                                                  {:dimension-id "t"   :table-id 1 :target ["field" {} 3]}
                                                  {:dimension-id "n"   :table-id 1 :target ["field" {} 4]}
                                                  {:dimension-id "lat" :table-id 1 :target ["field" {} 5]}
                                                  {:dimension-id "s"   :table-id 1 :target ["field" {} 6]}]}]
                  :dimensions [{:dimension_id "dt"  :effective_type "type/DateTime"}
                               {:dimension_id "d"   :effective_type "type/Date"}
                               {:dimension_id "t"   :effective_type "type/Time"}
                               {:dimension_id "n"   :effective_type "type/Number"}
                               {:dimension_id "lat" :effective_type "type/Float" :semantic_type "type/Latitude"}
                               {:dimension_id "s"   :effective_type "type/Text"}]}
            resp    (mt/user-http-request u :post 200 "exploration" body)
            mp      (lib-be/application-database-metadata-provider 1)
            by-dim  (into {} (for [q (-> resp :threads first :queries)]
                               [(:dimension_id q) (->> (:dataset_query q)
                                                       (lib/query mp)
                                                       lib/breakouts
                                                       first)]))]
        (testing "DateTime dim → :month bucket"
          (is (= :month (lib/raw-temporal-bucket (get by-dim "dt"))))
          (is (nil? (lib/binning (get by-dim "dt")))))
        (testing "Date dim → :day bucket"
          (is (= :day (lib/raw-temporal-bucket (get by-dim "d")))))
        (testing "Time dim → :hour bucket"
          (is (= :hour (lib/raw-temporal-bucket (get by-dim "t")))))
        (testing "Number dim → default auto-binning"
          (is (= :default (:strategy (lib/binning (get by-dim "n")))))
          (is (nil? (lib/raw-temporal-bucket (get by-dim "n")))))
        (testing "Coordinate (semantic Latitude over Float) → default auto-binning, not raw number path"
          (is (= :default (:strategy (lib/binning (get by-dim "lat"))))))
        (testing "Non-numeric / non-temporal dim → no bucket"
          (is (nil? (lib/binning (get by-dim "s"))))
          (is (nil? (lib/raw-temporal-bucket (get by-dim "s")))))))))

(deftest exploration-create-materializes-metric-x-dimension-matrix-test
  (testing "POST / creates one ExplorationQuery per (metric, dimension) pair"
    (mt/with-temp [:model/User u {:email "matrix@example.com"}
                   :model/Card m1 (valid-metric-card (:id u))
                   :model/Card m2 (valid-metric-card (:id u))]
      (let [mapping  [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}
                      {:dimension_id "d2" :table_id 1 :target ["field" {} 2]}]
            body     {:name "matrix"
                      :metrics [{:card_id (:id m1) :dimension_mappings mapping}
                                {:card_id (:id m2) :dimension_mappings mapping}]
                      :dimensions [{:dimension_id "d1"}
                                   {:dimension_id "d2"}]}
            resp     (mt/user-http-request u :post 200 "exploration" body)
            queries  (-> resp :threads first :queries)]
        (is (= 4 (count queries)) "2 metrics × 2 dimensions = 4 queries")
        (is (= #{[(:id m1) "d1"] [(:id m1) "d2"]
                 [(:id m2) "d1"] [(:id m2) "d2"]}
               (set (map (juxt :card_id :dimension_id) queries))))
        (is (every? #(= "pending" (:status %)) queries))))))

(deftest exploration-create-without-selections-test
  (testing "POST / works without metrics/dimensions/timelines (drafty exploration)"
    (mt/with-temp [:model/User u {:email "empty@example.com"}]
      (let [resp (mt/user-http-request u :post 200 "exploration" {:name "empty"})]
        (is (= 1 (count (:threads resp))))
        (is (zero? (count (-> resp :threads first :metrics))))
        (is (zero? (count (-> resp :threads first :queries))))))))

(deftest exploration-get-permissions-test
  (testing "Only the creator (or a superuser) can GET an exploration"
    (mt/with-temp [:model/User owner {:email "p-owner@example.com"}
                   :model/User other {:email "p-other@example.com"}]
      (let [{eid :id} (mt/user-http-request owner :post 200 "exploration" {:name "private"})]
        (mt/user-http-request other :get 403 (format "exploration/%d" eid))
        (let [resp (mt/user-http-request owner :get 200 (format "exploration/%d" eid))]
          (is (= eid (:id resp))))))))

(deftest exploration-create-skips-pairs-without-mapping-test
  (testing "POST / drops (metric, dimension) pairs where the metric has no mapping for the dimension"
    (mt/with-temp [:model/User u {:email "applicability@example.com"}
                   :model/Card revenue (valid-metric-card (:id u))
                   :model/Card signups (valid-metric-card (:id u))]
      (let [body {:name "applicability"
                  :metrics [{:card_id (:id revenue)
                             :dimension_mappings [{:dimension_id "plan"   :table_id 1 :target ["field" {} 1]}]}
                            {:card_id (:id signups)
                             :dimension_mappings [{:dimension_id "plan"   :table_id 1 :target ["field" {} 2]}
                                                  {:dimension_id "channel" :table_id 1 :target ["field" {} 3]}]}]
                  :dimensions [{:dimension_id "plan"} {:dimension_id "channel"}]}
            resp     (mt/user-http-request u :post 200 "exploration" body)
            queries  (-> resp :threads first :queries)]
        (is (= 3 (count queries))
            "revenue×plan, signups×plan, signups×channel — revenue×channel is dropped")
        (is (= #{[(:id revenue) "plan"]
                 [(:id signups) "plan"]
                 [(:id signups) "channel"]}
               (set (map (juxt :card_id :dimension_id) queries))))
        (is (= [0 1 2] (sort (map :position queries)))
            "positions are sequential with no gaps from filtered pairs")))))

(deftest exploration-create-names-queries-by-metric-and-dimension-test
  (testing "POST / sets each query's name to '{metric} by {dimension}' using the dimension's display_name"
    (mt/with-temp [:model/User u {:email "naming@example.com"}
                   :model/Card revenue (assoc (valid-metric-card (:id u)) :name "Revenue")]
      (let [body {:name "naming"
                  :metrics    [{:card_id (:id revenue)
                                :dimension_mappings [{:dimension_id "country" :table_id 1 :target ["field" {} 1]}
                                                     {:dimension_id "no-name" :table_id 1 :target ["field" {} 2]}]}]
                  :dimensions [{:dimension_id "country" :display_name "Country"}
                               {:dimension_id "no-name"}]}
            resp     (mt/user-http-request u :post 200 "exploration" body)
            queries  (-> resp :threads first :queries)
            by-dim   (into {} (map (juxt :dimension_id :name) queries))]
        (is (= "Revenue by Country" (get by-dim "country"))
            "uses the metric Card name and the dimension's display_name")
        (is (= "Revenue by no-name" (get by-dim "no-name"))
            "falls back to dimension_id when display_name is absent")))))

(deftest exploration-list-queries-endpoint-test
  (testing "GET /:id/queries returns lightweight summaries without dataset_query"
    (mt/with-temp [:model/User u {:email "list@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "list"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            eid       (:id resp)
            summaries (mt/user-http-request u :get 200 (format "exploration/%d/queries" eid))]
        (is (= 1 (count summaries)))
        (let [s (first summaries)]
          (is (contains? s :status))
          (is (= "pending" (:status s)))
          (is (contains? s :position))
          (is (not (contains? s :dataset_query)) "dataset_query must not leak")
          (is (not (contains? s :result_data)) "result blob must not leak")
          (is (contains? s :interestingness_score) "score is included via the result-table left-join")
          (is (nil? (:interestingness_score s)) "pending queries have no result row, hence nil score"))))))

(deftest exploration-list-queries-includes-score-from-result-test
  (testing "GET /:id/queries surfaces the score on done queries via the result-table left-join"
    (mt/with-temp [:model/User u {:email "score-list@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "score-list"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            eid (:id resp)
            qid (-> resp :threads first :queries first :id)]
        (t2/insert! :model/ExplorationQueryResult
                    {:exploration_query_id  qid
                     :result_data           (byte-array [0])
                     :interestingness_score 0.42})
        (let [s (-> (mt/user-http-request u :get 200 (format "exploration/%d/queries" eid)) first)]
          (is (= 0.42 (:interestingness_score s))))))))

(deftest exploration-list-queries-permissions-test
  (testing "GET /:id/queries enforces the same read-check as the parent exploration"
    (mt/with-temp [:model/User owner {:email "lq-owner@example.com"}
                   :model/User other {:email "lq-other@example.com"}]
      (let [{eid :id} (mt/user-http-request owner :post 200 "exploration" {:name "lq-private"})]
        (mt/user-http-request other :get 403 (format "exploration/%d/queries" eid))))))

(defn- store-fake-result!
  "Insert an ExplorationQueryResult that mirrors the worker's serialization format so the
  result endpoint can replay it."
  [query-id qp-result]
  (let [bytes (cache.impl/do-with-serialization
               (fn [in result-fn]
                 (in qp-result)
                 (result-fn)))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id query-id
                 :result_data          bytes})))

(defn- mark-done! [query-id]
  (t2/update! :model/ExplorationQuery query-id {:status "done"}))

(deftest exploration-query-result-streams-stored-result-test
  (testing "GET /query/:id streams the stored worker result as JSON"
    (mt/with-temp [:model/User u {:email "result@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp     (mt/user-http-request u :post 200 "exploration"
                                           {:name "result"
                                            :metrics [{:card_id (:id metric)
                                                       :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                            :dimensions [{:dimension_id "d1"}]})
            qid      (-> resp :threads first :queries first :id)
            qp-out   {:status :completed
                      :data   {:cols [{:name "x"} {:name "y"}]
                               :rows [["a" 1] ["b" 2]]}
                      :row_count 2}]
        (store-fake-result! qid qp-out)
        (mark-done! qid)
        (let [body (mt/user-http-request u :get 202 (format "exploration/query/%d" qid))]
          (is (= [["a" 1] ["b" 2]] (-> body :data :rows))
              "rows from the stored qp-result are streamed back")
          (is (= [{:name "x"} {:name "y"}] (-> body :data :cols))
              "cols metadata round-trips through the streaming rff"))))))

(deftest exploration-query-result-409-when-not-done-test
  (testing "GET /query/:id returns 409 with status info while the query is still pending"
    (mt/with-temp [:model/User u {:email "pending@example.com"}
                   :model/Card metric (valid-metric-card (:id u))]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "pending"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)
            body (mt/user-http-request u :get 409 (format "exploration/query/%d" qid))]
        (is (= "pending" (:status body)))
        (is (= qid (:id body)))))))

(deftest exploration-query-result-permissions-test
  (testing "GET /query/:id enforces the parent exploration's read check"
    (mt/with-temp [:model/User owner {:email "qr-owner@example.com"}
                   :model/User other {:email "qr-other@example.com"}
                   :model/Card metric (valid-metric-card (:id owner))]
      (let [resp (mt/user-http-request owner :post 200 "exploration"
                                       {:name "qr-private"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]})
            qid  (-> resp :threads first :queries first :id)]
        (mt/user-http-request other :get 403 (format "exploration/query/%d" qid))))))

(deftest exploration-cascade-delete-test
  (testing "Deleting an exploration cascades to threads, selections, and queries"
    (mt/with-temp [:model/User u {:email "cd@example.com"}
                   :model/Card metric (valid-metric-card (:id u))
                   :model/Timeline tl {:creator_id (:id u)}]
      (let [resp (mt/user-http-request u :post 200 "exploration"
                                       {:name "cascade"
                                        :metrics [{:card_id (:id metric)
                                                   :dimension_mappings [{:dimension_id "d1" :table_id 1 :target ["field" {} 1]}]}]
                                        :dimensions [{:dimension_id "d1"}]
                                        :timeline_ids [(:id tl)]})
            eid  (:id resp)
            tid  (-> resp :threads first :id)]
        (t2/delete! :model/Exploration :id eid)
        (is (zero? (t2/count :model/ExplorationThread :exploration_id eid)))
        (is (zero? (t2/count :model/ExplorationThreadMetric :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadDimension :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationThreadTimeline :exploration_thread_id tid)))
        (is (zero? (t2/count :model/ExplorationQuery :exploration_thread_id tid)))))))
