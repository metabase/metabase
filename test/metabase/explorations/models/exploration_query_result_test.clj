(ns metabase.explorations.models.exploration-query-result-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]
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
  comes straight from the result rows, so this column holds verbatim warehouse values."
  {:chart-type :categorical
   :series     {"Count" {:top-categories [{:name "ACME Corp" :value 41}
                                          {:name "Initech"   :value 12}]
                         :category-count 2}}})

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

(deftest chart-stats-round-trip-test
  (testing "chart_stats survives the EDN transform with its keyword and string-keyed shape intact"
    (let [id (query-result-row! stats-with-warehouse-values)]
      (is (= stats-with-warehouse-values
             (t2/select-one-fn :chart_stats :model/ExplorationQueryResult 'id id))))))

(deftest chart-stats-is-encrypted-at-rest-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "chart_stats embeds verbatim warehouse values (top categories' names), the same material
            as the result blob and the descriptions beside it — both of which are encrypted at rest.
            It must not sit in the clear next to them."
      (encryption-test/with-secret-key "chart-stats-encryption-test-key"
        (let [id  (query-result-row! stats-with-warehouse-values)
              raw (:chart_stats (t2/query-one {:select [:chart_stats]
                                               :from   [:exploration_query_result]
                                               :where  [:= :id id]}))]
          (testing "the stored bytes do not contain the warehouse value"
            (is (string? raw))
            (is (not (str/includes? raw "ACME Corp"))
                "top-category names were stored in plaintext"))
          (testing "and it still decrypts back to the original stats"
            (is (= stats-with-warehouse-values
                   (t2/select-one-fn :chart_stats :model/ExplorationQueryResult 'id id)))))))))

(deftest chart-stats-rejects-plaintext-when-key-set-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with a key set, encrypted chart_stats reads back but a plaintext value written directly via SQL is rejected"
      (encryption-test/with-secret-key "chart-stats-encryption-test-key"
        (let [id (query-result-row! stats-with-warehouse-values)]
          (is (= stats-with-warehouse-values
                 (t2/select-one-fn :chart_stats :model/ExplorationQueryResult 'id id)))
          (t2/query-one {:update :exploration_query_result
                         :set    {:chart_stats (pr-str stats-with-warehouse-values)}
                         :where  [:= :id id]})
          (is (thrown? clojure.lang.ExceptionInfo
                       (t2/select-one-fn :chart_stats :model/ExplorationQueryResult 'id id))))))))

(deftest chart-stats-plaintext-allowed-without-key-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with no key set there is nothing to decrypt with, so plaintext chart_stats reads back as-is"
      (encryption-test/with-secret-key nil
        (let [id (query-result-row! nil)]
          (t2/query-one {:update :exploration_query_result
                         :set    {:chart_stats (pr-str stats-with-warehouse-values)}
                         :where  [:= :id id]})
          (is (= stats-with-warehouse-values
                 (t2/select-one-fn :chart_stats :model/ExplorationQueryResult 'id id))))))))
