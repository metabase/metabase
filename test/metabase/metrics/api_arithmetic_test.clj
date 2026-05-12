(ns metabase.metrics.api-arithmetic-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest arithmetic-metric-plus-metric-test
  (testing "POST /api/metric/dataset with metric_A + metric_B returns correct sum"
    (mt/with-temp [:model/Card metric-a {:name          "Metric A"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card metric-b {:name          "Metric B"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      ;; Trigger dimension sync for both metrics
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-a)))
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-b)))
      ;; Get dimension UUIDs from each metric separately
      (let [metric-a-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-a)))
            metric-b-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-b)))
            dim-a-uuid        (:id (first (:dimensions metric-a-response)))
            dim-b-uuid        (:id (first (:dimensions metric-b-response)))
            response          (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                    {:definition
                                                     {:expression   [:+ {}
                                                                     [:metric {:lib/uuid "a"} (:id metric-a)]
                                                                     [:metric {:lib/uuid "b"} (:id metric-b)]]
                                                      :projections  [{:type :metric :id (:id metric-a) :lib/uuid "a"
                                                                      :projection [[:dimension {} dim-a-uuid]]}
                                                                     {:type :metric :id (:id metric-b) :lib/uuid "b"
                                                                      :projection [[:dimension {} dim-b-uuid]]}]}})]
        (is (= "completed" (:status response)))
        (is (pos? (:row_count response)))
        ;; Each row should have [dim-value, sum] where sum is a+b for that dimension value
        (is (every? #(= 2 (count %)) (get-in response [:data :rows])))))))

(deftest arithmetic-subtraction-test
  (testing "POST /api/metric/dataset with metric_A - metric_B"
    (mt/with-temp [:model/Card metric-a {:name          "Metric A"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card metric-b {:name          "Metric B"
                                         :type          :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-a)))
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-b)))
      (let [metric-a-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-a)))
            metric-b-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric-b)))
            dim-a-uuid        (:id (first (:dimensions metric-a-response)))
            dim-b-uuid        (:id (first (:dimensions metric-b-response)))
            response          (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                    {:definition
                                                     {:expression   [:- {}
                                                                     [:metric {:lib/uuid "a"} (:id metric-a)]
                                                                     [:metric {:lib/uuid "b"} (:id metric-b)]]
                                                      :projections  [{:type :metric :id (:id metric-a) :lib/uuid "a"
                                                                      :projection [[:dimension {} dim-a-uuid]]}
                                                                     {:type :metric :id (:id metric-b) :lib/uuid "b"
                                                                      :projection [[:dimension {} dim-b-uuid]]}]}})]
        (is (= "completed" (:status response)))
        ;; Same query minus itself: all values should be 0
        (is (every? #(zero? (last %)) (get-in response [:data :rows])))))))

(deftest arithmetic-with-instance-filters-test
  (testing "POST /api/metric/dataset with instance filters on arithmetic"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim             (first (:dimensions metric-response))
            dim-uuid        (:id dim)
            response        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:- {}
                                                                   [:metric {:lib/uuid "a"} (:id metric)]
                                                                   [:metric {:lib/uuid "b"} (:id metric)]]
                                                    :filters      [{:lib/uuid "a"
                                                                    :filter [:= {} [:dimension {} dim-uuid] 1]}]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "b"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})]
        (is (= "completed" (:status response)))))))

(deftest arithmetic-missing-projections-test
  (testing "POST /api/metric/dataset arithmetic without projections returns scalar result"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request :rasta :post 202 "metric/dataset"
                                           {:definition
                                            {:expression [:+ {}
                                                          [:metric {:lib/uuid "a"} (:id metric)]
                                                          [:metric {:lib/uuid "b"} (:id metric)]]}})]
        (is (= "completed" (:status response)))
        (is (= 1 (:row_count response)))))))
(deftest arithmetic-nested-expression-test
  (testing "POST /api/metric/dataset with nested (A + B) * C"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim             (first (:dimensions metric-response))
            dim-uuid        (:id dim)
            _               (assert dim-uuid (str "No dimension found in metric response: " (pr-str (:dimensions metric-response))))
            response        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:* {}
                                                                   [:+ {}
                                                                    [:metric {:lib/uuid "a"} (:id metric)]
                                                                    [:metric {:lib/uuid "b"} (:id metric)]]
                                                                   [:metric {:lib/uuid "c"} (:id metric)]]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "b"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "c"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})]
        (is (= "completed" (:status response)))
        (is (pos? (:row_count response)))))))

(deftest arithmetic-metric-times-constant-test
  (testing "POST /api/metric/dataset with [:* {} [:metric ...] 2] returns correct results"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim-uuid        (:id (first (:dimensions metric-response)))
            response        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:* {}
                                                                   [:metric {:lib/uuid "a"} (:id metric)]
                                                                   2]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})]
        (is (= "completed" (:status response)))
        (is (pos? (:row_count response)))
        ;; Each result should be exactly double the count
        (let [single-response (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                    {:definition
                                                     {:expression   [:metric {:lib/uuid "x"} (:id metric)]
                                                      :projections  [{:type :metric :id (:id metric) :lib/uuid "x"
                                                                      :projection [[:dimension {} dim-uuid]]}]}})
              single-rows     (into {} (map (fn [[k v]] [k v]) (get-in single-response [:data :rows])))
              double-rows     (into {} (map (fn [[k v]] [k v]) (get-in response [:data :rows])))]
          (doseq [[dim-val single-val] single-rows]
            (is (= (* 2 single-val) (get double-rows dim-val))
                (str "Value for " dim-val " should be doubled"))))))))

(deftest arithmetic-nested-values-test
  (testing "POST /api/metric/dataset nested (A + A) * 2 returns 4N per row"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim-uuid        (:id (first (:dimensions metric-response)))
            baseline        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:metric {:lib/uuid "x"} (:id metric)]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "x"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})
            response        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:* {}
                                                                   [:+ {}
                                                                    [:metric {:lib/uuid "a"} (:id metric)]
                                                                    [:metric {:lib/uuid "b"} (:id metric)]]
                                                                   2]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "b"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})]
        (is (= "completed" (:status response)))
        (is (pos? (:row_count response)))
        (let [base-rows   (into {} (map (fn [[k v]] [k v]) (get-in baseline [:data :rows])))
              nested-rows (into {} (map (fn [[k v]] [k v]) (get-in response [:data :rows])))]
          (doseq [[dim-val base-val] base-rows]
            (is (= (* 4 base-val) (get nested-rows dim-val))
                (str "Value for " dim-val " should be 4N"))))))))

(deftest arithmetic-associativity-test
  (testing "POST /api/metric/dataset nesting position affects result"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim-uuid        (:id (first (:dimensions metric-response)))
            projections     [{:type :metric :id (:id metric) :lib/uuid "a"
                              :projection [[:dimension {} dim-uuid]]}
                             {:type :metric :id (:id metric) :lib/uuid "b"
                              :projection [[:dimension {} dim-uuid]]}]
            ;; A / (A / 2) = N / (N/2) = 2.0
            response-a      (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:/ {}
                                                                   [:metric {:lib/uuid "a"} (:id metric)]
                                                                   [:/ {}
                                                                    [:metric {:lib/uuid "b"} (:id metric)]
                                                                    2]]
                                                    :projections  projections}})
            ;; (A / A) / 2 = (N/N) / 2 = 0.5
            response-b      (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:/ {}
                                                                   [:/ {}
                                                                    [:metric {:lib/uuid "a"} (:id metric)]
                                                                    [:metric {:lib/uuid "b"} (:id metric)]]
                                                                   2]
                                                    :projections  projections}})]
        (is (= "completed" (:status response-a)))
        (is (= "completed" (:status response-b)))
        (let [rows-a (into {} (map (fn [[k v]] [k (double v)]) (get-in response-a [:data :rows])))
              rows-b (into {} (map (fn [[k v]] [k (double v)]) (get-in response-b [:data :rows])))]
          (doseq [[dim-val val-a] rows-a]
            (is (= 2.0 val-a) (str "A/(A/2) should be 2.0 for " dim-val))
            (is (= 0.5 (get rows-b dim-val)) (str "(A/A)/2 should be 0.5 for " dim-val))))))))

(deftest arithmetic-deeply-nested-test
  (testing "POST /api/metric/dataset with 3-level nesting ((A + A) * A) / 2 = N²"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim-uuid        (:id (first (:dimensions metric-response)))
            baseline        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:metric {:lib/uuid "x"} (:id metric)]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "x"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})
            response        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:/ {}
                                                                   [:* {}
                                                                    [:+ {}
                                                                     [:metric {:lib/uuid "a"} (:id metric)]
                                                                     [:metric {:lib/uuid "b"} (:id metric)]]
                                                                    [:metric {:lib/uuid "c"} (:id metric)]]
                                                                   2]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "b"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "c"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})]
        (is (= "completed" (:status response)))
        (is (pos? (:row_count response)))
        (let [base-rows (into {} (map (fn [[k v]] [k (double v)]) (get-in baseline [:data :rows])))
              deep-rows (into {} (map (fn [[k v]] [k (double v)]) (get-in response [:data :rows])))]
          (doseq [[dim-val base-val] base-rows]
            (is (= (* base-val base-val) (get deep-rows dim-val))
                (str "((A+A)*A)/2 should be N² for " dim-val))))))))

(deftest arithmetic-nested-division-by-zero-test
  (testing "POST /api/metric/dataset A / (A - A) returns 0 rows (zero guard)"
    (mt/with-temp [:model/Card metric {:name          "Test Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
      (let [metric-response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
            dim-uuid        (:id (first (:dimensions metric-response)))
            response        (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                  {:definition
                                                   {:expression   [:/ {}
                                                                   [:metric {:lib/uuid "a"} (:id metric)]
                                                                   [:- {}
                                                                    [:metric {:lib/uuid "b"} (:id metric)]
                                                                    [:metric {:lib/uuid "c"} (:id metric)]]]
                                                    :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "b"
                                                                    :projection [[:dimension {} dim-uuid]]}
                                                                   {:type :metric :id (:id metric) :lib/uuid "c"
                                                                    :projection [[:dimension {} dim-uuid]]}]}})]
        (is (= "completed" (:status response)))
        (is (zero? (:row_count response)))))))

(deftest arithmetic-mixed-metric-measure-test
  (testing "POST /api/metric/dataset with metric + measure arithmetic"
    (let [mp             (mt/metadata-provider)
          table-metadata (lib.metadata/table mp (mt/id :venues))
          mbql5-def      (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Card    metric  {:name          "Test Metric"
                                             :type          :metric
                                             :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Measure measure {:name       "Test Measure"
                                             :table_id   (mt/id :venues)
                                             :definition mbql5-def}]
        (mt/with-full-data-perms-for-all-users!
          ;; Sync dimensions for both metric and measure
          (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
          (metrics/sync-dimensions! :metadata/measure (:id measure))
          ;; Get dimension UUIDs from each entity
          (let [metric-response  (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
                dim-metric-uuid  (:id (first (:dimensions metric-response)))
                measure-entity   (t2/select-one :model/Measure :id (:id measure))
                dim-measure-uuid (:id (first (:dimensions measure-entity)))
                response         (mt/user-http-request :rasta :post 202 "metric/dataset"
                                                       {:definition
                                                        {:expression   [:+ {}
                                                                        [:metric {:lib/uuid "a"} (:id metric)]
                                                                        [:measure {:lib/uuid "b"} (:id measure)]]
                                                         :projections  [{:type :metric :id (:id metric) :lib/uuid "a"
                                                                         :projection [[:dimension {} dim-metric-uuid]]}
                                                                        {:type :measure :id (:id measure) :lib/uuid "b"
                                                                         :projection [[:dimension {} dim-measure-uuid]]}]}})]
            (is (= "completed" (:status response)))
            (is (pos? (:row_count response)))))))))
