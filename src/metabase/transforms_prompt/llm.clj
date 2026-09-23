(ns metabase.transforms-prompt.llm
  "Per-row LLM evaluation for `:prompt` transform expressions."
  (:require
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]))

(set! *warn-on-reflection* true)

(def ^:private value-schema
  {:type       "object"
   :properties {:value {:type "string"}}
   :required   ["value"]})

(def ^:private system-prompt
  "You are evaluated once per row in a data pipeline. Reply with only the requested value.")

(defn evaluate-prompt
  "Return the LLM's answer for rendered `prompt-text`, or nil when `prompt-text` is nil.

  Does not send a `:request-id`, so a transform run does not emit one analytics event per row."
  [prompt-text]
  (when (some? prompt-text)
    (:value (metabot.self/call-llm-structured
             (metabot.settings/llm-mini-model)
             [{:role "system" :content system-prompt}
              {:role "user" :content (str prompt-text)}]
             value-schema
             0.0
             512
             {:source               "transform_prompt"
              :tag                  "transform-prompt"
              :required-permission  :permission/metabot-other-tools}))))
