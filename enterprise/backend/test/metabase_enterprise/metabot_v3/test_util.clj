(ns metabase-enterprise.metabot-v3.test-util
  (:require
   [metabase.util.json :as json]))

(defn parts->aisdk-chunks
  "Convert simple test parts to AI SDK v5 chunks (what self/claude returns).
  Accepts parts like {:type :text :text \"Hello\"} or {:type :tool-input :id \"t1\" :function \"search\" :arguments {...}}
  and returns AI SDK v5 chunks that tool-executor-xf and aisdk-xf can process."
  [parts]
  (let [msg-id (str "msg-" (random-uuid))]
    (concat
     ;; start message
     [{:type :start :messageId msg-id}]
     ;; content chunks for each part
     (mapcat
      (fn [{:keys [type text id function arguments]}]
        (let [chunk-id (or id (str "chunk-" (random-uuid)))]
          (case type
            :text
            [{:type :text-start :id chunk-id}
             {:type :text-delta :id chunk-id :delta text}
             {:type :text-end :id chunk-id}]

            :tool-input
            [{:type :tool-input-start :toolCallId chunk-id :toolName function}
             {:type :tool-input-delta :toolCallId chunk-id :inputTextDelta (json/encode arguments)}
             {:type :tool-input-available :toolCallId chunk-id :toolName function}]

            ;; Default: skip unknown types
            [])))
      parts)
     ;; usage
     [{:type :usage :usage {:promptTokens 10 :completionTokens 50} :id msg-id}])))

(defn mock-llm-response
  "Create a mock LLM response (reducible) with given parts in AI SDK v5 format."
  [parts]
  (let [aisdk-chunks (parts->aisdk-chunks parts)]
    ;; Return a reducible that yields the chunks
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce rf init aisdk-chunks)))))
