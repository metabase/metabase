(ns metabase.metabot.settings
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(defsetting openai-model
  (deferred-tru "The OpenAI Model (e.g. 'gpt-4', 'gpt-3.5-turbo')")
  :visibility :settings-manager
  :default "gpt-4")

(defsetting openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :visibility :settings-manager)

(defsetting openai-organization
  (deferred-tru "The OpenAI Organization ID.")
  :visibility :settings-manager)

(defsetting metabot-get-prompt-templates-url
  (deferred-tru "The URL in which metabot versioned prompt templates are stored.")
  :visibility :settings-manager
  :default "https://stkxezsr2kcnkhusi3fgcc5nqm0ttgfx.lambda-url.us-east-1.on.aws/")

(defsetting metabot-feedback-url
  (deferred-tru "The URL to which metabot feedback is posted.")
  :visibility :settings-manager
  :default "https://amtix3l3qvitb2qxstaqtcoqby0monuf.lambda-url.us-east-1.on.aws/")

(defsetting is-metabot-enabled
  (deferred-tru "Is Metabot enabled?")
  :type :boolean
  :visibility :authenticated
  :default false)

(defsetting num-metabot-choices
  (deferred-tru "Number of potential responses metabot will request. The first valid response is selected.")
  :type :integer
  :visibility :internal
  :default 3)

(def ^:private memoized-fetch-openai-models
  (memoize/ttl
   ^{::memoize/args-fn (fn [[api-key organization]] [api-key organization])}
   (fn [api-key organization]
     (try
       (->> (openai.api/list-models
             {:api-key      api-key
              :organization organization})
            :data
            (map #(select-keys % [:id :owned_by]))
            (sort-by :id))
       (catch Exception _
         (log/warn "Unable to fetch openai models.")
         [])))
   :ttl/threshold (* 1000 60 60 24)))

(defsetting openai-available-models
  (deferred-tru "List available openai models.")
  :visibility :settings-manager
  :type :json
  :setter :none
  :getter (fn []
            (if (and
                 (is-metabot-enabled)
                 (openai-api-key)
                 (openai-organization))
              (memoized-fetch-openai-models
               (openai-api-key)
               (openai-organization))
              [])))
