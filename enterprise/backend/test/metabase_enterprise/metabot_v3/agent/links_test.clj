(ns metabase-enterprise.metabot-v3.agent.links-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.links :as links]))

(deftest resolve-metabase-uri-test
  (testing "resolves query links"
    (let [query-id "abc-123"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state {}]
      (let [result (links/resolve-metabase-uri "metabase://query/abc-123" queries-state charts-state)]
        (is (string? result))
        (is (clojure.string/starts-with? result "/question#")))))

  (testing "returns nil for missing query"
    (let [result (links/resolve-metabase-uri "metabase://query/missing" {} {})]
      (is (nil? result))))

  (testing "resolves entity links"
    (is (= "/model/123" (links/resolve-metabase-uri "metabase://model/123" {} {})))
    (is (= "/metric/456" (links/resolve-metabase-uri "metabase://metric/456" {} {})))
    (is (= "/dashboard/789" (links/resolve-metabase-uri "metabase://dashboard/789" {} {})))
    (is (= "/question/101" (links/resolve-metabase-uri "metabase://question/101" {} {})))
    (is (= "/admin/transforms/202" (links/resolve-metabase-uri "metabase://transform/202" {} {}))))

  (testing "returns nil for unknown entity types"
    (is (nil? (links/resolve-metabase-uri "metabase://unknown/123" {} {}))))

  (testing "returns nil for non-metabase URIs"
    (is (nil? (links/resolve-metabase-uri "https://example.com" {} {})))
    (is (nil? (links/resolve-metabase-uri "/question/123" {} {}))))

  (testing "resolves chart links using chart state"
    (let [query-id "query-abc"
          chart-id "chart-123"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state {chart-id {:query-id query-id :chart-type :bar}}]
      (let [result (links/resolve-metabase-uri "metabase://chart/chart-123" queries-state charts-state)]
        (is (string? result))
        (is (clojure.string/starts-with? result "/question#")))))

  (testing "falls back to query when chart link uses query ID"
    ;; LLM sometimes uses metabase://chart/ when it should use metabase://query/
    (let [query-id "qp_6a8c1d99-6f46-4ebb-9b7e-2fcad97a7f1c"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state {}]
      (let [result (links/resolve-metabase-uri (str "metabase://chart/" query-id) queries-state charts-state)]
        (is (string? result))
        (is (clojure.string/starts-with? result "/question#"))))))

(deftest process-text-links-test
  (testing "processes metabase:// links in markdown"
    (let [query-id "test-query"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state {}
          text "Check out [My Results](metabase://query/test-query) for details."
          result (links/process-text-links text queries-state charts-state)]
      (is (clojure.string/includes? result "[My Results](/question#"))
      (is (not (clojure.string/includes? result "metabase://")))))

  (testing "preserves non-metabase links"
    (let [text "Visit [Google](https://google.com) for more."
          result (links/process-text-links text {} {})]
      (is (= text result))))

  (testing "handles multiple links"
    (let [text "[Model](metabase://model/1) and [Metric](metabase://metric/2)"
          result (links/process-text-links text {} {})]
      (is (clojure.string/includes? result "[Model](/model/1)"))
      (is (clojure.string/includes? result "[Metric](/metric/2)"))))

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
