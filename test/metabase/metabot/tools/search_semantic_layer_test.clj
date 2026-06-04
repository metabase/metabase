(ns metabase.metabot.tools.search-semantic-layer-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.search-semantic-layer :as search-semantic-layer]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest tool-shape-oss-fallback-test
  (testing "without the semantic-search feature the tool returns the standard empty result shape"
    ;; Pin the feature off so the defenterprise call takes its OSS fallback regardless of any ambient
    ;; premium token (e.g. an all-features dev token) or rows left in a local pgvector store.
    (mt/with-premium-features #{}
      (is (=? {:output            #(str/includes? % "No matching curated entities")
               :structured-output {:result-type :search
                                   :data        []
                                   :total_count 0
                                   :weak_match  false}}
              (search-semantic-layer/search-semantic-layer-tool
               {:user_search_prompt "revenue per region"}))))))

(deftest similarity+canonical-helpers-test
  (let [similarity (var-get #'search-semantic-layer/similarity)
        canonical? (var-get #'search-semantic-layer/canonical-match?)]
    (testing "similarity is pulled from the :similarity score factor"
      (is (= 0.8 (similarity {:scores [{:name :similarity :score 0.8} {:name :canonical :score 1.0}]})))
      (is (= 0.0 (similarity {:scores [{:name :canonical :score 1.0}]}))))
    (testing "canonical? reflects the canonical factor firing"
      (is (true?  (canonical? {:scores [{:name :canonical :score 1.0}]})))
      (is (false? (canonical? {:scores [{:name :canonical :score 0.0}]}))))))

(deftest dedupe-by-entity-test
  (let [dedupe (var-get #'search-semantic-layer/dedupe-by-entity)
        results [{:entities [{:model "metric" :id 9}] :score {:total_score 0.95}}   ; entity 9, best
                 {:entities [{:model "metric" :id 9}] :score {:total_score 0.80}}   ; entity 9 again (sibling prompt)
                 {:entities [{:model "table" :id 1} {:model "table" :id 2}] :score {:total_score 0.70}}
                 {:entities [{:model "table" :id 2} {:model "table" :id 1}] :score {:total_score 0.60}}]] ; same set, reordered
    (testing "collapses to distinct entity sets, keeping the first (best-scoring) occurrence"
      (let [out (dedupe results)]
        (is (= 2 (count out)))
        (is (= [0.95 0.70] (mapv (comp :total_score :score) out)))))))

(deftest format-output-test
  (let [format-output (var-get #'search-semantic-layer/format-output)
        ;; matches as produced by build-matches: :entities are already full search-result records.
        matches [{:saved_search_prompt "monthly revenue by region"
                  :usage_instructions  "Use the Revenue metric; group by month."
                  :canonical           true :similarity 0.78 :weak? false
                  :score               {:total_score 0.95}
                  :entities            [{:type "metric" :id 9 :name "Revenue" :database_id 1
                                         :portable_entity_id "abcDEF"}]}
                 {:saved_search_prompt "orders joined to customers"
                  :usage_instructions  ""
                  :canonical           false :similarity 0.61 :weak? false
                  :score               {:total_score 0.80}
                  :entities            [{:type "table" :id 1 :name "ORDERS" :database_schema "PUBLIC"
                                         :database_id 1}]}]
        out     (format-output matches)]
    (testing "renders score, similarity, kind, confidence, the saved prompt, and hydrated entity details"
      (is (str/includes? out "score=\"0.950\""))
      (is (str/includes? out "similarity=\"0.780\""))
      (is (str/includes? out "kind=\"canonical\""))
      (is (str/includes? out "confidence=\"strong\""))
      (is (str/includes? out "<saved_search_prompt>monthly revenue by region</saved_search_prompt>"))
      (is (str/includes? out "Revenue"))
      (is (str/includes? out "ORDERS")))
    (testing "usage instructions surface when present and are omitted when blank"
      (is (str/includes? out "<usage_instructions>Use the Revenue metric; group by month.</usage_instructions>"))
      (is (= 1 (count (re-seq #"<usage_instructions>" out)))))
    (testing "no leading weak <note> when the top match is strong"
      (is (not (str/starts-with? out "<note>"))))))

(deftest weak-match-note-test
  (let [format-output (var-get #'search-semantic-layer/format-output)
        matches [{:saved_search_prompt "something only loosely related"
                  :usage_instructions "" :canonical false :similarity 0.20 :weak? true
                  :score {:total_score 0.20}
                  :entities [{:type "table" :id 7 :name "MISC" :database_id 1}]}]
        out (format-output matches)]
    (testing "a weak top match prepends the cautionary note and marks confidence weak"
      (is (str/starts-with? out "<note>"))
      (is (str/includes? out "No strong curated match"))
      (is (str/includes? out "confidence=\"weak\"")))))

(deftest flatten-data-test
  (let [flatten-data (var-get #'search-semantic-layer/flatten-data)
        matches [{:saved_search_prompt "p1" :usage_instructions "u1" :canonical true
                  :score {:total_score 0.9} :similarity 0.7 :weak? false
                  :entities [{:type "metric" :id 9 :name "Revenue"}]}
                 {:saved_search_prompt "p2" :usage_instructions "u2" :canonical false
                  :score {:total_score 0.6} :similarity 0.5 :weak? false
                  :entities [{:type "table" :id 1 :name "ORDERS"}
                             {:type "table" :id 2 :name "PEOPLE"}]}]
        out (flatten-data matches)]
    (testing "flattens to one record per entity, annotated and grouped"
      (is (= 3 (count out)))
      (is (= [0 1 1] (mapv :match_group out)))
      (is (=? {:type "metric" :id 9 :saved_search_prompt "p1" :usage_instructions "u1"
               :canonical true :confidence "strong" :similarity 0.7}
              (first out)))
      (is (= ["strong" "strong" "strong"] (mapv :confidence out))))))
