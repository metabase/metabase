(ns metabase-enterprise.metabot-v3.tools.find-outliers-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as metabot-v3.tools.find-outliers]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- by-name
  [dimensions dimension-name]
  (m/find-first (comp #{dimension-name} :name) dimensions))

(defn- test-card
  []
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        created-at-meta (lib.metadata/field mp (mt/id :orders :created_at))
        query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                  (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :orders :subtotal))))
                  (lib/breakout (lib/with-temporal-bucket created-at-meta :year)))
        legacy-query (lib.convert/->legacy-MBQL query)]
    {:dataset_query legacy-query
     :database_id (mt/id)
     :name "Average Order Value"
     :description "The average subtotal of orders."}))

(def ^:private test-dimensions
  [{:dimension "2016-01-01T00:00:00Z", :value "54.43"}
   {:dimension "2017-01-01T00:00:00Z", :value "54.66"}
   {:dimension "2018-01-01T00:00:00Z", :value "83.72"}
   {:dimension "2019-01-01T00:00:00Z", :value "84.07"}
   {:dimension "2020-01-01T00:00:00Z", :value "84.68"}])

(def ^:private normalize-value-xf
  (map (fn [dimension] (update dimension :value #(-> % str (subs 0 5))))))

(defn- ai-find-outliers
  "Simulates the AI service finding the outliers in `dimensions`."
  [dimensions]
  (into [] (comp (take 2) normalize-value-xf) dimensions))

(def ^:private test-outliers
  (ai-find-outliers test-dimensions))

(defn- execute-test!
  [call-tool]
  (testing "User has to have execution rights."
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                          (call-tool))))
  (testing "Request gets forwarded to AI service."
    (let [input-dimensions (atom nil)]
      (mt/with-current-user (mt/user->id :crowberto)
        (with-redefs [metabot-v3.client/find-outliers-request
                      (fn [dimensions] (ai-find-outliers (reset! input-dimensions dimensions)))]
          (is (= {:structured-output test-outliers}
                 (call-tool)))
          (is (= test-dimensions
                 (into [] normalize-value-xf @input-dimensions))))))))

(deftest metric-find-outliers-test
  (mt/with-temp [:model/Card {metric-id :id} (assoc (test-card) :type :metric)]
    (execute-test! #(metabot-v3.tools.find-outliers/find-outliers
                     {:data-source {:metric-id metric-id}}))))

(deftest report-find-outliers-test
  (mt/with-temp [:model/Card {report-id :id} (assoc (test-card) :type :question)]
    (let [report-details (mt/with-current-user (mt/user->id :crowberto)
                           (#'metabot-v3.dummy-tools/card-details report-id))
          ->field-id #(u/prog1 (-> report-details :fields (by-name %) :field-id)
                        (when-not <>
                          (throw (ex-info (str "Column " % " not found") {:column %}))))
          result-field-id (->field-id "Average of Subtotal")]
      (execute-test! #(metabot-v3.tools.find-outliers/find-outliers
                       {:data-source {:report-id report-id
                                      :result-field-id result-field-id}})))))

(deftest query-find-outliers-test
  (let [query-id (u/generate-nano-id)
        query-details (mt/with-current-user (mt/user->id :crowberto)
                        (#'metabot-v3.dummy-tools/execute-query query-id (:dataset_query (test-card))))
        ->field-id #(u/prog1 (-> query-details :result-columns (by-name %) :field-id)
                      (when-not <>
                        (throw (ex-info (str "Column " % " not found") {:column %}))))
        result-field-id (->field-id "Average of Subtotal")]
    (testing "new style tool call with query and query-id"
      (execute-test! #(metabot-v3.tools.find-outliers/find-outliers
                       {:data-source {:query (:query query-details)
                                      :query-id query-id
                                      :result-field-id result-field-id}})))
    (testing "new style tool call with just query"
      (execute-test! #(metabot-v3.tools.find-outliers/find-outliers
                       {:data-source {:query (:query query-details)
                                      :result-field-id result-field-id}})))))

(deftest ^:parallel metric-find-outliers-no-temporal-dimension-test
  (mt/with-temp [:model/Card {metric-id :id} (-> (test-card)
                                                 (m/dissoc-in [:dataset_query :query :breakout])
                                                 (assoc :type :metric))]
    (mt/with-current-user (mt/user->id :crowberto)
      (is (= {:output "No temporal dimension found. Outliers can only be detected when a temporal dimension is available."}
             (metabot-v3.tools.find-outliers/find-outliers
              {:data-source {:metric-id metric-id}}))))))

(deftest ^:parallel metric-find-outliers-no-numeric-dimension-test
  (mt/with-temp [:model/Card {metric-id :id} (-> (test-card)
                                                 (m/dissoc-in [:dataset_query :query :aggregation])
                                                 (assoc :type :metric))]
    (mt/with-current-user (mt/user->id :crowberto)
      (is (= {:output "Could not determine result field."}
             (metabot-v3.tools.find-outliers/find-outliers
              {:data-source {:metric-id metric-id}}))))))

(deftest ^:parallel find-outliers-wrong-query-test
  (let [query-id (u/generate-nano-id)
        query-details (mt/with-current-user (mt/user->id :crowberto)
                        (#'metabot-v3.dummy-tools/execute-query query-id (:dataset_query (test-card))))
        ->field-id #(u/prog1 (-> query-details :result-columns (by-name %) :field-id)
                      (when-not <>
                        (throw (ex-info (str "Column " % " not found") {:column %}))))
        result-field-id (->field-id "Average of Subtotal")]
    (mt/with-current-user (mt/user->id :crowberto)
      (are [details output] (= {:output output}
                               (metabot-v3.tools.find-outliers/find-outliers
                                {:data-source {:query (:query details)
                                               :result-field-id result-field-id}}))

        (assoc-in query-details [:query :query :source-table] Integer/MAX_VALUE)
        "Unexpected error running query"

        (m/dissoc-in query-details [:query :query :breakout])
        "No temporal dimension found. Outliers can only be detected when a temporal dimension is available.")
      (let [wrong-result-field-id (str result-field-id "99999")]
        (is (= {:output (str "Invalid result_field_id " wrong-result-field-id)}
               (metabot-v3.tools.find-outliers/find-outliers
                {:data-source {:query (:query query-details)
                               :result-field-id wrong-result-field-id}})))))))

(deftest ^:parallel invalid-ids-test
  (are [data-source output] (= {:output output}
                               (metabot-v3.tools.find-outliers/find-outliers {:data-source data-source}))
    {:metric-id "42"} "Invalid metric_id as data_source"
    {:report-id "42"} "Invalid report_id as data_source"
    {:table_id 42}    "Invalid data_source"))
