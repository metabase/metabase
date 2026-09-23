(ns metabase.metabot.self.core-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai :as openai]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- tool-request [arguments]
  {:model "gpt-5.6-terra"
   :input [{:type :tool-input :id "call-1" :function "construct_notebook_query" :arguments arguments}]})

(deftest ^:parallel search-tool-output-test
  (let [item {:id 12 :type "question" :name "Revenue and orders over time"
              :description nil :database_id 1 :database_name "Sample Database" :database_engine :sqlite
              :portable_entity_id "evd6f3MoDUtTNsoXHwu0T" :display "combo"
              :verified false :official false :curated false
              :created_at (t/offset-date-time "2024-07-17T17:04:40Z")
              :updated_at (t/offset-date-time "2024-07-17T17:04:40Z")
              :collection {:id 2 :name "Examples" :authority_level nil}}
        request (fn [result]
                  {:input [{:type :tool-output :function "search" :id "call-1"
                            :result {:output "Search results"
                                     :structured-output {:result-type :search :data [result] :total_count 1}
                                     :data-parts [{:type :data :data-type "search_results"
                                                   :data {:total_count 1 :results [result]}}]}}]})]
    (is (nil? (mr/explain core/LLMRequestOpts (request item))))
    (is (mr/validate core/LLMRequestOpts
                     (request (assoc item :type "metric" :base_table_id 1 :base_table_name "orders"
                                     :base_table_schema nil :base_table_portable_fk ["Sample Database" nil "orders"]))))))

(deftest ^:parallel tool-input-part-arguments-test
  (testing "nested argument objects accept string and keyword keys"
    (doseq [arguments [{:data {:sort [{:direction "desc" :property "n"}]}}
                       {"data" {"nested" {"deep" [1 2 {"k" true}]}}}
                       {:mixed {"string-key" {:keyword-key nil}}}]]
      (is (mr/validate core/LLMRequestOpts (tool-request arguments)))))
  (testing "non-JSON values and object keys are rejected"
    (doseq [arguments [{:when (java.util.Date.)} {:nested {42 "value"}} {:nested {:value (Object.)}}]]
      (is (not (mr/validate core/LLMRequestOpts (tool-request arguments)))))))

(deftest ^:parallel notebook-tool-call-replay-test
  (let [arguments {:query {:lib/type "mbql/query"
                           :stages [{:lib/type "mbql.stage/mbql"
                                     :source-table ["Postgres" "public" "orders"]
                                     :aggregation [["count" {}]]
                                     :breakout [["field" {:temporal-unit "month"}
                                                 ["Postgres" "public" "orders" "created_at"]]]}]}
                   :visualization {:chart_type "line"}}
        request (tool-request arguments)]
    (is (mr/validate core/LLMRequestOpts request))
    (is (= arguments
           (-> (openai/openai-request-body request) :input first :arguments json/decode+kw)))))
