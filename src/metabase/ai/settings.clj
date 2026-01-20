(ns metabase.ai.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ai-openai-api-key
  (deferred-tru "OpenAI API key for AI summaries. Configure via MB_AI_OPENAI_API_KEY.")
  :encryption :when-encryption-key-set
  :visibility :internal
  :audit      :getter
  :export?    false)

(defsetting ai-openai-model
  (deferred-tru "OpenAI model name for AI summaries. Configure via MB_AI_OPENAI_MODEL (default: gpt-4o-mini).")
  :type       :string
  :default    "gpt-4o-mini"
  :visibility :internal
  :audit      :getter
  :export?    false)

(defsetting ai-openai-available?
  (deferred-tru "Whether AI summaries are available (requires MB_AI_OPENAI_API_KEY).")
  :type       :boolean
  :visibility :public
  :getter     #(boolean (seq (ai-openai-api-key)))
  :setter     :none
  :doc        false)
