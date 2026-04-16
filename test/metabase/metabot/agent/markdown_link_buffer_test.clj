(ns metabase.metabot.agent.markdown-link-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.markdown-link-buffer :as mlb]
   [metabase.test :as mt]))

(defn- process
  "Process text through a fresh state with given queries/charts context.
   Returns [output flushed]."
  ([text] (process text {} {}))
  ([text queries] (process text queries {}))
  ([text queries charts]
   (let [[state output] (mlb/step (mlb/with-context mlb/initial-state queries charts (atom {})) text)]
     [output (mlb/flush-state state)])))

(defn- process-with-registry
  "Like `process` but returns [output flushed registry-map]."
  ([text] (process-with-registry text {} {}))
  ([text queries] (process-with-registry text queries {}))
  ([text queries charts]
   (let [registry (atom {})
         [state output] (mlb/step (mlb/with-context mlb/initial-state queries charts registry) text)]
     [output (mlb/flush-state state) @registry])))

(defn- process-chunks
  "Process multiple chunks through state, returns [outputs flushed]."
  ([chunks] (process-chunks chunks {} {}))
  ([chunks queries] (process-chunks chunks queries {}))
  ([chunks queries charts]
   (loop [state (mlb/with-context mlb/initial-state queries charts (atom {}))
          [chunk & more] chunks
          outputs []]
     (if chunk
       (let [[new-state output] (mlb/step state chunk)]
         (recur new-state more (conj outputs output)))
       [outputs (mlb/flush-state state)]))))

(defn- process-chunks-with-registry
  "Like `process-chunks` but returns [outputs flushed registry-map]."
  ([chunks] (process-chunks-with-registry chunks {} {}))
  ([chunks queries] (process-chunks-with-registry chunks queries {}))
  ([chunks queries charts]
   (let [registry (atom {})]
     (loop [state (mlb/with-context mlb/initial-state queries charts registry)
            [chunk & more] chunks
            outputs []]
       (if chunk
         (let [[new-state output] (mlb/step state chunk)]
           (recur new-state more (conj outputs output)))
         [outputs (mlb/flush-state state) @registry])))))

;;; State machine / buffering tests

(deftest ^:parallel nested-bracket-handling-test
  (testing "does not drop characters when nested brackets appear"
    (let [[output flushed] (process "[foo[")]
      (is (= "[foo" output))
      (is (= "[" flushed)))))

(deftest ^:parallel basic-text-passthrough-test
  (testing "passes through plain text unchanged"
    (let [[output flushed] (process "Hello world")]
      (is (= "Hello world" output))
      (is (= "" flushed)))))

(deftest ^:parallel buffering-incomplete-link-test
  (testing "buffers incomplete markdown link"
    (let [[outputs flushed] (process-chunks ["Check [link" "](http://example.com)"])]
      (is (= ["Check " "[link](http://example.com)"] outputs))
      (is (= "" flushed))))

  (testing "buffers link split across multiple chunks"
    (let [[outputs flushed] (process-chunks ["See [My " "Link](http:" "//example.com)"])]
      (is (= ["See " "" "[My Link](http://example.com)"] outputs))
      (is (= "" flushed))))

  (testing "flushes incomplete link at end of stream"
    (let [[output flushed] (process "Incomplete [link")]
      (is (= "Incomplete " output))
      (is (= "[link" flushed)))))

(deftest ^:parallel regular-url-passthrough-test
  (testing "passes through regular URLs unchanged"
    (let [[output flushed] (process "[Google](https://google.com)")]
      (is (= "[Google](https://google.com)" output))
      (is (= "" flushed)))))

;;; metabase:// link resolution tests

(def resolved-link-re #"\[Results\]\(/question#[a-zA-ZZ0-9=]+\)")

(deftest ^:parallel resolve-query-link-test
  (testing "resolves metabase://query links using queries-state"
    (let [query (lib.tu/venues-query)
          [output flushed] (process "[Results](metabase://query/q-123)" {"q-123" query})]
      (is (=? resolved-link-re output))
      (is (not (re-find #"metabase://" output)))
      (is (= "" flushed))))

  (testing "falls back to link text for unknown query"
    (let [[output flushed] (process "[Results](metabase://query/unknown)")]
      (is (= "Results" output))
      (is (= "" flushed))))

  (testing "incomplete chunks are also replaced well"
    (let [query (lib.tu/venues-query)
          [output flushed] (process-chunks ["Your [Res" "ults](metabase://qu" "ery/q-123)"] {"q-123" query})]
      (is (=? ["Your " "" resolved-link-re] output))
      (is (= "" flushed)))))

(deftest ^:parallel resolve-chart-link-test
  (testing "resolves metabase://chart links using charts-state"
    (let [query (lib.tu/venues-query)
          queries {"q-456" query}
          charts {"c-789" {:chart_id "c789" :queries [query] :visualization_settings {:chart_type :bar}}}
          [output flushed] (process "[My Chart](metabase://chart/c-789)" queries charts)]
      (is (re-find #"\[My Chart\]\(/question#" output))
      (is (not (re-find #"metabase://" output)))
      (is (= "" flushed))))

  (testing "falls back to link text for unknown chart"
    (let [[output flushed] (process "[Chart](metabase://chart/unknown)")]
      (is (= "Chart" output))
      (is (= "" flushed)))))

(deftest ^:parallel resolve-table-link-test
  (testing "resolves metabase://table links to ad-hoc question URLs"
    (let [table-id (mt/id :venues)
          [output flushed] (process (str "[Users Table](metabase://table/" table-id ")"))]
      (is (re-find #"\[Users Table\]\(/question#.+\)" output))
      (is (= "" flushed))))

  (testing "falls back to link text for unknown table"
    (let [[output flushed] (process "[Unknown Table](metabase://table/999999999)")]
      (is (= "Unknown Table" output))
      (is (= "" flushed)))))

(deftest ^:parallel resolve-entity-link-test
  (testing "resolves metabase://model links"
    (let [[output flushed] (process "[My Model](metabase://model/123)")]
      (is (= "[My Model](/model/123)" output))
      (is (= "" flushed))))

  (testing "resolves metabase://metric links"
    (let [[output flushed] (process "[Revenue](metabase://metric/456)")]
      (is (= "[Revenue](/metric/456)" output))
      (is (= "" flushed))))

  (testing "resolves metabase://dashboard links"
    (let [[output flushed] (process "[Sales Dashboard](metabase://dashboard/789)")]
      (is (= "[Sales Dashboard](/dashboard/789)" output))
      (is (= "" flushed))))

  (testing "resolves metabase://transform links"
    (let [[output flushed] (process "[My Transform](metabase://transform/42)")]
      (is (= "[My Transform](/data-studio/transforms/42)" output))
      (is (= "" flushed)))))

(deftest ^:parallel resolve-link-split-across-chunks-test
  (testing "resolves metabase:// link split across multiple chunks"
    (let [query (lib.tu/venues-query)
          [outputs flushed] (process-chunks ["Check [Results](metabase://" "query/split-query)"]
                                            {"split-query" query})]
      (is (= "Check " (first outputs)))
      (is (re-find #"\[Results\]\(/question#" (second outputs)))
      (is (= "" flushed)))))

(deftest ^:parallel multiple-links-in-text-test
  (testing "resolves multiple links in same chunk"
    (let [[output flushed] (process "[Model A](metabase://model/1) and [Model B](metabase://model/2)")]
      (is (= "[Model A](/model/1) and [Model B](/model/2)" output))
      (is (= "" flushed))))

  (testing "handles mix of resolvable and regular links"
    (let [[output flushed] (process "[Model](metabase://model/1) and [Google](https://google.com)")]
      (is (= "[Model](/model/1) and [Google](https://google.com)" output))
      (is (= "" flushed)))))

;;; Slack link resolution tests

(deftest resolve-slack-link-test
  (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
    (testing "resolves Slack-format metabase:// links"
      (let [[output flushed] (process "<metabase://model/123|My Model>")]
        (is (= "<https://metabase.example.com/model/123|My Model>" output))
        (is (= "" flushed))))

    (testing "resolves Slack link without link text"
      (let [[output flushed] (process "<metabase://dashboard/456>")]
        (is (= "<https://metabase.example.com/dashboard/456>" output))
        (is (= "" flushed))))))

(deftest ^:parallel resolve-slack-link-unresolvable-test
  (testing "falls back to link text for unresolvable Slack link"
    (let [[output flushed] (process "<metabase://query/unknown|My Query>")]
      (is (= "My Query" output))
      (is (= "" flushed)))))

(deftest slack-link-buffering-test
  (testing "buffers incomplete Slack-format links"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [[outputs flushed] (process-chunks ["Check <metabase://mod" "el/123|My Model>"])]
        (is (= "Check " (first outputs)))
        (is (re-find #"metabase\.example\.com/model/123" (second outputs)))
        (is (= "" flushed))))))

(deftest ^:parallel slack-link-no-buffering-regular-angle-brackets-test
  (testing "does NOT buffer regular < characters in the middle of text"
    (let [[output flushed] (process "x < y and z > w")]
      (is (= "x < y and z > w" output))
      (is (= "" flushed)))))

(deftest ^:parallel slack-link-split-prefix-lone-angle-bracket-test
  (testing "lone < at end followed by non-link text disambiguates on next chunk"
    (let [[outputs flushed] (process-chunks ["x <" " y"])]
      (is (= "x " (first outputs)))
      (is (= "< y" (second outputs)))
      (is (= "" flushed)))))

(deftest slack-link-split-prefix-test
  (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
    (testing "resolves link when prefix is split at various points"
      (doseq [[desc chunks] [["split after <"             ["Check <" "metabase://metric/123|My Metric>"]]
                             ["split after <m"            ["Check <m" "etabase://metric/123|My Metric>"]]
                             ["split after <meta"         ["Check <meta" "base://metric/123|My Metric>"]]
                             ["split after <metabase"     ["Check <metabase" "://metric/123|My Metric>"]]
                             ["split after <metabase:"    ["Check <metabase:" "//metric/123|My Metric>"]]
                             ["split after <metabase:/"   ["Check <metabase:/" "/metric/123|My Metric>"]]
                             ["split after <metabase://"  ["Check <metabase://" "metric/123|My Metric>"]]
                             ["split after <metabase://m" ["Check <metabase://m" "etric/123|My Metric>"]]]]
        (testing desc
          (let [[outputs flushed] (process-chunks chunks)]
            (is (= "Check " (first outputs))
                (str "should buffer partial prefix — " desc))
            (is (re-find #"metabase\.example\.com/metric/123" (apply str (rest outputs)))
                (str "should resolve link — " desc))
            (is (= "" flushed))))))))

(deftest slack-link-split-prefix-registry-and-inversion-test
  (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
    (testing "split-prefix Slack links are recorded in link registry and invertible"
      (let [[outputs flushed registry] (process-chunks-with-registry
                                        ["Check <metabase" "://metric/123|My Metric>"])
            resolved-output (apply str (conj outputs flushed))]
        (is (= {"https://metabase.example.com/metric/123" "metabase://metric/123"}
               registry))
        (is (= "Check <metabase://metric/123|My Metric>"
               (links/invert-slack-links resolved-output registry)))))))

(deftest mixed-link-formats-test
  (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
    (testing "resolves both markdown and Slack-format links in same text"
      (let [[output flushed] (process "[Model](/model/1) and <metabase://dashboard/2|Dashboard>")]
        (is (= "[Model](/model/1) and <https://metabase.example.com/dashboard/2|Dashboard>" output))
        (is (= "" flushed))))))

;;; Slack link registry recording tests

(deftest resolve-slack-link-records-in-registry-test
  (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
    (testing "records resolved Slack links in registry"
      (let [[_output _flushed registry] (process-with-registry "<metabase://model/123|My Model>")]
        (is (= {"https://metabase.example.com/model/123" "metabase://model/123"}
               registry))))

    (testing "records multiple Slack links in registry"
      (let [[_output _flushed registry] (process-with-registry
                                         "<metabase://model/1|A> and <metabase://dashboard/2|B>")]
        (is (= {"https://metabase.example.com/model/1"     "metabase://model/1"
                "https://metabase.example.com/dashboard/2" "metabase://dashboard/2"}
               registry))))))

(deftest ^:parallel resolve-slack-link-does-not-record-failed-in-registry-test
  (testing "does not record failed Slack resolutions in registry"
    (let [[_output _flushed registry] (process-with-registry "<metabase://query/unknown|Missing>")]
      (is (empty? registry)))))

;;; with-context tests

(deftest ^:parallel resolve-xf-records-link-registry-test
  (testing "resolve-xf records resolved links in link-registry-atom"
    (let [registry (atom {})
          parts    [{:type :text :text "[Model](metabase://model/1)"}
                    {:type :text :text " and [Dash](metabase://dashboard/2)"}]
          result   (into [] (mlb/resolve-xf {} {} registry) parts)]
      (is (= "[Model](/model/1)" (-> result first :text)))
      (is (= " and [Dash](/dashboard/2)" (-> result second :text)))
      (is (= {"/model/1"     "metabase://model/1"
              "/dashboard/2" "metabase://dashboard/2"}
             @registry)))))

(deftest ^:parallel resolve-xf-accumulates-queries-and-records-link-registry-test
  (testing "resolve-xf accumulates queries and records query link in registry"
    (let [registry (atom {})
          query    (lib.tu/venues-query)
          parts    [{:type :tool-output
                     :id "t1"
                     :result {:structured-output {:query-id "q1" :query query}}}
                    {:type :text :text "[Results](metabase://query/q1)"}]
          result   (into [] (mlb/resolve-xf {} {} registry) parts)]
      (is (re-find #"\[Results\]\(/question#" (-> result second :text)))
      (is (= 1 (count @registry)))
      (is (= "metabase://query/q1" (first (vals @registry)))))))

(deftest ^:parallel with-context-test
  (testing "updates state for subsequent link resolution"
    (let [registry (atom {})
          ;; First, link cannot be resolved
          state1 (mlb/with-context mlb/initial-state {} {} registry)
          [state2 output1] (mlb/step state1 "[Results](metabase://query/new-query)")
          _ (is (= "Results" output1))
          ;; Update state with the query
          query (lib.tu/venues-query)
          state3 (mlb/with-context state2 {"new-query" query} {} registry)
          ;; Now link can be resolved
          [state4 output2] (mlb/step state3 " See [More](metabase://query/new-query)")]
      (is (re-find #"\[More\]\(/question#" output2))
      (is (= "" (mlb/flush-state state4))))))
