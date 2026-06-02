(ns metabase.metabot.tools.search-prompt-entities-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.search-prompt-entities :as search-prompt-entities]))

(set! *warn-on-reflection* true)

(deftest tool-shape-oss-fallback-test
  (testing "without the semantic-search feature the tool returns the standard empty result shape"
    (is (=? {:output            #(str/includes? % "No matching saved prompts")
             :structured-output {:result-type :search_prompt_entities
                                 :data        []
                                 :total_count 0}}
            (search-prompt-entities/search-prompt-entities-tool
             {:user_search_prompt "revenue per region"})))))

(deftest format-output-test
  (let [format-output (var-get #'search-prompt-entities/format-output)
        results       [{:saved_search_prompt "monthly revenue by region"
                        :entities {:type "canonical" :entity {:model "table" :id 42}}
                        :score    {:total 0.95 :canonical true}}
                       {:saved_search_prompt "orders joined to customers"
                        :entities {:type "sources" :entities [{:model "table" :id 1} {:model "card" :id 9}]}
                        :score    {:total 0.80 :canonical false}}]
        out           (format-output results)]
    (testing "canonical hits render the score, the canonical flag, and the prompt"
      (is (str/includes? out "score=\"0.950\""))
      (is (str/includes? out "canonical=\"true\""))
      (is (str/includes? out "monthly revenue by region")))
    (testing "source-entity hits report the source count and are not flagged canonical"
      (is (str/includes? out "canonical=\"false\""))
      (is (str/includes? out "2 source entities")))))

(deftest entity-summary-test
  (let [entity-summary (var-get #'search-prompt-entities/entity-summary)]
    (testing "a single source is singular"
      (is (= "1 source entity"
             (entity-summary {:type "sources" :entities [{:model "table" :id 1}]}))))
    (testing "canonical summarizes the single entity"
      (is (str/includes? (entity-summary {:type "canonical" :entity {:model "table" :id 42}})
                         "canonical")))))
