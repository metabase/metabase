(ns metabase.metrics.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.util :as qp.util]
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
;;; |                                              GET /api/metric/                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-metric-returns-accessible-metric-test
  (testing "GET /api/metric returns metric the user has access to"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                         :type          :metric
                                         :description   "A test metric"
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "metric")]
          (is (= 1 (:total response)))
          (is (= 500 (:limit response)))
          (is (= 0 (:offset response)))
          (is (= 1 (count (:data response))))
          (let [returned-metric (first (:data response))]
            (is (= (:id metric) (:id returned-metric)))
            (is (= "Test Metric" (:name returned-metric)))
            (is (= "A test metric" (:description returned-metric)))))))))

(deftest list-metric-limit-test
  (testing "GET /api/metric respects limit parameter"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _metric1 {:name          "Metric A"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _metric2 {:name          "Metric B"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _metric3 {:name          "Metric C"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "metric" :limit 2)]
          (is (= 3 (:total response)))
          (is (= 2 (:limit response)))
          (is (= 2 (count (:data response)))))))))

(deftest list-metric-offset-test
  (testing "GET /api/metric respects offset parameter"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _metric1 {:name          "Metric A"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _metric2 {:name          "Metric B"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card _metric3 {:name          "Metric C"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request :rasta :get 200 "metric" :offset 1 :limit 2)]
          (is (= 3 (:total response)))
          (is (= 1 (:offset response)))
          (is (= 2 (count (:data response)))))))))

(deftest list-metric-excludes-archived-test
  (testing "GET /api/metric does not return archived metric"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _metric {:name          "Archived Metric"
                                          :type          :metric
                                          :archived      true
                                          :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (is (= 0 (:total (mt/user-http-request :rasta :get 200 "metric"))))))))

(deftest list-metric-excludes-non-metric-test
  (testing "GET /api/metric does not return non-metric cards"
    (with-sample-metrics-archived
      (mt/with-temp [:model/Card _card {:name          "Regular Card"
                                        :type          :question
                                        :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (is (= 0 (:total (mt/user-http-request :rasta :get 200 "metric"))))))))

(deftest list-metric-hydrates-collection-test
  (testing "GET /api/metric hydrates collection information"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"}
                   :model/Card       _metric    {:name          "Metric in Collection"
                                                 :type          :metric
                                                 :collection_id (:id collection)
                                                 :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response        (mt/user-http-request :rasta :get 200 "metric")
            returned-metric (first (:data response))]
        (is (= (:id collection) (:collection_id returned-metric)))
        (is (= (:id collection) (get-in returned-metric [:collection :id])))
        (is (= "Test Collection" (get-in returned-metric [:collection :name])))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            GET /api/metric/:id                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-metric-test
  (testing "GET /api/metric/:id"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :description   "A test metric"
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
        (is (= (:id metric) (:id response)))
        (is (= "Test Metric" (:name response)))
        (is (= "A test metric" (:description response)))))))

(deftest fetch-metric-not-found-test
  (testing "GET /api/metric/:id returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404 (str "metric/" Integer/MAX_VALUE))))))

(deftest fetch-metric-hydrates-dimensions-test
  (testing "GET /api/metric/:id returns dimensions and dimension_mappings"
    (mt/with-temp [:model/Card metric {:name          "Metric with Dimensions"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
        (is (contains? response :dimensions))
        (is (contains? response :dimension_mappings))))))

(deftest fetch-metric-permissions-test
  (testing "GET /api/metric/:id respects collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card metric {:name          "Protected Metric"
                                         :type          :metric
                                         :collection_id (:id collection)
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (testing "returns 403 without permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "metric/" (:id metric))))))))))

(deftest fetch-metric-rejects-non-metric-card-test
  (testing "GET /api/metric/:id returns 404 for non-metric cards"
    (mt/with-temp [:model/Card card {:name          "Regular Question"
                                     :type          :question
                                     :dataset_query (mt/mbql-query venues)}]
      (is (= "Not found."
             (mt/user-http-request :rasta :get 404 (str "metric/" (:id card))))))))

(deftest fetch-metric-saves-dimensions-on-read-test
  (testing "GET /api/metric/:id saves dimensions and dimension_mappings to the database"
    (mt/with-temp [:model/Card metric {:name          "Metric with Dimensions"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (testing "no dimensions saved initially"
        (let [initial-card (t2/select-one :model/Card :id (:id metric))]
          (is (nil? (:dimensions initial-card)))
          (is (nil? (:dimension_mappings initial-card)))))
      (testing "response contains dimensions with active status"
        (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
          (is (seq (:dimensions response)))
          (is (seq (:dimension_mappings response)))
          (is (every? #(= "status/active" (:status %)) (:dimensions response)))))
      (testing "dimensions persisted to database"
        (let [updated-card (t2/select-one :model/Card :id (:id metric))]
          (is (seq (:dimensions updated-card)))
          (is (seq (:dimension_mappings updated-card))))))))

(deftest fetch-metric-dimensions-have-has-field-values-test
  (testing "GET /api/metric/:id returns dimensions with has-field-values populated"
    (mt/with-temp [:model/Card metric {:name          "Metric with HFV"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response   (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dimensions (:dimensions response)]
        (is (seq dimensions) "should have dimensions")
        (testing "at least some dimensions have has-field-values"
          (let [dims-with-hfv (filter :has-field-values dimensions)]
            (is (seq dims-with-hfv)
                "at least some dimensions should have has-field-values")
            (doseq [dim dims-with-hfv]
              (is (#{"list" "search" "none"} (:has-field-values dim))
                  (str "dimension " (:name dim) " has-field-values should be list, search, or none")))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/metric/dataset                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest dataset-endpoint-requires-definition-test
  (testing "POST /api/metric/dataset requires definition"
    (is (some? (mt/user-http-request :rasta :post 400 "metric/dataset" {})))))

(deftest dataset-endpoint-requires-expression-test
  (testing "POST /api/metric/dataset requires expression in definition"
    (is (some? (mt/user-http-request :rasta :post 400 "metric/dataset"
                                     {:definition {}})))))

(deftest dataset-endpoint-rejects-duplicate-uuids-test
  (testing "POST /api/metric/dataset rejects duplicate UUIDs in expression"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (is (some? (mt/user-http-request :rasta :post 400 "metric/dataset"
                                       {:definition {:expression [:- {}
                                                                  [:metric {:lib/uuid "a"} (:id metric)]
                                                                  [:metric {:lib/uuid "a"} (:id metric)]]}}))))))

(deftest dataset-endpoint-metric-source-test
  (testing "POST /api/metric/dataset with metric expression"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :post 202 "metric/dataset"
                                           {:definition {:expression [:metric {:lib/uuid "a"} (:id metric)]}})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))
        (is (= [[100]] (get-in response [:data :rows])))))))

(deftest dataset-endpoint-measure-source-test
  (testing "POST /api/metric/dataset with measure expression"
    (let [mp               (mt/metadata-provider)
          table-metadata   (lib.metadata/table mp (mt/id :venues))
          mbql5-definition (-> (lib/query mp table-metadata)
                               (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure measure {:name       "Test Measure"
                                             :table_id   (mt/id :venues)
                                             :definition mbql5-definition}]
        (mt/with-full-data-perms-for-all-users!
          (let [response (mt/user-http-request :rasta :post 202 "metric/dataset"
                                               {:definition {:expression [:measure {:lib/uuid "a"} (:id measure)]}})]
            (is (= "completed" (:status response)))
            (is (= 1 (:row_count response)))
            (is (= [[100]] (get-in response [:data :rows])))))))))

(deftest dataset-endpoint-metric-not-found-test
  (testing "POST /api/metric/dataset returns 404 for non-existent metric"
    (is (= "Not found."
           (mt/user-http-request :rasta :post 404 "metric/dataset"
                                 {:definition {:expression [:metric {:lib/uuid "a"} Integer/MAX_VALUE]}})))))

(deftest dataset-endpoint-measure-not-found-test
  (testing "POST /api/metric/dataset returns 404 for non-existent measure"
    (is (= "Not found."
           (mt/user-http-request :rasta :post 404 "metric/dataset"
                                 {:definition {:expression [:measure {:lib/uuid "a"} Integer/MAX_VALUE]}})))))

(deftest dataset-endpoint-metric-permissions-test
  (testing "POST /api/metric/dataset respects metric collection permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card metric {:name          "Protected Metric"
                                         :type          :metric
                                         :collection_id (:id collection)
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "metric/dataset"
                                     {:definition {:expression [:metric {:lib/uuid "a"} (:id metric)]}})))))))

(deftest dataset-endpoint-rejects-non-metric-card-test
  (testing "POST /api/metric/dataset returns 404 for non-metric cards"
    (mt/with-temp [:model/Card card {:name          "Regular Question"
                                     :type          :question
                                     :dataset_query (mt/mbql-query venues)}]
      (is (= "Not found."
             (mt/user-http-request :rasta :post 404 "metric/dataset"
                                   {:definition {:expression [:metric {:lib/uuid "a"} (:id card)]}}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     POST /api/metric/breakout-values                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest breakout-values-endpoint-test
  (testing "POST /api/metric/breakout-values returns distinct breakout values"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      ;; Fetch metric to trigger dimension sync
      (let [hydrated   (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim        (first (:dimensions hydrated))
            dim-id     (:id dim)
            response   (mt/user-http-request :rasta :post 200 "metric/breakout-values"
                                             {:definition {:expression  [:metric {:lib/uuid "a"} (:id metric)]
                                                           :projections [{:type     :metric
                                                                          :id       (:id metric)
                                                                          :lib/uuid "a"
                                                                          :projection [[:dimension {} dim-id]]}]}})]
        (is (sequential? (:values response)))
        (is (seq (:values response)))
        (is (map? (:col response)))))))

(deftest dataset-endpoint-accepts-filters-and-projections-test
  (testing "POST /api/metric/dataset accepts filters parameter (returns 202 even if filters can't be applied)"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      ;; The endpoint accepts filters even if the metric doesn't have matching dimensions
      ;; This tests the endpoint parameter validation, not full filter functionality
      (let [response (mt/user-http-request :rasta :post 202 "metric/dataset"
                                           {:definition {:expression [:metric {:lib/uuid "a"} (:id metric)]
                                                         :filters []}})]
        (is (= "completed" (:status response))))))

  (testing "POST /api/metric/dataset accepts projections parameter (returns 202 even if projections can't be applied)"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      ;; The endpoint accepts projections even if the metric doesn't have matching dimensions
      (let [response (mt/user-http-request :rasta :post 202 "metric/dataset"
                                           {:definition {:expression [:metric {:lib/uuid "a"} (:id metric)]
                                                         :projections []}})]
        (is (= "completed" (:status response)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      QueryExecution tracking                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- rasta-metric-executions
  "Return `QueryExecution` rows owned by the `:rasta` user, newest first.
   Filtering by executor keeps us from picking up unrelated rows written by
   concurrent tests."
  []
  (t2/select :model/QueryExecution
             :executor_id (mt/user->id :rasta)
             {:order-by [[:started_at :desc]]}))

(deftest dataset-leaf-records-query-execution-test
  (testing "POST /api/metric/dataset (leaf path) writes a QueryExecution row with :context :metric"
    (mt/test-helpers-set-global-values!
      (binding [qp.util/*execute-async?* false]
        (mt/with-temp [:model/Card metric {:name          "QE Leaf Metric"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [before (count (rasta-metric-executions))]
            (mt/user-http-request :rasta :post 202 "metric/dataset"
                                  {:definition {:expression [:metric {:lib/uuid "a"} (:id metric)]}})
            (let [rows (rasta-metric-executions)]
              (is (= (inc before) (count rows))
                  "exactly one new QueryExecution row for rasta")
              (is (= :metric (:context (first rows)))
                  "the new row is tagged :context :metric"))))))))

(deftest dataset-arithmetic-records-one-qe-per-leaf-test
  (testing "POST /api/metric/dataset (arithmetic) writes one QueryExecution row per leaf"
    (mt/test-helpers-set-global-values!
      (binding [qp.util/*execute-async?* false]
        (mt/with-temp [:model/Card metric-a {:name          "QE Arith A"
                                             :type          :metric
                                             :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                       :model/Card metric-b {:name          "QE Arith B"
                                             :type          :metric
                                             :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [before (count (rasta-metric-executions))]
            (mt/user-http-request :rasta :post 202 "metric/dataset"
                                  {:definition {:expression [:+ {}
                                                             [:metric {:lib/uuid "a"} (:id metric-a)]
                                                             [:metric {:lib/uuid "b"} (:id metric-b)]]}})
            (let [rows      (rasta-metric-executions)
                  new-rows  (take (- (count rows) before) rows)]
              (is (= 2 (count new-rows))
                  "two new QueryExecution rows, one per arithmetic leaf")
              (is (every? #(= :metric (:context %)) new-rows)
                  "both rows are tagged :context :metric"))))))))

(deftest breakout-values-records-query-execution-test
  (testing "POST /api/metric/breakout-values writes a QueryExecution row with :context :metric"
    (mt/test-helpers-set-global-values!
      (binding [qp.util/*execute-async?* false]
        (mt/with-temp [:model/Card metric {:name          "QE Breakout Metric"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
          (let [dim-uuid (-> (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
                             :dimensions first :id)
                before   (count (rasta-metric-executions))]
            (mt/user-http-request :rasta :post 200 "metric/breakout-values"
                                  {:definition {:expression  [:metric {:lib/uuid "a"} (:id metric)]
                                                :projections [{:type :metric :id (:id metric) :lib/uuid "a"
                                                               :projection [[:dimension {} dim-uuid]]}]}})
            (let [rows (rasta-metric-executions)]
              (is (= (inc before) (count rows))
                  "exactly one new QueryExecution row")
              (is (= :metric (:context (first rows)))))))))))
