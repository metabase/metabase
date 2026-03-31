(ns metabase.metabot.tools.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.metadata :as metadata-tools]))

(deftest search-field-values-tool-test
  (testing "formats search results with match metadata"
    (with-redefs [field-stats-tools/search-field-values (fn [{:keys [entity-type entity-id field-id query limit]}]
                                                          (is (= "table" entity-type))
                                                          (is (= 10 entity-id))
                                                          (is (= "t10-3" field-id))
                                                          (is (= 2 limit))
                                                          (case query
                                                            "mar" {:values          [[14 "Marilyne Mohr"]
                                                                                     [36 "Margot Farrell"]]
                                                                   :has_more_values true}
                                                            "road" {:values          [["Road"] ["Road 1"]]
                                                                    :has_more_values false}))]
      (let [result (metadata-tools/search-field-values-tool
                    {:data_source "table"
                     :source_id   10
                     :field_id    "t10-3"
                     :queries     ["mar" "road"]
                     :limit       2})]
        (is (= {:result-type :field-search-results
                :field_id    "t10-3"
                :searches    [{:query    "mar"
                               :matches  [{:value 14 :display "Marilyne Mohr"}
                                          {:value 36 :display "Margot Farrell"}]
                               :has_more true}
                              {:query    "road"
                               :matches  [{:value "Road"}
                                          {:value "Road 1"}]
                               :has_more false}]}
               (:structured-output result)))
        (is (re-find #"<field-search-results field_id=\"t10-3\">" (:output result)))
        (is (re-find #"<match value=\"14\" display=\"Marilyne Mohr\"/>" (:output result)))))))

(deftest search-field-values-tool-errors-for-unsearchable-fields
  (testing "returns an agent error when the resolved column has no concrete field id"
    (with-redefs [field-stats-tools/search-field-values
                  (fn [_]
                    (throw (ex-info "This field cannot be searched because it does not map to a concrete field."
                                    {:agent-error? true :status-code 400})))]
      (is (= "This field cannot be searched because it does not map to a concrete field."
             (:output (metadata-tools/search-field-values-tool
                       {:data_source "table"
                        :source_id   10
                        :field_id    "t10-3"
                        :queries     ["foo"]})))))))
