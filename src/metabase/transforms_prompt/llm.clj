(ns metabase.transforms-prompt.llm
  "Per-row LLM evaluation for `:prompt` transform expressions."
  (:require
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]))

(set! *warn-on-reflection* true)

(def ^:private system-prompt
  "You are evaluated once per row in a data pipeline. Reply with only the requested value.")

(defn- wrap-schema
  [json-schema]
  {:type                 "object"
   :properties           {"value" json-schema}
   :required             ["value"]
   :additionalProperties false})

(defn evaluate-prompt
  "Return the LLM's answer for rendered `prompt-text` using `output` from [[metabase.lib.core/prompt-output]].

  Returns the raw `:value` from the wrapped schema. Coercion happens in the runner.
  Does not send a `:request-id`, so a transform run does not emit one analytics event per row."
  [prompt-text output]
  (when (some? prompt-text)
    (:value (metabot.self/call-llm-structured
             (metabot.settings/llm-mini-model)
             [{:role "system" :content system-prompt}
              {:role "user" :content (str prompt-text)}]
             (wrap-schema (:json-schema output))
             0.0
             (if (:json-text? output) 2048 512)
             {:source               "transform_prompt"
              :tag                  "transform-prompt"
              :required-permission  :permission/metabot-other-tools}))))
