(ns metabase-enterprise.metabot-v3.agent.markdown-link-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.markdown-link-buffer :as mlb]))

(defn- process
  "Process text through a fresh state with given queries/charts context.
   Returns [output flushed]."
  ([text] (process text {} {}))
  ([text queries] (process text queries {}))
  ([text queries charts]
   (let [[state output] (mlb/step (mlb/with-context mlb/initial-state queries charts) text)]
     [output (mlb/flush-state state)])))

(defn- process-chunks
  "Process multiple chunks through state, returns [outputs flushed]."
  ([chunks] (process-chunks chunks {} {}))
  ([chunks queries] (process-chunks chunks queries {}))
  ([chunks queries charts]
   (loop [state (mlb/with-context mlb/initial-state queries charts)
          [chunk & more] chunks
          outputs []]
     (if chunk
       (let [[new-state output] (mlb/step state chunk)]
         (recur new-state more (conj outputs output)))
       [outputs (mlb/flush-state state)]))))

;;; State machine / buffering tests

(deftest nested-bracket-handling-test
  (testing "does not drop characters when nested brackets appear"
    (let [[output flushed] (process "[foo[")]
      (is (= "[foo" output))
      (is (= "[" flushed)))))

(deftest basic-text-passthrough-test
  (testing "passes through plain text unchanged"
    (let [[output flushed] (process "Hello world")]
      (is (= "Hello world" output))
      (is (= "" flushed)))))

(deftest buffering-incomplete-link-test
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

(deftest regular-url-passthrough-test
  (testing "passes through regular URLs unchanged"
    (let [[output flushed] (process "[Google](https://google.com)")]
      (is (= "[Google](https://google.com)" output))
      (is (= "" flushed)))))

;;; metabase:// link resolution tests

(def RESOLVED-LINK-RE #"\[Results\]\(/question#[a-zA-ZZ0-9=]+\)")

(deftest resolve-query-link-test
  (testing "resolves metabase://query links using queries-state"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          [output flushed] (process "[Results](metabase://query/q-123)" {"q-123" query})]
      (is (=? RESOLVED-LINK-RE output))
      (is (not (re-find #"metabase://" output)))
      (is (= "" flushed))))

  (testing "falls back to link text for unknown query"
    (let [[output flushed] (process "[Results](metabase://query/unknown)")]
      (is (= "Results" output))
      (is (= "" flushed))))

  (testing "incomplete chunks are also replaced well"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          [output flushed] (process-chunks ["Your [Res" "ults](metabase://qu" "ery/q-123)"] {"q-123" query})]
      (is (=? ["Your " "" RESOLVED-LINK-RE] output))
      (is (= "" flushed)))))

(deftest resolve-chart-link-test
  (testing "resolves metabase://chart links using charts-state"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          queries {"q-456" query}
          charts {"c-789" {:query-id "q-456" :chart-type :bar}}
          [output flushed] (process "[My Chart](metabase://chart/c-789)" queries charts)]
      (is (re-find #"\[My Chart\]\(/question#" output))
      (is (not (re-find #"metabase://" output)))
      (is (= "" flushed))))

  (testing "falls back to link text for unknown chart"
    (let [[output flushed] (process "[Chart](metabase://chart/unknown)")]
      (is (= "Chart" output))
      (is (= "" flushed)))))

(deftest resolve-entity-link-test
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

  (testing "resolves metabase://table links"
    (let [[output flushed] (process "[Users Table](metabase://table/42)")]
      (is (= "[Users Table](/table/42)" output))
      (is (= "" flushed)))))

(deftest resolve-link-split-across-chunks-test
  (testing "resolves metabase:// link split across multiple chunks"
    (let [query {:database 1 :type :query :query {:source-table 1}}
          [outputs flushed] (process-chunks ["Check [Results](metabase://" "query/split-query)"]
                                            {"split-query" query})]
      (is (= "Check " (first outputs)))
      (is (re-find #"\[Results\]\(/question#" (second outputs)))
      (is (= "" flushed)))))

(deftest multiple-links-in-text-test
  (testing "resolves multiple links in same chunk"
    (let [[output flushed] (process "[Model A](metabase://model/1) and [Model B](metabase://model/2)")]
      (is (= "[Model A](/model/1) and [Model B](/model/2)" output))
      (is (= "" flushed))))

  (testing "handles mix of resolvable and regular links"
    (let [[output flushed] (process "[Model](metabase://model/1) and [Google](https://google.com)")]
      (is (= "[Model](/model/1) and [Google](https://google.com)" output))
      (is (= "" flushed)))))

;;; with-context tests

(deftest with-context-test
  (testing "updates state for subsequent link resolution"
    (let [;; First, link cannot be resolved
          state1 (mlb/with-context mlb/initial-state {} {})
          [state2 output1] (mlb/step state1 "[Results](metabase://query/new-query)")
          _ (is (= "Results" output1))
          ;; Update state with the query
          query {:database 1 :type :query :query {:source-table 1}}
          state3 (mlb/with-context state2 {"new-query" query} {})
          ;; Now link can be resolved
          [state4 output2] (mlb/step state3 " See [More](metabase://query/new-query)")]
      (is (re-find #"\[More\]\(/question#" output2))
      (is (= "" (mlb/flush-state state4))))))
