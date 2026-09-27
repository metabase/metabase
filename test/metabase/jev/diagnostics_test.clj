(ns metabase.jev.diagnostics-test
  (:require [clojure.test :refer [deftest is]]
            [metabase.jev.diagnostics :as diagnostics]))

(deftest large-stream-summary-is-bounded-test
  (let [parts (into (vec (repeat 10000 {:type :reasoning :text "private reasoning"}))
                    [{:type :tool-input :function "read_resource" :arguments {:secret "private argument"}}
                     {:type :tool-output :error {:message "private error"}}
                     {:type :usage :usage {:promptTokens 9000 :completionTokens 1000}}])
        summary (diagnostics/step-summary parts)]
    (is (= 10003 (:stream-parts summary)))
    (is (= 10000 (:reasoning-chunks summary)))
    (is (= 170000 (:reasoning-chars summary)))
    (is (= ["read_resource"] (:tools summary)))
    (is (= 1 (:tool-errors summary)))
    (is (= {:promptTokens 9000 :completionTokens 1000} (:provider-cumulative-usage summary)))
    (is (< (count (pr-str summary)) 500))
    (is (not (re-find #"private" (pr-str summary))))))

(deftest missing-usage-is-not-zero-test
  (is (nil? (:provider-cumulative-usage (diagnostics/step-summary [])))))

(deftest request-size-reconciles-test
  (let [body {:model "test" :system "Résumé"
              :messages [{:role "assistant" :content [{:type "thinking" :thinking "private"}
                                                      {:type "tool_use" :id "1" :name "read_resource" :input {}}]}
                         {:role "user" :content [{:type "tool_result" :tool_use_id "1" :content "private result"}]}]
              :tools [{:name "read_resource" :input_schema {:type "object"}}]}
        summary (diagnostics/request-summary body)]
    (is (= (:body-bytes summary) (+ (:framing-bytes summary) (reduce + (vals (:member-bytes summary))))))
    (is (= "read_resource" (get-in summary [:message-bytes 1 :blocks 0 :tool])))
    (is (not (re-find #"private" (pr-str summary))))
    (binding [diagnostics/*requests* (atom []) diagnostics/*capture-requests* true]
      (dotimes [_ 15] (diagnostics/capture-request! "test" body))
      (is (= 12 (count @diagnostics/*requests*)))
      (is (= body (:request (last @diagnostics/*requests*)))))))
