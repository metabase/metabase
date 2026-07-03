(ns metabase.metabot.tools.entity-retrieval-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.entity-retrieval.core :as cs.core]
   [metabase.metabot.tools.entity-retrieval :as entity-retrieval]
   [metabase.metabot.tools.search :as tools.search]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest tool-shape-oss-fallback-test
  (testing "without the semantic-search feature the tool returns the standard empty result shape"
    ;; Pin the feature off so the defenterprise call takes its OSS fallback regardless of any ambient
    ;; premium token (e.g. an all-features dev token) or rows left in a local pgvector store.
    (mt/with-premium-features #{}
      (is (=? {:output            #(str/includes? % "No matching library entities")
               :structured-output {:result-type :search
                                   :data        []
                                   :total_count 0
                                   :weak_match  false}}
              (entity-retrieval/retrieve-library-entities-tool
               {:user_search_prompt "revenue per region"}))))))

(deftest similarity-helper-test
  (let [similarity (var-get #'entity-retrieval/similarity)]
    (testing "similarity is pulled from the :similarity score factor"
      (is (= 0.8 (similarity {:scores [{:name :similarity :score 0.8}]})))
      (is (= 0.0 (similarity {:scores []}))))))

(deftest build-matches-permission-filters-before-take-test
  (testing "hydration permission-filters the whole candidate set before take-n, so an unreadable top hit doesn't crowd out readable matches just past the cut"
    (let [build-matches (var-get #'entity-retrieval/build-matches)
          ;; three distinct entities, best-first
          raw (vec (for [id [1 2 3]]
                     {:entity       {:model "table" :id id}
                      :doc_type     "name"
                      :doc_text     (str "n" id)
                      :instructions ""
                      :score        {:total_score (- 1.0 (/ id 10.0))
                                     :scores [{:name :similarity :score 0.8}]}}))]
      (mt/with-dynamic-fn-redefs [cs.core/search (fn [_ _] raw)
                                  ;; entity 1 (the top hit) is unreadable → dropped during hydration
                                  tools.search/entity-refs->search-results
                                  (fn [refs] (for [{:keys [model id]} refs :when (not= 1 id)]
                                               {:type model :id id :name (str "e" id)}))]
        (testing "asking for 2 returns the 2 readable entities (2 and 3), not just the 1 below the old top-2 cut"
          (is (= [2 3] (mapv (comp :id :entity) (build-matches "q" 2)))))))))

(deftest match->xml-locale-independent-test
  (testing "score/similarity render with a '.' decimal separator even under a comma-decimal default locale"
    (let [match->xml (var-get #'entity-retrieval/match->xml)
          orig       (java.util.Locale/getDefault)]
      (try
        (java.util.Locale/setDefault (java.util.Locale/forLanguageTag "de-DE"))
        (let [out (match->xml {:doc_type "synonym" :matched_text "p" :usage_instructions ""
                               :score {:total_score 0.95} :similarity 0.78 :weak? false
                               :entity {:type "table" :id 1 :name "T" :database_id 1}})]
          (is (str/includes? out "score=\"0.950\""))
          (is (str/includes? out "similarity=\"0.780\"")))
        (finally
          (java.util.Locale/setDefault orig))))))

(deftest dedupe-by-entity-test
  (let [dedupe (var-get #'entity-retrieval/dedupe-by-entity)
        results [{:entity {:model "metric" :id 9} :score {:total_score 0.95}}   ; entity 9, best
                 {:entity {:model "metric" :id 9} :score {:total_score 0.80}}   ; entity 9 again (sibling doc)
                 {:entity {:model "table" :id 1} :score {:total_score 0.70}}]]
    (testing "collapses to distinct entities, keeping the first (best-scoring) occurrence"
      (let [out (dedupe results)]
        (is (= 2 (count out)))
        (is (= [0.95 0.70] (mapv (comp :total_score :score) out)))))
    (testing "\"card\" and \"question\" are aliases for the same Card, so they collapse to one entity"
      (let [out (dedupe [{:entity {:model "card" :id 5} :score {:total_score 0.9}}
                         {:entity {:model "question" :id 5} :score {:total_score 0.8}}])]
        (is (= 1 (count out)))
        (is (= 0.9 (-> out first :score :total_score)))))
    (testing "measures and segments are first-class distinct entities"
      (let [out (dedupe [{:entity {:model "measure" :id 3} :score {:total_score 0.9}}
                         {:entity {:model "segment" :id 3} :score {:total_score 0.8}}])]
        (is (= 2 (count out)))))))

(deftest format-output-test
  (let [format-output (var-get #'entity-retrieval/format-output)
        ;; matches as produced by build-matches: :entity is already a full search-result record.
        matches [{:doc_type           "synonym"
                  :matched_text       "monthly revenue by region"
                  :usage_instructions "Use the Revenue metric; group by month."
                  :similarity         0.78 :weak? false
                  :score              {:total_score 0.95}
                  :entity             {:type "metric" :id 9 :name "Revenue" :database_id 1
                                       :portable_entity_id "abcDEF"}}
                 {:doc_type           "name"
                  :matched_text       "orders"
                  :usage_instructions ""
                  :similarity         0.61 :weak? false
                  :score              {:total_score 0.80}
                  :entity             {:type "table" :id 1 :name "ORDERS" :database_schema "PUBLIC"
                                       :database_id 1}}]
        out     (format-output matches)]
    (testing "renders score, similarity, confidence, the matched_on doc, and hydrated entity details"
      (is (str/includes? out "score=\"0.950\""))
      (is (str/includes? out "similarity=\"0.780\""))
      (is (str/includes? out "confidence=\"strong\""))
      (is (str/includes? out "<matched_on type=\"synonym\">monthly revenue by region</matched_on>"))
      (is (str/includes? out "Revenue"))
      (is (str/includes? out "ORDERS")))
    (testing "usage instructions surface when present and are omitted when blank"
      (is (str/includes? out "<usage_instructions>Use the Revenue metric; group by month.</usage_instructions>"))
      (is (= 1 (count (re-seq #"<usage_instructions>" out)))))
    (testing "no leading weak <note> when the top match is strong"
      (is (not (str/starts-with? out "<note>"))))))

(deftest xml-escaping-test
  (let [format-output (var-get #'entity-retrieval/format-output)
        matches [{:doc_type           "synonym"
                  :matched_text       "P&L by quarter <2026>"
                  :usage_instructions "Profit & loss; values < 0 are losses."
                  :similarity 0.7 :weak? false
                  :score {:total_score 0.7}
                  :entity {:type "table" :id 1 :name "FINANCE" :database_id 1}}]
        out (format-output matches)]
    (testing "curator-entered text is escaped in the XML output"
      (is (str/includes? out "<matched_on type=\"synonym\">P&amp;L by quarter &lt;2026&gt;</matched_on>"))
      (is (str/includes? out "<usage_instructions>Profit &amp; loss; values &lt; 0 are losses.</usage_instructions>")))))

(deftest weak-match-note-test
  (let [format-output (var-get #'entity-retrieval/format-output)
        matches [{:doc_type "name" :matched_text "MISC"
                  :usage_instructions "" :similarity 0.20 :weak? true
                  :score {:total_score 0.20}
                  :entity {:type "table" :id 7 :name "MISC" :database_id 1}}]
        out (format-output matches)]
    (testing "a weak top match prepends the cautionary note and marks confidence weak"
      (is (str/starts-with? out "<note>"))
      (is (str/includes? out "No strong library match"))
      (is (str/includes? out "confidence=\"weak\"")))))

(deftest flatten-data-test
  (let [flatten-data (var-get #'entity-retrieval/flatten-data)
        matches [{:doc_type "synonym" :matched_text "p1" :usage_instructions "u1"
                  :score {:total_score 0.9} :similarity 0.7 :weak? false
                  :entity {:type "metric" :id 9 :name "Revenue"}}
                 {:doc_type "name" :matched_text "p2" :usage_instructions "u2"
                  :score {:total_score 0.6} :similarity 0.3 :weak? true
                  :entity {:type "table" :id 1 :name "ORDERS"}}]
        out (flatten-data matches)]
    (testing "one annotated record per match"
      (is (= 2 (count out)))
      (is (=? [{:type "metric" :id 9 :matched_doc_type "synonym" :matched_text "p1"
                :usage_instructions "u1" :confidence "strong" :similarity 0.7}
               {:type "table" :id 1 :matched_doc_type "name" :matched_text "p2"
                :usage_instructions "u2" :confidence "weak" :similarity 0.3}]
              out)))))
