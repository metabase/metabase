(ns metabase.metabot.tools.search-prompt-entities-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.search-prompt-entities :as search-prompt-entities]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest tool-shape-oss-fallback-test
  (testing "without the semantic-search feature the tool returns the standard empty result shape"
    ;; Pin the feature off so the defenterprise call takes its OSS fallback regardless of any ambient
    ;; premium token (e.g. an all-features dev token) or rows left in a local pgvector store.
    (mt/with-premium-features #{}
      (is (=? {:output            #(str/includes? % "No matching saved prompts")
               :structured-output {:result-type :search_prompt_entities
                                   :data        []
                                   :total_count 0}}
              (search-prompt-entities/search-prompt-entities-tool
               {:user_search_prompt "revenue per region"}))))))

(deftest format-output-test
  (let [format-output (var-get #'search-prompt-entities/format-output)
        results       [{:saved_search_prompt "monthly revenue by region"
                        :entities [{:model "table" :id 42}]
                        :score    {:total_score 0.95}}
                       {:saved_search_prompt "orders joined to customers"
                        :entities [{:model "table" :id 1} {:model "card" :id 9}]
                        :score    {:total_score 0.80}}]
        out           (format-output results)]
    (testing "renders the total score, the prompt, and a single-entity hit"
      (is (str/includes? out "score=\"0.950\""))
      (is (str/includes? out "monthly revenue by region"))
      (is (str/includes? out "1 entity")))
    (testing "multi-entity hits report the count"
      (is (str/includes? out "2 entities")))))

(deftest entity-summary-test
  (let [entity-summary (var-get #'search-prompt-entities/entity-summary)]
    (testing "a single entity is summarized inline"
      (is (= "1 entity {:model \"table\", :id 1}"
             (entity-summary [{:model "table" :id 1}]))))
    (testing "multiple entities report the count"
      (is (= "3 entities"
             (entity-summary [{:model "table" :id 1} {:model "card" :id 2} {:model "table" :id 3}]))))))
