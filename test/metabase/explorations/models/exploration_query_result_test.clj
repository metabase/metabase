(ns metabase.explorations.models.exploration-query-result-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.events.test-util :as events.tu]
   [metabase.explorations.models.exploration-query-result :as exploration-query-result]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- venues-count-query
  "A valid metric query. These rows are inserted raw (no `with-temp` cleanup) and so outlive the test,
  and `metabase.health-inspector` scores every non-archived card in the app DB against the query
  schema — an invalid `dataset_query` here would drag that score down for the whole run."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(def ^:private stats-with-warehouse-values
  "The shape `compute-chart-stats` produces for a categorical chart: each top category's `:name`
  comes straight from the result rows, so this column holds verbatim warehouse values. Every value
  in it is a plain JSON value except the `:chart-type` tag, which the schema-driven codec restores."
  {:chart-type :categorical
   :series     [{:name           "Count"
                 :top-categories [{:name "ACME Corp" :value 41}
                                  {:name "Initech"   :value 12}]
                 :category-count 2}]})

(def ^:private time-series-stats
  "Every keyword-valued field a time-series result carries. JSON has no keywords, so these are what
  the `mc/encode`/`mc/decode` pair over `::chart-stats` exists to preserve — the storage format does
  not get to decide that the data model uses strings. The series name holds a `/`, which rides
  through as a value rather than as a map key."
  {:chart-type   :time-series
   :series-count 1
   :series       [{:name        "Revenue / Cost"
                   :summary     {:min 1.0 :max 9.0 :mean 5.0 :median 5.0 :std-dev 2.5 :range 8.0}
                   :trend       {:direction :strongly-increasing :overall-change-pct 12.5}
                   :volatility  {:level :moderate :coefficient-of-variation 0.3}
                   :patterns    [{:type :spike :description "a spike in March"}]
                   :data-points 7}]
   :correlations [{:series-a "Revenue / Cost" :series-b "Units"
                   :coefficient 0.91 :strength :strong :direction :positive}]})

(def ^:private histogram-stats
  "A histogram's estimated percentiles, under the named fields the producer computes."
  {:chart-type   :histogram
   :series-count 1
   :series       [{:name         "Total"
                   :total-count  120
                   :distribution {:estimated-percentiles {:p25 1.5 :p50 2.5 :p75 5.0 :p90 9.0 :p95 9.5 :p99 9.9}
                                  :estimated-quartiles   {:q1 1.5 :median 2.5 :q3 9.0 :iqr 7.5}}}]})

(def ^:private single-point-stats
  "A single-point series has no standard deviation. `util/nan->nil` drops the `##NaN` at the source,
  so nothing non-finite — which JSON cannot represent — ever reaches the column."
  {:chart-type :categorical
   :series     [{:name    "Count"
                 :summary {:min 5.0 :max 5.0 :mean 5.0 :median 5.0 :std-dev nil :range 0.0}}]})

(defn- query-result-row!
  "Insert one `exploration_query_result` carrying `stats`, returning its id."
  [stats]
  (let [creator (mt/user->id :lucky)
        card    (t2/insert-returning-pk! :model/Card
                                         {:name "m" :type :metric :creator_id creator
                                          :database_id (mt/id) :dataset_query (venues-count-query)
                                          :display "table" :visualization_settings {}})
        expl    (t2/insert-returning-pk! :model/Exploration {:name "eqr" :creator_id creator})
        thread  (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id expl :position 0})
        block   (t2/insert-returning-pk! :model/ExplorationBlock {:exploration_thread_id thread})
        page    (t2/insert-returning-pk! :model/ExplorationPage
                                         {:exploration_block_id block :card_id card
                                          :dimension_id "d1" :query_type "default"})
        eq      (t2/insert-returning-pk! :model/ExplorationQuery
                                         {:exploration_thread_id thread :card_id card :page_id page
                                          :database_id (mt/id)
                                          :dimension_id "d1" :status "done" :position 0})
        sr      (t2/insert-returning-pk! :model/StoredResult
                                         {:result_data       (byte-array [0])
                                          :creator_id        creator
                                          :database_id       (mt/id)
                                          :dataset_query     {}
                                          :row_count         1
                                          :data_access_token {}})]
    (t2/insert-returning-pk! :model/ExplorationQueryResult
                             {:exploration_query_id eq
                              :stored_result_id     sr
                              :chart_stats          stats
                              :metric_description   "a description"})))

(defn- raw-chart-stats
  [id]
  (:chart_stats (t2/query-one {:select [:chart_stats]
                               :from   [(t2/table-name :model/ExplorationQueryResult)]
                               :where  [:= :id id]})))

(deftest chart-stats-is-stored-as-json-test
  (testing "chart_stats is plain JSON at rest — the keywords the stats carry in memory are written
            out as strings, and nothing keyword-shaped survives into the stored bytes"
    (encryption-test/with-secret-key nil
      (let [id (query-result-row! stats-with-warehouse-values)]
        (is (= {"chart-type" "categorical"
                "series"     [{"name"           "Count"
                               "top-categories" [{"name" "ACME Corp" "value" 41}
                                                 {"name" "Initech"   "value" 12}]
                               "category-count" 2}]}
               (json/decode (raw-chart-stats id))))))))

(deftest chart-stats-round-trip-test
  (testing "chart_stats survives the round trip with its keywords intact. The stored bytes hold
            strings (see above); the schema-driven codec is what puts `:chart-type`, a trend's
            `:direction`, a volatility `:level`, a pattern's `:type` and a correlation's
            `:strength`/`:direction` back on the way out"
    (doseq [stats [stats-with-warehouse-values time-series-stats histogram-stats single-point-stats]]
      (let [id (query-result-row! stats)]
        (is (= stats (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id))
            (pr-str (:chart-type stats)))))))

(deftest chart-stats-is-encrypted-at-rest-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "chart_stats embeds verbatim warehouse values (top categories' names), the same material
            as the result blob and the descriptions beside it — both of which are encrypted at rest.
            It must not sit in the clear next to them."
      (encryption-test/with-secret-key "chart-stats-encryption-test-key"
        (let [id  (query-result-row! stats-with-warehouse-values)
              raw (raw-chart-stats id)]
          (testing "the stored bytes do not contain the warehouse value"
            (is (string? raw))
            (is (not (str/includes? raw "ACME Corp"))
                "top-category names were stored in plaintext"))
          (testing "and it still decrypts back to the original stats"
            (is (= stats-with-warehouse-values
                   (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id)))))))))

(deftest chart-stats-rejects-plaintext-when-key-set-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with a key set, encrypted chart_stats reads back but a plaintext value written directly via SQL is rejected"
      (encryption-test/with-secret-key "chart-stats-encryption-test-key"
        (let [id (query-result-row! stats-with-warehouse-values)]
          (is (= stats-with-warehouse-values
                 (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id)))
          (t2/query-one {:update (t2/table-name :model/ExplorationQueryResult)
                         :set    {:chart_stats (json/encode stats-with-warehouse-values)}
                         :where  [:= :id id]})
          (is (thrown? clojure.lang.ExceptionInfo
                       (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id))))))))

(deftest chart-stats-plaintext-allowed-without-key-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with no key set there is nothing to decrypt with, so plaintext chart_stats reads back as-is"
      (encryption-test/with-secret-key nil
        (let [id (query-result-row! nil)]
          (t2/query-one {:update (t2/table-name :model/ExplorationQueryResult)
                         :set    {:chart_stats (json/encode stats-with-warehouse-values)}
                         :where  [:= :id id]})
          (is (= stats-with-warehouse-values
                 (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id))))))))

(deftest chart-stats-unparseable-reads-as-nil-test
  ;; isolated app DB: writes a deliberately malformed value, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "an unparseable blob is logged and read as nil rather than breaking the whole select"
      (encryption-test/with-secret-key nil
        (let [id (query-result-row! nil)]
          (t2/query-one {:update (t2/table-name :model/ExplorationQueryResult)
                         :set    {:chart_stats "{not json ]["}
                         :where  [:= :id id]})
          (is (nil? (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Card                {card-id :id}        {:type :metric}
                 :model/Exploration         {exploration-id :id} {}
                 :model/ExplorationThread   {thread-id :id}      {:exploration_id exploration-id}
                 :model/ExplorationBlock    {block-id :id}       {:exploration_thread_id thread-id}
                 :model/ExplorationPage     {page-id :id}        {:exploration_block_id block-id :card_id card-id
                                                                  :dimension_id "d1" :query_type "default"}]
    (mt/with-model-cleanup [:model/StoredResult]
      (let [rows (fn [n]
                   (mapv (fn [i]
                           {:stored_result_id     (t2/insert-returning-pk! :model/StoredResult
                                                                           {:result_data   (byte-array [1 2 3])
                                                                            :database_id   (mt/id)
                                                                            :dataset_query (venues-count-query)})
                            :exploration_query_id (t2/insert-returning-pk! :model/ExplorationQuery
                                                                           {:exploration_thread_id thread-id :card_id card-id :page_id page-id
                                                                            :database_id (mt/id) :dimension_id (str "d" i) :position i})})
                         (range n)))]
        (exploration-query-result/create-query-results! (rows 1))
        (let [small (rows 2)
              large (rows 6)]
          (is (= (events.tu/statement-count! #(exploration-query-result/create-query-results! small))
                 (events.tu/statement-count! #(exploration-query-result/create-query-results! large)))))))))

(deftest create-ephemeral-card-statement-count-does-not-grow-with-queries-test
  (testing "building a composite card from stamped snapshots of one query reads its source queries, results and snapshots in as many statements for many as for few"
    (mt/with-temp [:model/Card              {card-id :id}        {:type :metric :dataset_query (venues-count-query)}
                   :model/Exploration       {exploration-id :id} {}
                   :model/ExplorationThread {thread-id :id}      {:exploration_id exploration-id}
                   :model/ExplorationBlock  {block-id :id}       {:exploration_thread_id thread-id}
                   :model/ExplorationPage   {page-id :id}        {:exploration_block_id block-id :card_id card-id
                                                                  :dimension_id "d1" :query_type "default"}]
      (mt/with-model-cleanup [:model/Card :model/StoredResult]
        (let [query        (venues-count-query)
              result-bytes (#'exploration-query-result/serialize-qp-result
                            {:status    :completed
                             :data      {:cols [{:name "x" :source :breakout} {:name "y" :source :aggregation}]
                                         :rows [["a" 3] ["b" 1]]}
                             :row_count 2})
              stamp        (query-perms/stamped-resolved-source-ids query (query-perms/query->resolved-source-ids query))
              query-ids    (fn [n]
                             (vec (for [i (range n)]
                                    (let [eq-id (t2/insert-returning-pk! :model/ExplorationQuery
                                                                         {:exploration_thread_id thread-id :card_id card-id
                                                                          :page_id page-id :database_id (mt/id)
                                                                          :dimension_id (str "d" i) :position i
                                                                          :status "done" :dataset_query query})
                                          sr-id (t2/insert-returning-pk! :model/StoredResult
                                                                         {:result_data         result-bytes
                                                                          :creator_id          (mt/user->id :rasta)
                                                                          :database_id         (mt/id)
                                                                          :dataset_query       query
                                                                          :row_count           2
                                                                          :data_access_token   {}
                                                                          :resolved_source_ids stamp})]
                                      (exploration-query-result/create-query-results! [{:exploration_query_id eq-id
                                                                                        :stored_result_id     sr-id}])
                                      eq-id))))
              build!       (fn [eq-ids]
                             (mt/with-current-user (mt/user->id :rasta)
                               (exploration-query-result/create-ephemeral-card-for-exploration-queries!
                                eq-ids nil nil (mt/fetch-user :rasta) {:display "bar" :visualization-settings {}})))]
          (build! (query-ids 2))
          (let [small (query-ids 3)
                large (query-ids 8)]
            (is (= (t2/with-call-count [call-count] (build! small) (call-count))
                   (t2/with-call-count [call-count] (build! large) (call-count))))))))))
