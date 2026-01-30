(ns metabase.llm.settings
  "Settings for OSS LLM integration."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting llm-anthropic-api-key
  (deferred-tru "Anthropic API key for AI-assisted SQL generation.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export? false
  :setter     (fn [new-value]
                (let [trimmed (when (string? new-value)
                                (not-empty (str/trim new-value)))]
                  (when (and trimmed (not (str/starts-with? trimmed "sk-ant-")))
                    (throw (ex-info (tru "Invalid Anthropic API key format. Key must start with ''sk-ant-''.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :string :llm-anthropic-api-key trimmed)))
  :doc false)

(defsetting llm-anthropic-model
  (deferred-tru "Anthropic model for AI-assisted SQL generation.")
  :encryption :no
  :visibility :settings-manager
  :default "claude-opus-4-5-20251101"
  :export? false
  :doc false)

(defsetting llm-anthropic-api-url
  (deferred-tru "Anthropic Base API URL for AI-assisted SQL generation.")
  :encryption :no
  :visibility :internal
  :default "https://api.anthropic.com"
  :export? false
  :doc false)

(defsetting llm-anthropic-api-version
  (deferred-tru "Anthropic API version for AI-assisted SQL generation.")
  :encryption :no
  :visibility :internal
  :default "2023-06-01"
  :export? false
  :doc false)

(defsetting llm-max-tokens
  (deferred-tru "Maximum tokens for LLM responses.")
  :type :integer
  :default 4096
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-request-timeout-ms
  (deferred-tru "Socket timeout in milliseconds for LLM API requests.")
  :type :integer
  :default 60000
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-connection-timeout-ms
  (deferred-tru "Connection timeout in milliseconds for LLM API requests.")
  :type :integer
  :default 5000
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-rate-limit-per-user
  (deferred-tru "Maximum SQL generation requests per user per minute.")
  :type :integer
  :default 20
  :visibility :settings-manager
  :export? false
  :doc false)

(defsetting llm-rate-limit-per-ip
  (deferred-tru "Maximum SQL generation requests per IP address per minute.")
  :type :integer
  :default 100
  :visibility :settings-manager
  :export? false
  :doc false)

(defn llm-enabled?
  "Returns true if LLM SQL generation is enabled (i.e., an Anthropic API key is configured)."
  []
  (some? (llm-anthropic-api-key)))

(defsetting llm-sql-generation-enabled
  (deferred-tru "Whether AI-assisted SQL generation is enabled.")
  :visibility :public
  :type       :boolean
  :setter     :none
  :export?    false
  :getter     (fn [] (or (llm-enabled?) (premium-features/enable-metabot-v3?))))
