(ns metabase.metabot.agent.links-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.agent.links :as links]))

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

(deftest resolve-links-test
  (testing "resolves metabase:// links in markdown"
    (let [query-id "test-query"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          charts-state {}
          text "Check out [My Results](metabase://query/test-query) for details."
          result (links/resolve-links text queries-state charts-state (atom {}))]
      (is (str/includes? result "[My Results](/question#"))
      (is (not (str/includes? result "metabase://")))))

  (testing "preserves non-metabase links"
    (let [text "Visit [Google](https://google.com) for more."
          result (links/resolve-links text {} {} (atom {}))]
      (is (= text result))))

  (testing "handles multiple links"
    (let [text "[Model](metabase://model/1) and [Metric](metabase://metric/2)"
          result (links/resolve-links text {} {} (atom {}))]
      (is (str/includes? result "[Model](/model/1)"))
      (is (str/includes? result "[Metric](/metric/2)"))))

  (testing "handles text without links"
    (let [text "Just some plain text"
          result (links/resolve-links text {} {} (atom {}))]
      (is (= text result)))))

(deftest process-part-links-test
  (testing "processes text parts"
    (let [part {:type :text :text "[Link](metabase://model/123)"}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= :text (:type result)))
      (is (= "[Link](/model/123)" (:text result)))))

  (testing "leaves non-text parts unchanged"
    (let [part {:type :tool-input :function "search" :arguments {:query "test"}}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= part result)))))

(deftest process-parts-links-test
  (testing "processes all parts"
    (let [parts [{:type :text :text "[A](metabase://model/1)"}
                 {:type :tool-input :function "search"}
                 {:type :text :text "[B](metabase://metric/2)"}]
          result (links/process-parts-links parts {} {} (atom {}))]
      (is (= 3 (count result)))
      (is (= "[A](/model/1)" (-> result first :text)))
      (is (= {:type :tool-input :function "search"} (second result)))
      (is (= "[B](/metric/2)" (-> result (nth 2) :text))))))

(deftest resolve-links-xf-test
  (testing "transducer processes text parts"
    (let [parts [{:type :text :text "[A](metabase://model/1)"}
                 {:type :tool-input :function "search"}
                 {:type :text :text "[B](metabase://metric/2)"}]
          result (into [] (links/resolve-links-xf {} {} (atom {})) parts)]
      (is (= 3 (count result)))
      (is (= "[A](/model/1)" (-> result first :text)))
      (is (= {:type :tool-input :function "search"} (second result)))
      (is (= "[B](/metric/2)" (-> result (nth 2) :text)))))

  (testing "transducer works with transduce"
    (let [query-id "q1"
          query {:database 1 :type :query :query {:source-table 1}}
          queries-state {query-id query}
          parts [{:type :text :text "[Query](metabase://query/q1)"}]
          result (transduce (links/resolve-links-xf queries-state {} (atom {}))
                            conj
                            []
                            parts)]
      (is (= 1 (count result)))
      (is (str/starts-with? (-> result first :text) "[Query](/question#"))))

  (testing "transducer composes with other transducers"
    (let [parts [{:type :text :text "[A](metabase://model/1)"}
                 {:type :text :text "[B](metabase://model/2)"}
                 {:type :tool-input :function "search"}]
          result (into []
                       (comp (links/resolve-links-xf {} {} (atom {}))
                             (filter #(= :text (:type %))))
                       parts)]
      (is (= 2 (count result)))
      (is (= "[A](/model/1)" (-> result first :text)))
      (is (= "[B](/model/2)" (-> result second :text)))))

  (testing "transducer handles nil state maps"
    (let [parts [{:type :text :text "[Link](metabase://model/123)"}]
          result (into [] (links/resolve-links-xf nil nil (atom {})) parts)]
      (is (= "[Link](/model/123)" (-> result first :text))))))

;;; Nil handling tests - important for robustness against LLM edge cases

(deftest resolve-metabase-uri-nil-handling-test
  (testing "handles nil URI gracefully"
    (is (nil? (links/resolve-metabase-uri nil {} {}))))

  (testing "handles empty string URI"
    (is (nil? (links/resolve-metabase-uri "" {} {}))))

  (testing "handles nil queries-state and charts-state"
    (is (= "/model/123" (links/resolve-metabase-uri "metabase://model/123" nil nil)))
    (is (= "/metric/456" (links/resolve-metabase-uri "metabase://metric/456" nil nil)))))

(deftest resolve-links-nil-handling-test
  (testing "handles nil text gracefully"
    ;; Note: This test verifies the function doesn't throw on edge cases
    ;; The actual behavior may need adjustment based on requirements
    (let [result (links/resolve-links nil {} {} (atom {}))]
      (is (nil? result))))

  (testing "handles text with nil URL in regex capture groups"
    ;; This tests the case where markdown regex captures nil
    (let [text "Some text without links"
          result (links/resolve-links text {} {} (atom {}))]
      (is (= text result))))

  (testing "handles empty text"
    (let [result (links/resolve-links "" {} {} (atom {}))]
      (is (= "" result))))

  (testing "handles nil state maps"
    (let [text "[Link](metabase://model/123)"
          result (links/resolve-links text nil nil (atom {}))]
      (is (str/includes? result "[Link](/model/123)")))))

(deftest process-part-links-edge-cases-test
  (testing "handles part with nil text"
    (let [part {:type :text :text nil}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= :text (:type result)))
      (is (nil? (:text result)))))

  (testing "handles part with empty text"
    (let [part {:type :text :text ""}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= :text (:type result)))
      (is (= "" (:text result)))))

  (testing "handles part without :type key"
    (let [part {:text "[Link](metabase://model/1)"}
          result (links/process-part-links part {} {} (atom {}))]
      ;; Should return unchanged since :type is not :text
      (is (= part result))))

  (testing "handles tool-output parts (should not process links)"
    (let [part {:type :tool-output :id "test-123" :result {:data "test"}}
          result (links/process-part-links part {} {} (atom {}))]
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
          result (links/resolve-links text queries-state {} (atom {}))]
      (is (str/includes? result "[Model](/model/1)"))
      (is (str/includes? result "[Metric](/metric/2)"))
      (is (str/includes? result "/question#"))))

  (testing "preserves text between links"
    (let [text "Start [A](metabase://model/1) middle [B](metabase://model/2) end"
          result (links/resolve-links text {} {} (atom {}))]
      (is (str/includes? result "Start "))
      (is (str/includes? result " middle "))
      (is (str/includes? result " end")))))

(deftest special-characters-in-links-test
  (testing "handles link text with special characters"
    (let [text   "[Link with (parens)](metabase://model/1)"
          result (links/resolve-links text {} {} (atom {}))]
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

;;; Link registry recording tests

(deftest ^:parallel resolve-links-records-entity-links-in-registry-test
  (testing "records resolved entity links in registry atom"
    (let [registry (atom {})
          text     "[Model](metabase://model/123) and [Metric](metabase://metric/456)"
          _result  (links/resolve-links text {} {} registry)]
      (is (= {"/model/123"  "metabase://model/123"
              "/metric/456" "metabase://metric/456"}
             @registry)))))

(deftest ^:parallel resolve-links-records-query-links-in-registry-test
  (testing "records resolved query links in registry atom"
    (let [registry      (atom {})
          query-id      "q1"
          queries-state {query-id (lib.tu/venues-query)}
          result        (links/resolve-links "[Results](metabase://query/q1)" queries-state {} registry)
          resolved-url  (second (re-find #"\[Results\]\((/question#[^)]+)\)" result))]
      (is (= 1 (count @registry)))
      (is (= "metabase://query/q1" (get @registry resolved-url))))))

(deftest ^:parallel resolve-links-records-dashboard-table-transform-links-test
  (testing "records dashboard, table, and transform links"
    (let [registry (atom {})
          text     "[Dash](metabase://dashboard/10) [Tbl](metabase://table/20) [Tx](metabase://transform/30)"
          _result  (links/resolve-links text {} {} registry)]
      (is (= {"/dashboard/10"        "metabase://dashboard/10"
              "/table/20"            "metabase://table/20"
              "/admin/transforms/30" "metabase://transform/30"}
             @registry)))))

(deftest ^:parallel resolve-links-does-not-record-failed-resolutions-test
  (testing "does not record failed resolutions"
    (let [registry (atom {})
          text     "[Missing](metabase://query/nonexistent)"
          _result  (links/resolve-links text {} {} registry)]
      (is (empty? @registry)))))

(deftest ^:parallel resolve-links-does-not-record-non-metabase-links-test
  (testing "does not record non-metabase links"
    (let [registry (atom {})
          text     "[Google](https://google.com)"
          _result  (links/resolve-links text {} {} registry)]
      (is (empty? @registry)))))

;;; invert-links tests

(deftest ^:parallel invert-links-replaces-resolved-urls-test
  (testing "replaces resolved URLs with original metabase URIs"
    (let [registry {"/model/123"  "metabase://model/123"
                    "/metric/456" "metabase://metric/456"}
          text     "[Model](/model/123) and [Metric](/metric/456)"]
      (is (= "[Model](metabase://model/123) and [Metric](metabase://metric/456)"
             (links/invert-links text registry))))))

(deftest ^:parallel invert-links-unchanged-for-empty-registry-test
  (testing "returns text unchanged for empty registry"
    (let [text "some text with [Link](/model/123)"]
      (is (= text (links/invert-links text {})))
      (is (= text (links/invert-links text nil))))))

(deftest ^:parallel invert-links-nil-input-test
  (testing "returns non-string input unchanged"
    (is (nil? (links/invert-links nil {"/a" "b"})))))

(deftest ^:parallel invert-links-no-matching-entries-test
  (testing "handles registry entries that don't match text"
    (let [text "no links here"]
      (is (= text
             (links/invert-links text {"/model/999" "metabase://model/999"}))))))

(deftest ^:parallel invert-links-base64-with-regex-special-chars-test
  (testing "handles base64 URLs with regex-special characters"
    (let [resolved "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7fX0="
          original "metabase://query/q1"
          registry {resolved original}
          text     (str "[Results](" resolved ")")]
      (is (= "[Results](metabase://query/q1)"
             (links/invert-links text registry))))))

(deftest ^:parallel invert-links-only-replaces-inside-markdown-links-test
  (testing "does not replace URLs that appear outside of markdown link syntax"
    (let [registry {"/model/123" "metabase://model/123"}
          text     "Visit /model/123 or see [Model](/model/123) for details"]
      (is (= "Visit /model/123 or see [Model](metabase://model/123) for details"
             (links/invert-links text registry))))))

;;; Round-trip tests

(deftest ^:parallel round-trip-entity-links-test
  (testing "round-trip: resolve then invert returns original text for entity links"
    (let [original "[Model](metabase://model/123) and [Dashboard](metabase://dashboard/456)"
          registry (atom {})
          resolved (links/resolve-links original {} {} registry)
          inverted (links/invert-links resolved @registry)]
      (is (= original inverted)))))

(deftest ^:parallel round-trip-query-links-test
  (testing "round-trip: resolve then invert for query links"
    (let [query-id      "q1"
          queries-state {query-id (lib.tu/venues-query)}
          original      "[Results](metabase://query/q1)"
          registry      (atom {})
          resolved      (links/resolve-links original queries-state {} registry)
          inverted      (links/invert-links resolved @registry)]
      (is (= original inverted)))))

(deftest ^:parallel round-trip-mixed-link-types-test
  (testing "round-trip: mixed link types"
    (let [query-id      "q1"
          queries-state {query-id (lib.tu/venues-query)}
          original      (str "See [Model](metabase://model/1), "
                             "[Query](metabase://query/q1), and "
                             "[Table](metabase://table/42)")
          registry      (atom {})
          resolved      (links/resolve-links original queries-state {} registry)
          inverted      (links/invert-links resolved @registry)]
      (is (= original inverted)))))
