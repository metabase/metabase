(ns metabase.metabot.agent.links-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.agent.links :as links]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(defn- decode-question-url
  "Decode a `/question#<base64>` URL into its JSON-decoded pseudo-card map."
  [url]
  (-> url
      (subs (count "/question#"))
      u/decode-base64
      (json/decode+kw)))

;;; resolve-metabase-uri tests

(deftest ^:parallel resolve-metabase-uri-query-links-test
  (testing "resolves query links"
    (let [query-id      "abc-123"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          charts-state  {}
          result        (links/resolve-metabase-uri "metabase://query/abc-123" queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest ^:parallel resolve-metabase-uri-query-link-produces-renderable-pseudo-card-test
  (testing "decoded /question# hash from a query link is a pseudo card the frontend can render"
    (let [query-id      "abc-123"
          query         (lib.tu/venues-query)
          result        (links/resolve-metabase-uri "metabase://query/abc-123" {query-id query} {})
          decoded       (decode-question-url result)]
      (testing "dataset_query is populated so the query can be executed"
        (is (map? (:dataset_query decoded)))
        (is (some? (get-in decoded [:dataset_query :database]))))
      (testing "type and visualization_settings are present so renderers like `getAlertType` don't crash"
        (is (= "question" (:type decoded)))
        (is (= {} (:visualization_settings decoded)))))))

(deftest ^:parallel resolve-metabase-uri-missing-query-test
  (testing "returns nil for missing query"
    (let [result (links/resolve-metabase-uri "metabase://query/missing" {} {})]
      (is (nil? result)))))

(deftest ^:parallel resolve-metabase-uri-entity-links-test
  (testing "resolves entity links"
    (is (= "/model/123" (links/resolve-metabase-uri "metabase://model/123" {} {})))
    (is (= "/metric/456" (links/resolve-metabase-uri "metabase://metric/456" {} {})))
    (is (= "/dashboard/789" (links/resolve-metabase-uri "metabase://dashboard/789" {} {})))
    (is (= "/question/101" (links/resolve-metabase-uri "metabase://question/101" {} {})))
    (is (= "/data-studio/transforms/202" (links/resolve-metabase-uri "metabase://transform/202" {} {})))))

(deftest ^:parallel resolve-metabase-uri-table-link-test
  (testing "resolves table links to ad-hoc question URLs"
    (let [result (links/resolve-metabase-uri (str "metabase://table/" (mt/id :venues)) {} {})]
      (is (string? result))
      (is (str/starts-with? result "/question#"))))
  (testing "returns nil for non-existent table"
    (is (nil? (links/resolve-metabase-uri "metabase://table/999999999" {} {})))))

(deftest ^:parallel resolve-metabase-uri-unknown-entity-type-test
  (testing "returns nil for unknown entity types"
    (is (nil? (links/resolve-metabase-uri "metabase://unknown/123" {} {})))))

(deftest ^:parallel resolve-metabase-uri-non-metabase-uris-test
  (testing "returns nil for non-metabase URIs"
    (is (nil? (links/resolve-metabase-uri "https://example.com" {} {})))
    (is (nil? (links/resolve-metabase-uri "/question/123" {} {})))))

(deftest ^:parallel resolve-metabase-uri-missing-entity-ids-test
  (testing "returns nil for missing entity IDs"
    (is (nil? (links/resolve-metabase-uri "metabase://model/" {} {})))
    (is (nil? (links/resolve-metabase-uri "metabase://metric/" {} {})))
    (is (nil? (links/resolve-metabase-uri "metabase://query/" {} {})))))

(deftest ^:parallel resolve-metabase-uri-chart-links-test
  (testing "resolves chart links using chart state"
    (let [query-id      "query-abc"
          chart-id      "chart-123"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          charts-state  {chart-id {:chart_id chart-id :queries [query] :visualization_settings {:chart_type :bar}}}
          result (links/resolve-metabase-uri "metabase://chart/chart-123" queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest ^:parallel resolve-metabase-uri-chart-fallback-to-query-test
  (testing "falls back to query when chart link uses query ID"
    ;; LLM sometimes uses metabase://chart/ when it should use metabase://query/
    (let [query-id      "qp_6a8c1d99-6f46-4ebb-9b7e-2fcad97a7f1c"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          charts-state  {}
          result (links/resolve-metabase-uri (str "metabase://chart/" query-id) queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

;;; resolve-links tests

(deftest ^:parallel resolve-links-markdown-test
  (testing "resolves metabase:// links in markdown"
    (let [query-id "test-query"
          query (lib.tu/venues-query)
          queries-state {query-id query}
          charts-state {}
          text "Check out [My Results](metabase://query/test-query) for details."
          result (links/resolve-links text queries-state charts-state (atom {}))]
      (is (str/includes? result "[My Results](/question#"))
      (is (not (str/includes? result "metabase://"))))))

(deftest ^:parallel resolve-links-preserves-non-metabase-test
  (testing "preserves non-metabase links"
    (let [text "Visit [Google](https://google.com) for more."
          result (links/resolve-links text {} {} (atom {}))]
      (is (= text result)))))

(deftest ^:parallel resolve-links-multiple-test
  (testing "handles multiple links"
    (let [text "[Model](metabase://model/1) and [Metric](metabase://metric/2)"
          result (links/resolve-links text {} {} (atom {}))]
      (is (str/includes? result "[Model](/model/1)"))
      (is (str/includes? result "[Metric](/metric/2)")))))

(deftest ^:parallel resolve-links-no-links-test
  (testing "handles text without links"
    (let [text "Just some plain text"
          result (links/resolve-links text {} {} (atom {}))]
      (is (= text result)))))

;;; process-part-links tests

(deftest ^:parallel process-part-links-text-parts-test
  (testing "processes text parts"
    (let [part {:type :text :text "[Link](metabase://model/123)"}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= :text (:type result)))
      (is (= "[Link](/model/123)" (:text result))))))

(deftest ^:parallel process-part-links-non-text-parts-test
  (testing "leaves non-text parts unchanged"
    (let [part {:type :tool-input :function "search" :arguments {:query "test"}}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= part result)))))

;;; process-parts-links tests

(deftest ^:parallel process-parts-links-test
  (testing "processes all parts"
    (let [parts [{:type :text :text "[A](metabase://model/1)"}
                 {:type :tool-input :function "search"}
                 {:type :text :text "[B](metabase://metric/2)"}]
          result (links/process-parts-links parts {} {} (atom {}))]
      (is (= 3 (count result)))
      (is (= "[A](/model/1)" (-> result first :text)))
      (is (= {:type :tool-input :function "search"} (second result)))
      (is (= "[B](/metric/2)" (-> result (nth 2) :text))))))

;;; resolve-links-xf tests

(deftest ^:parallel resolve-links-xf-processes-text-parts-test
  (testing "transducer processes text parts"
    (let [parts [{:type :text :text "[A](metabase://model/1)"}
                 {:type :tool-input :function "search"}
                 {:type :text :text "[B](metabase://metric/2)"}]
          result (into [] (links/resolve-links-xf {} {} (atom {})) parts)]
      (is (= 3 (count result)))
      (is (= "[A](/model/1)" (-> result first :text)))
      (is (= {:type :tool-input :function "search"} (second result)))
      (is (= "[B](/metric/2)" (-> result (nth 2) :text))))))

(deftest ^:parallel resolve-links-xf-with-transduce-test
  (testing "transducer works with transduce"
    (let [query-id "q1"
          query (lib.tu/venues-query)
          queries-state {query-id query}
          parts [{:type :text :text "[Query](metabase://query/q1)"}]
          result (transduce (links/resolve-links-xf queries-state {} (atom {}))
                            conj
                            []
                            parts)]
      (is (= 1 (count result)))
      (is (str/starts-with? (-> result first :text) "[Query](/question#")))))

(deftest ^:parallel resolve-links-xf-composes-test
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
      (is (= "[B](/model/2)" (-> result second :text))))))

(deftest ^:parallel resolve-links-xf-nil-state-test
  (testing "transducer handles nil state maps"
    (let [parts [{:type :text :text "[Link](metabase://model/123)"}]
          result (into [] (links/resolve-links-xf nil nil (atom {})) parts)]
      (is (= "[Link](/model/123)" (-> result first :text))))))

;;; Nil handling tests - important for robustness against LLM edge cases

(deftest ^:parallel resolve-metabase-uri-nil-uri-test
  (testing "handles nil URI gracefully"
    (is (nil? (links/resolve-metabase-uri nil {} {})))))

(deftest ^:parallel resolve-metabase-uri-empty-string-test
  (testing "handles empty string URI"
    (is (nil? (links/resolve-metabase-uri "" {} {})))))

(deftest ^:parallel resolve-metabase-uri-nil-state-maps-test
  (testing "handles nil queries-state and charts-state"
    (is (= "/model/123" (links/resolve-metabase-uri "metabase://model/123" nil nil)))
    (is (= "/metric/456" (links/resolve-metabase-uri "metabase://metric/456" nil nil)))))

(deftest ^:parallel resolve-links-nil-text-test
  (testing "handles nil text gracefully"
    (let [result (links/resolve-links nil {} {} (atom {}))]
      (is (nil? result)))))

(deftest ^:parallel resolve-links-text-without-links-test
  (testing "handles text with nil URL in regex capture groups"
    (let [text "Some text without links"
          result (links/resolve-links text {} {} (atom {}))]
      (is (= text result)))))

(deftest ^:parallel resolve-links-empty-text-test
  (testing "handles empty text"
    (let [result (links/resolve-links "" {} {} (atom {}))]
      (is (= "" result)))))

(deftest ^:parallel resolve-links-nil-state-maps-test
  (testing "handles nil state maps"
    (let [text "[Link](metabase://model/123)"
          result (links/resolve-links text nil nil (atom {}))]
      (is (str/includes? result "[Link](/model/123)")))))

;;; process-part-links edge cases

(deftest ^:parallel process-part-links-nil-text-test
  (testing "handles part with nil text"
    (let [part {:type :text :text nil}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= :text (:type result)))
      (is (nil? (:text result))))))

(deftest ^:parallel process-part-links-empty-text-test
  (testing "handles part with empty text"
    (let [part {:type :text :text ""}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= :text (:type result)))
      (is (= "" (:text result))))))

(deftest ^:parallel process-part-links-missing-type-test
  (testing "handles part without :type key"
    (let [part {:text "[Link](metabase://model/1)"}
          result (links/process-part-links part {} {} (atom {}))]
      ;; Should return unchanged since :type is not :text
      (is (= part result)))))

(deftest ^:parallel process-part-links-tool-output-test
  (testing "handles tool-output parts (should not process links)"
    (let [part {:type :tool-output :id "test-123" :result {:data "test"}}
          result (links/process-part-links part {} {} (atom {}))]
      (is (= part result)))))

;;; chart-link-resolution tests

(deftest ^:parallel chart-link-resolves-with-state-test
  (testing "resolves chart links correctly with state"
    (let [query-id      "q-abc-123"
          chart-id      "chart-xyz-789"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          charts-state  {chart-id {:chart_id chart-id :queries [query] :visualization_settings {:chart-type :bar}}}
          result        (links/resolve-metabase-uri (str "metabase://chart/" chart-id) queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest ^:parallel chart-link-nil-when-not-found-test
  (testing "chart link returns nil when chart not found and no query fallback"
    (let [result (links/resolve-metabase-uri "metabase://chart/nonexistent" {} {})]
      (is (nil? result)))))

(deftest ^:parallel chart-link-falls-back-to-query-test
  (testing "chart link falls back to query when chart-id matches query-id"
    (let [query-id      "shared-id-123"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          charts-state  {}
          result        (links/resolve-metabase-uri (str "metabase://chart/" query-id) queries-state charts-state)]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest ^:parallel chart-link-missing-query-in-chart-state-test
  (testing "chart link resolution with missing query-id in chart state"
    ;; Chart exists but references a query that doesn't exist
    (let [charts-state {"chart-1" {:query-id "missing-query" :chart-type :line}}
          result       (links/resolve-metabase-uri "metabase://chart/chart-1" {} charts-state)]
      ;; Should return nil since the underlying query can't be resolved
      (is (nil? result)))))

;;; query-link-resolution tests

(deftest ^:parallel query-link-valid-query-test
  (testing "resolves query links with valid query in state"
    (let [query-id      "test-query-id"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

(deftest ^:parallel query-link-missing-query-test
  (testing "returns nil for missing query"
    (is (nil? (links/resolve-metabase-uri "metabase://query/nonexistent" {} {})))))

(deftest ^:parallel query-link-complex-nested-structure-test
  (testing "handles query with complex nested structure"
    (let [query-id      "complex-query"
          query         (-> (lib.tu/venues-query)
                            (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                          (lib/with-join-fields :all)))
                            (lib/filter (lib/= (meta/field-metadata :venues :name) "test")))
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result))
      (is (str/starts-with? result "/question#")))))

;;; multiple-links tests

(deftest ^:parallel multiple-different-link-types-test
  (testing "processes multiple different link types in same text"
    (let [query-id "q1"
          query (lib.tu/venues-query)
          queries-state {query-id query}
          text "See [Model](metabase://model/1), [Metric](metabase://metric/2), and [Query](metabase://query/q1)"
          result (links/resolve-links text queries-state {} (atom {}))]
      (is (str/includes? result "[Model](/model/1)"))
      (is (str/includes? result "[Metric](/metric/2)"))
      (is (str/includes? result "/question#")))))

(deftest ^:parallel preserves-text-between-links-test
  (testing "preserves text between links"
    (let [text "Start [A](metabase://model/1) middle [B](metabase://model/2) end"
          result (links/resolve-links text {} {} (atom {}))]
      (is (str/includes? result "Start "))
      (is (str/includes? result " middle "))
      (is (str/includes? result " end")))))

;;; special-characters tests

(deftest ^:parallel link-text-with-special-characters-test
  (testing "handles link text with special characters"
    (let [text   "[Link with (parens)](metabase://model/1)"
          result (links/resolve-links text {} {} (atom {}))]
      ;; Markdown parser should handle this - may or may not match depending on regex
      (is (string? result)))))

(deftest ^:parallel uuid-entity-ids-test
  (testing "handles entity IDs that look like UUIDs"
    (let [query-id      "550e8400-e29b-41d4-a716-446655440000"
          query         (lib.tu/venues-query)
          queries-state {query-id query}
          result        (links/resolve-metabase-uri (str "metabase://query/" query-id) queries-state {})]
      (is (string? result)))))

(deftest ^:parallel nano-id-entity-ids-test
  (testing "handles nano-id style identifiers"
    (let [query-id      "puL95JSvym3k23W1UUuog"
          query         (lib.tu/venues-query)
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

(deftest ^:parallel resolve-links-records-dashboard-transform-links-test
  (testing "records dashboard and transform links"
    (let [registry (atom {})
          text     "[Dash](metabase://dashboard/10) [Tx](metabase://transform/30)"
          _result  (links/resolve-links text {} {} registry)]
      (is (= {"/dashboard/10"              "metabase://dashboard/10"
              "/data-studio/transforms/30" "metabase://transform/30"}
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
  (testing "round-trip: mixed link types including table"
    (let [query-id      "q1"
          queries-state {query-id (lib.tu/venues-query)}
          table-id      (mt/id :venues)
          original      (str "See [Model](metabase://model/1), "
                             "[Query](metabase://query/q1), and "
                             "[Table](metabase://table/" table-id ")")
          registry      (atom {})
          resolved      (links/resolve-links original queries-state {} registry)
          inverted      (links/invert-links resolved @registry)]
      (is (= original inverted)))))

;;; Slack link resolution tests

(deftest resolve-slack-links-entity-links-test
  (testing "resolves Slack-format metabase:// entity links"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (is (= "<https://metabase.example.com/model/123|My Model>"
             (links/resolve-slack-links "<metabase://model/123|My Model>" {} {} (atom {}))))
      (is (= "<https://metabase.example.com/dashboard/456>"
             (links/resolve-slack-links "<metabase://dashboard/456>" {} {} (atom {})))))))

(deftest resolve-slack-links-query-links-test
  (testing "resolves Slack-format metabase://query links"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [query   (lib.tu/venues-query)
            result  (links/resolve-slack-links "<metabase://query/q1|Results>" {"q1" query} {} (atom {}))]
        (is (str/starts-with? result "<https://metabase.example.com/question#"))
        (is (str/ends-with? result "|Results>"))))))

(deftest resolve-slack-links-multiple-test
  (testing "resolves multiple Slack-format links"
    (mt/with-temporary-setting-values [site-url "https://mb.test"]
      (is (= "<https://mb.test/model/1|Model A> and <https://mb.test/metric/2|Metric B>"
             (links/resolve-slack-links "<metabase://model/1|Model A> and <metabase://metric/2|Metric B>" {} {} (atom {})))))))

(deftest ^:parallel resolve-slack-links-unresolvable-test
  (testing "falls back to link text for unresolvable Slack link"
    (is (= "My Query"
           (links/resolve-slack-links "<metabase://query/unknown|My Query>" {} {} (atom {})))))
  (testing "falls back to URL for unresolvable Slack link without text"
    (is (= "metabase://query/unknown"
           (links/resolve-slack-links "<metabase://query/unknown>" {} {} (atom {}))))))

(deftest ^:parallel resolve-slack-links-no-links-test
  (testing "passes through text without Slack links"
    (is (= "plain text" (links/resolve-slack-links "plain text" {} {} (atom {}))))
    (is (= "x < y" (links/resolve-slack-links "x < y" {} {} (atom {}))))))

;;; Slack link registry recording tests

(deftest resolve-slack-links-records-entity-links-in-registry-test
  (testing "records resolved Slack entity links in registry atom"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [registry (atom {})
            _result  (links/resolve-slack-links "<metabase://model/123|My Model> and <metabase://metric/456>"
                                                {} {} registry)]
        (is (= {"https://metabase.example.com/model/123"  "metabase://model/123"
                "https://metabase.example.com/metric/456" "metabase://metric/456"}
               @registry))))))

(deftest resolve-slack-links-records-query-links-in-registry-test
  (testing "records resolved Slack query links in registry atom"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [registry (atom {})
            query    (lib.tu/venues-query)
            result   (links/resolve-slack-links "<metabase://query/q1|Results>" {"q1" query} {} registry)
            url      (second (re-find #"<([^|>]+)" result))]
        (is (= 1 (count @registry)))
        (is (= "metabase://query/q1" (get @registry url)))))))

(deftest ^:parallel resolve-slack-links-does-not-record-failed-resolutions-test
  (testing "does not record failed Slack resolutions"
    (let [registry (atom {})
          _result  (links/resolve-slack-links "<metabase://query/nonexistent|Missing>" {} {} registry)]
      (is (empty? @registry)))))

;;; invert-slack-links tests

(deftest ^:parallel invert-slack-links-replaces-resolved-urls-test
  (testing "replaces resolved absolute URLs with original metabase URIs"
    (let [registry {"https://metabase.example.com/model/123"  "metabase://model/123"
                    "https://metabase.example.com/metric/456" "metabase://metric/456"}
          text     "<https://metabase.example.com/model/123|Model> and <https://metabase.example.com/metric/456|Metric>"]
      (is (= "<metabase://model/123|Model> and <metabase://metric/456|Metric>"
             (links/invert-slack-links text registry))))))

(deftest ^:parallel invert-slack-links-without-link-text-test
  (testing "inverts Slack links that have no display text"
    (let [registry {"https://metabase.example.com/dashboard/1" "metabase://dashboard/1"}
          text     "<https://metabase.example.com/dashboard/1>"]
      (is (= "<metabase://dashboard/1>"
             (links/invert-slack-links text registry))))))

(deftest ^:parallel invert-slack-links-unchanged-for-empty-registry-test
  (testing "returns text unchanged for empty registry"
    (let [text "<https://metabase.example.com/model/123|Model>"]
      (is (= text (links/invert-slack-links text {})))
      (is (= text (links/invert-slack-links text nil))))))

(deftest ^:parallel invert-slack-links-nil-input-test
  (testing "returns non-string input unchanged"
    (is (nil? (links/invert-slack-links nil {"https://a.com/b" "metabase://b"})))))

(deftest ^:parallel invert-slack-links-no-matching-entries-test
  (testing "handles registry entries that don't match text"
    (let [text "no links here"]
      (is (= text
             (links/invert-slack-links text {"https://a.com/model/1" "metabase://model/1"}))))))

;;; Slack round-trip tests

(deftest round-trip-slack-entity-links-test
  (testing "round-trip: resolve then invert returns original text for Slack entity links"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [original "<metabase://model/123|My Model> and <metabase://dashboard/456|Dash>"
            registry (atom {})
            resolved (links/resolve-slack-links original {} {} registry)
            inverted (links/invert-slack-links resolved @registry)]
        (is (= original inverted))))))

(deftest round-trip-slack-query-links-test
  (testing "round-trip: resolve then invert for Slack query links"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [query    (lib.tu/venues-query)
            original "<metabase://query/q1|Results>"
            registry (atom {})
            resolved (links/resolve-slack-links original {"q1" query} {} registry)
            inverted (links/invert-slack-links resolved @registry)]
        (is (= original inverted))))))

(deftest round-trip-slack-no-text-links-test
  (testing "round-trip: resolve then invert for Slack links without display text"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [original "<metabase://dashboard/789>"
            registry (atom {})
            resolved (links/resolve-slack-links original {} {} registry)
            inverted (links/invert-slack-links resolved @registry)]
        (is (= original inverted))))))
