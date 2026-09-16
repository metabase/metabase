(ns metabase.metabot.self.tool-results-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.resources :as resources]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(defn- call-and-replay! [conversation tool-name tool args]
  (let [call-id (str "call-" (count @conversation))
        result  (tool args)
        input   (swap! conversation into [{:type :tool-input :id call-id :function tool-name :arguments args}
                                          {:type :tool-output :id call-id :function tool-name :result result}])
        opts    {:model "gpt-4.1-mini" :input input
                 :credentials {:api-key "test-key" :base-url "https://api.openai.com"}}
        errors  (:errors (mr/explain self.core/LLMRequestOpts opts))
        request (atom nil)]
    (testing (str tool-name " can be replayed in the next model request")
      (is (nil? (some->> errors (mapv #(select-keys % [:in :type]))))))
    (when-not errors
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible (constantly [])
                                  http/request (fn [req]
                                                 (reset! request (json/decode+kw (:body req)))
                                                 {:body ""})]
        (openai/openai-raw opts))
      (is (= {:type "function_call_output" :call_id call-id :output (:output result)}
             (last (:input @request)))))
    result))

(deftest model-to-chart-tool-results-test
  (mt/with-temp [:model/Card {model-id :id} {:type :model
                                             :name "Bird sightings"
                                             :dataset_query (lib/query (mt/metadata-provider)
                                                                       (lib.metadata/table (mt/metadata-provider)
                                                                                           (mt/id :products)))}]
    (mt/with-test-user :crowberto
      (let [conversation (atom [{:role :user :content "Chart the bird sightings."}])
            read!        #(call-and-replay! conversation "read_resource" resources/read-resource-tool {:uris [%]})
            model-uri    (str "metabase://model/" model-id)
            model-result (read! model-uri)
            fields       (get-in (read! (str model-uri "/fields")) [:resources 0 :content :structured-output :fields])
            entity-id    (get-in model-result [:resources 0 :content :structured-output :portable_entity_id])]
        (is (seq fields))
        (is (string? entity-id))
        (read! (str model-uri "/fields/" (:field_id (first fields))))
        (doseq [clauses [{:fields (mapv (fn [field] ["field" {} (:name field)]) (take 3 fields))}
                         {:aggregation [["count" {}]]}]]
          (let [result     (call-and-replay! conversation "construct_notebook_query"
                                             construct/construct-notebook-query-tool
                                             {:title "Bird sightings" :description "A chart of bird sightings."
                                              :visualization {:chart_type "bar"}
                                              :query {:lib/type "mbql/query"
                                                      :stages [(merge {:lib/type "mbql.stage/mbql"
                                                                       :source-card entity-id}
                                                                      clauses)]}})
                structured (:structured-output result)
                {:keys [query-id chart-id query]} structured]
            (is (map? (:query-json structured)))
            (is (seq (:result-columns structured)))
            (is (= "generated_entity" (get-in result [:data-parts 0 :data-type])))
            (binding [shared/*memory-atom* (atom {:state {:queries {query-id query}
                                                          :charts {chart-id {:chart_id chart-id
                                                                             :query_id query-id
                                                                             :queries [query]}}}})]
              (doseq [[tool-name tool args] [["create_chart" charts/create-chart-tool
                                              {:data_source {:query_id query-id} :viz_settings {:chart_type "line"}}]
                                             ["edit_chart" charts/edit-chart-tool
                                              {:chart_id chart-id :new_viz_settings {:chart_type "pie"}}]]]
                (let [chart (call-and-replay! conversation tool-name tool
                                              (assoc args :title "Bird sightings"
                                                     :description "Another view of bird sightings."))]
                  (is (= :chart (get-in chart [:structured-output :result-type])))
                  (is (= "generated_entity" (get-in chart [:data-parts 0 :data-type]))))))))))))
