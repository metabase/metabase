(ns metabase.explorations.models.exploration-query-result-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
    (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                           (lib/aggregate (lib/count))))))

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
                   :distribution {:estimated-percentiles {:p25 1.5 :p50 2.5 :p90 9.0}
                                  :estimated-quartiles   {:q1 1.5 :median 2.5 :q3 9.0 :iqr 7.5}}}]})

(def ^:private single-point-stats
  "A single-point series has no standard deviation. `util/finite->nil` drops the `##NaN` at the
  source, so nothing non-finite — which JSON cannot represent — ever reaches the column."
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
                               :from   [:exploration_query_result]
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
                 (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id))))))))

(deftest chart-stats-rejects-plaintext-when-key-set-test
  (testing "with a key set, encrypted chart_stats reads back but a plaintext value written directly via SQL is rejected"
    (encryption-test/with-secret-key "chart-stats-encryption-test-key"
      (let [id (query-result-row! stats-with-warehouse-values)]
        (is (= stats-with-warehouse-values
               (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id)))
        (t2/query-one {:update :exploration_query_result
                       :set    {:chart_stats (json/encode stats-with-warehouse-values)}
                       :where  [:= :id id]})
        (is (thrown? clojure.lang.ExceptionInfo
                     (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id)))))))

(deftest chart-stats-plaintext-allowed-without-key-test
  (testing "with no key set there is nothing to decrypt with, so plaintext chart_stats reads back as-is"
    (encryption-test/with-secret-key nil
      (let [id (query-result-row! nil)]
        (t2/query-one {:update :exploration_query_result
                       :set    {:chart_stats (json/encode stats-with-warehouse-values)}
                       :where  [:= :id id]})
        (is (= stats-with-warehouse-values
               (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id)))))))

(deftest chart-stats-unparseable-reads-as-nil-test
  (testing "an unparseable blob is logged and read as nil rather than breaking the whole select"
    (encryption-test/with-secret-key nil
      (let [id (query-result-row! nil)]
        (t2/query-one {:update :exploration_query_result
                       :set    {:chart_stats "{not json ]["}
                       :where  [:= :id id]})
        (is (nil? (t2/select-one-fn :chart_stats :model/ExplorationQueryResult :id id)))))))
