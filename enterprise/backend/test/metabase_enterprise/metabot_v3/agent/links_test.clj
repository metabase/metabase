(ns metabase-enterprise.metabot-v3.agent.links-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.links :as links]))

(deftest resolve-metabase-uri-test
  (testing "resolves query links"
    (let [query-id      "abc-123"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state  {}
          result        (links/resolve-metabase-uri "metabase://query/abc-123" queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#"))))

  (testing "returns nil for missing query"
    (let [result (links/resolve-metabase-uri "metabase://query/missing" {} {})]
      (is (nil? result))))

  (testing "resolves entity links"
    (is (= "/model/123" (links/resolve-metabase-uri "metabase://model/123" {} {})))
    (is (= "/metric/456" (links/resolve-metabase-uri "metabase://metric/456" {} {})))
    (is (= "/dashboard/789" (links/resolve-metabase-uri "metabase://dashboard/789" {} {})))
    (is (= "/question/101" (links/resolve-metabase-uri "metabase://question/101" {} {})))
    (is (= "/admin/transforms/202" (links/resolve-metabase-uri "metabase://transform/202" {} {})))
    (is (= "/table/123" (links/resolve-metabase-uri "metabase://table/123" {} {}))))

  (testing "returns nil for unknown entity types"
    (is (nil? (links/resolve-metabase-uri "metabase://unknown/123" {} {}))))

  (testing "returns nil for non-metabase URIs"
    (is (nil? (links/resolve-metabase-uri "https://example.com" {} {})))
    (is (nil? (links/resolve-metabase-uri "/question/123" {} {}))))

  (testing "returns nil for missing entity IDs"
    (is (nil? (links/resolve-metabase-uri "metabase://model/" {} {})))
    (is (nil? (links/resolve-metabase-uri "metabase://metric/" {} {})))
    (is (nil? (links/resolve-metabase-uri "metabase://query/" {} {}))))

  (testing "resolves chart links using chart state"
    (let [query-id      "query-abc"
          chart-id      "chart-123"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state  {chart-id {:query-id query-id :chart-type :bar}}
          result (links/resolve-metabase-uri "metabase://chart/chart-123" queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#"))))

  (testing "falls back to query when chart link uses query ID"
    ;; LLM sometimes uses metabase://chart/ when it should use metabase://query/
    (let [query-id      "qp_6a8c1d99-6f46-4ebb-9b7e-2fcad97a7f1c"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state  {}
          result (links/resolve-metabase-uri (str "metabase://chart/" query-id) queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest process-text-links-test
  (testing "processes metabase:// links in markdown"
    (let [query-id "test-query"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state {}
          text "Check out [My Results](metabase://query/test-query) for details."
          result (links/process-text-links text queries-state charts-state)]
      (is (str/includes? result "[My Results](/question#"))
      (is (not (str/includes? result "metabase://")))))

  (testing "preserves non-metabase links"
    (let [text "Visit [Google](https://google.com) for more."
          result (links/process-text-links text {} {})]
      (is (= text result))))

  (testing "handles multiple links"
    (let [text "[Model](metabase://model/1) and [Metric](metabase://metric/2)"
          result (links/process-text-links text {} {})]
      (is (str/includes? result "[Model](/model/1)"))
      (is (str/includes? result "[Metric](/metric/2)"))))

  (testing "handles text without links"
    (let [text "Just some plain text"
          result (links/process-text-links text {} {})]
      (is (= text result)))))

(deftest process-part-links-test
  (testing "processes text parts"
    (let [part {:type :text :text "[Link](metabase://model/123)"}
          result (links/process-part-links part {} {})]
      (is (= :text (:type result)))
      (is (= "[Link](/model/123)" (:text result)))))

  (testing "leaves non-text parts unchanged"
    (let [part {:type :tool-input :function "search" :arguments {:query "test"}}
          result (links/process-part-links part {} {})]
      (is (= part result)))))

(deftest process-parts-links-test
  (testing "processes all parts"
    (let [parts [{:type :text :text "[A](metabase://model/1)"}
                 {:type :tool-input :function "search"}
                 {:type :text :text "[B](metabase://metric/2)"}]
          result (links/process-parts-links parts {} {})]
      (is (= 3 (count result)))
      (is (= "[A](/model/1)" (-> result first :text)))
      (is (= {:type :tool-input :function "search"} (second result)))
      (is (= "[B](/metric/2)" (-> result (nth 2) :text))))))

;;; Nil handling tests - important for robustness against LLM edge cases

(deftest resolve-metabase-uri-nil-handling-test
  (testing "handles nil URI gracefully"
    (is (nil? (links/resolve-metabase-uri nil {} {}))))

  (testing "handles empty string URI"
    (is (nil? (links/resolve-metabase-uri "" {} {}))))

  (testing "handles nil queries-state and charts-state"
    (is (= "/model/123" (links/resolve-metabase-uri "metabase://model/123" nil nil)))
    (is (= "/metric/456" (links/resolve-metabase-uri "metabase://metric/456" nil nil)))))

(deftest process-text-links-nil-handling-test
  (testing "handles nil text gracefully"
    ;; Note: This test verifies the function doesn't throw on edge cases
    ;; The actual behavior may need adjustment based on requirements
    (let [result (links/process-text-links nil {} {})]
      (is (nil? result))))

  (testing "handles text with nil URL in regex capture groups"
    ;; This tests the case where markdown regex captures nil
    (let [text "Some text without links"
          result (links/process-text-links text {} {})]
      (is (= text result))))

  (testing "handles empty text"
    (let [result (links/process-text-links "" {} {})]
      (is (= "" result))))

  (testing "handles nil state maps"
    (let [text "[Link](metabase://model/123)"
          result (links/process-text-links text nil nil)]
      (is (str/includes? result "[Link](/model/123)")))))

(deftest process-part-links-edge-cases-test
  (testing "handles part with nil text"
    (let [part {:type :text :text nil}
          result (links/process-part-links part {} {})]
      (is (= :text (:type result)))
      (is (nil? (:text result)))))

  (testing "handles part with empty text"
    (let [part {:type :text :text ""}
          result (links/process-part-links part {} {})]
      (is (= :text (:type result)))
      (is (= "" (:text result)))))

  (testing "handles part without :type key"
    (let [part {:text "[Link](metabase://model/1)"}
          result (links/process-part-links part {} {})]
      ;; Should return unchanged since :type is not :text
      (is (= part result))))

  (testing "handles tool-output parts (should not process links)"
    (let [part {:type :tool-output :id "test-123" :result {:data "test"}}
          result (links/process-part-links part {} {})]
      (is (= part result)))))

(deftest chart-link-resolution-test
  (testing "resolves chart links correctly with state"
    (let [query-id      "q-abc-123"
          chart-id      "chart-xyz-789"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state  {chart-id {:query-id query-id :chart-type :bar}}
          result        (links/resolve-metabase-uri (str "metabase://chart/" chart-id) queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#"))))

  (testing "chart link returns nil when chart not found and no query fallback"
    (let [result (links/resolve-metabase-uri "metabase://chart/nonexistent" {} {})]
      (is (nil? result))))

  (testing "chart link falls back to query when chart-id matches query-id"
    (let [query-id      "shared-id-123"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state  {}
          result        (links/resolve-metabase-uri (str "metabase://chart/" query-id) queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#"))))

  (testing "chart link resolution with missing query-id in chart state"
    ;; Chart exists but references a query that doesn't exist
    (let [charts-state {"chart-1" {:query-id "missing-query" :chart-type :line}}
          result       (links/resolve-metabase-uri "metabase://chart/chart-1" {} charts-state)]
      ;; Should return nil since the underlying query can't be resolved
      (is (nil? result)))))

(deftest query-link-resolution-test
  (testing "resolves query links with valid query in state"
    (let [query-id      "test-query-id"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result))
      (is (str/starts-with? result "/question#"))))

  (testing "returns nil for missing query"
    (is (nil? (links/resolve-metabase-uri "metabase://query/nonexistent" {} {}))))

  (testing "handles query with complex nested structure"
    (let [query-id      "complex-query"
          query         {:database 1
                         :type     :query
                         :query    {:source-table 1
                                    :joins        [{:fields :all :source-table 2}]
                                    :filter       [:= [:field 1 nil] "test"]}}
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest multiple-links-in-text-test
  (testing "processes multiple different link types in same text"
    (let [query-id "q1"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          text "See [Model](metabase://model/1), [Metric](metabase://metric/2), and [Query](metabase://query/q1)"
          result (links/process-text-links text queries-state {})]
      (is (str/includes? result "[Model](/model/1)"))
      (is (str/includes? result "[Metric](/metric/2)"))
      (is (str/includes? result "/question#"))))

  (testing "preserves text between links"
    (let [text "Start [A](metabase://model/1) middle [B](metabase://model/2) end"
          result (links/process-text-links text {} {})]
      (is (str/includes? result "Start "))
      (is (str/includes? result " middle "))
      (is (str/includes? result " end")))))

(deftest special-characters-in-links-test
  (testing "handles link text with special characters"
    (let [text   "[Link with (parens)](metabase://model/1)"
          result (links/process-text-links text {} {})]
      ;; Markdown parser should handle this - may or may not match depending on regex
      (is (string? result))))

  (testing "handles entity IDs that look like UUIDs"
    (let [query-id      "550e8400-e29b-41d4-a716-446655440000"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result))))

  (testing "handles nano-id style identifiers"
    (let [query-id      "puL95JSvym3k23W1UUuog"
          query         {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result)))))
