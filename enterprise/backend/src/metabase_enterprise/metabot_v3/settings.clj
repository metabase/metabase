(ns metabase-enterprise.metabot-v3.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(def internal-metabot-uuid
  "The UUID of the internal Metabot instance."
  "b5716059-ad40-4d83-a4e1-673af020b2d8")

(def embedded-metabot-uuid
  "The UUID of the embedded Metabot instance."
  "c61bf5f5-1025-47b6-9298-bf1827105bb6")

(def internal-metabot-entity-id
  "The entity ID of the internal Metabot instance."
  "metabotmetabotmetabot")

(def embedded-metabot-entity-id
  "The entity ID of the embedded Metabot instance."
  "embeddedmetabotmetabo")

(defsetting ai-service-base-url
  (deferred-tru "URL for the a AI Service")
  :type       :string
  :encryption :no
  :default    "http://localhost:8000"
  :visibility :internal
  :export?    false
  :doc        false)

(defsetting site-uuid-for-metabot-tools
  "UUID that we use for encrypting JWT tokens given to the AI service to make callbacks with."
  :encryption :when-encryption-key-set
  :visibility :internal
  :sensitive? true
  :feature    :metabot-v3
  :doc        false
  :export?    false
  :base       setting/uuid-nonce-base)

(defsetting metabot-ai-service-token-ttl
  (deferred-tru "The number of seconds the tokens passed to AI service should be valid.")
  :type       :integer
  :visibility :settings-manager
  :default    180
  :feature    :metabot-v3
  :doc        false
  :export?    true
  :audit      :never)

(defsetting metabot-id
  (deferred-tru "Override Metabot ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :feature    :metabot-v3
  :encryption :no
  :export?    false
  :doc        false)

(defsetting metabot-enabled-use-cases
  (deferred-tru "List of enabled use case names for the internal Metabot.")
  :type       :json
  :visibility :public
  :feature    :metabot-v3
  :export?    false
  :doc        false
  :setter     :none
  :getter     (fn []
                (when-let [metabot (t2/select-one :model/Metabot :entity_id internal-metabot-entity-id)]
                  (->> (t2/select :model/MetabotUseCase :metabot_id (:id metabot) :enabled true)
                       (map :name)))))
