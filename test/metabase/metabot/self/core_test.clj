(ns metabase.metabot.self.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.core :as core]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel tool-input-part-arguments-test
  (let [part-schema @#'core/AISDKPart
        part        (fn [arguments]
                      {:type :tool-input :id "call-1" :function "some_tool" :arguments arguments})]
    (testing "argument objects nested at any depth may be keyed by keywords or strings"
      (is (mr/validate part-schema (part {:data {:source "c" :limit 20 :sort [{:direction "desc" :property "n"}]}})))
      (is (mr/validate part-schema (part {"data" {"source" "c" "nested" {"deep" [1 2 {"k" true}]}}})))
      (is (mr/validate part-schema (part {:mixed {"string-key" {:keyword-key nil}}}))))
    (testing "non-JSON values are still rejected"
      (is (not (mr/validate part-schema (part {:when (java.util.Date.)})))))))

(deftest ^:parallel tool-entry-deferred-test
  (let [entry {:tool-name "notion__fetch" :schema [:=> [:cat :map] :any] :fn identity
               :deferred  {:group "Notion" :summary "Fetch a page."}}]
    (testing "a deferred tool entry is accepted by the provider request schema"
      (is (mr/validate @#'core/LLMRequestOpts {:model "m" :input [] :tools [entry]})))
    (testing "the deferred map is closed"
      (is (not (mr/validate core/ToolEntry (assoc-in entry [:deferred :extra] 1)))))))

(deftest ^:parallel read-resource-tool-output-test
  (let [resource {:uri "metabase://model/200"
                  :content {:structured-output
                            {:id 200 :type :model :result-type :entity
                             :name "Bird sightings" :display_name "Bird sightings"
                             :database_id 2 :database_name "Postgres" :database_engine "postgres"
                             :portable_entity_id "rgsy6MjKDBtdSUbr8Eagv" :verified false
                             :fields [{:name "species" :base_type :type/Text}]
                             :query_json {"lib/type" "mbql/query"
                                          "database" "Postgres"
                                          "stages" [{"lib/type" "mbql.stage/mbql"
                                                     "source-table" ["Postgres" "public" "bird_sightings"]}]}}}}
        request (fn [resources]
                  {:model "test-model"
                   :input [{:type :tool-output :id "call-1" :function "read_resource"
                            :result {:resources resources
                                     :output "<resources>Bird sightings</resources>"
                                     :data-parts [{:type :data :data-type "tool_title"
                                                   :data {:title "[Bird sightings](metabase://model/200)"}}]}}]})]
    (testing "resource envelopes and nested model metadata can be replayed to the LLM"
      (is (nil? (mr/explain core/LLMRequestOpts (request [resource])))))
    (testing "failed reads can be mixed with successful reads"
      (is (nil? (mr/explain core/LLMRequestOpts
                            (request [resource {:uri "metabase://model/201" :error "Not found"}])))))
    (testing "resource envelope keys and URI types are still checked"
      (is (not (mr/validate core/LLMRequestOpts (request [(assoc resource :uri 200)]))))
      (is (not (mr/validate core/LLMRequestOpts (request [(assoc resource :unexpected true)])))))))

(deftest ^:parallel chart-tool-output-schema-test
  (let [column {:field_id 1 :name "species" :display_name "Species" :type :string
                :base_type "type/Text" :effective_type "type/Text" :semantic_type "type/Category"
                :database_type "varchar" :description "Bird species" :field_values ["Robin" "Jay"]
                :portable_fk ["Birds" nil "sightings" "species"]
                :fk_target_portable_fk ["Birds" nil "species" "name"] :table_reference "Species"}
        result {:output "Bird sightings"
                :structured-output {:result-type :query
                                    :query-json {"lib/type" "mbql/query" "stages" []}
                                    :result-columns [column]
                                    :chart-link "metabase://chart/birds"
                                    :chart-content "<chart>Bird sightings</chart>"
                                    :instructions "Link to the chart."}}
        valid? #(mr/validate core/LLMRequestOpts
                             {:input [{:type :tool-output :id "call-1" :result %}]})]
    (is (valid? result))
    (testing "aggregation columns use string IDs and can have no inferred type"
      (is (valid? (assoc-in result [:structured-output :result-columns]
                            [{:field_id "count" :name "count" :display_name "Count" :type nil}]))))))
