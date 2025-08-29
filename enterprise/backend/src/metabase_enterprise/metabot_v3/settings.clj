(ns metabase-enterprise.metabot-v3.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(defsetting ai-service-base-url
  (deferred-tru "URL for the a AI Service")
  :type       :string
  :encryption :no
  :default    "http://localhost:8000"
  :visibility :internal
  :export?    false)

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
  :export?    false)

(defsetting ai-service-profile-id
  (deferred-tru "Override Metabot profile ID for agent streaming requests.")
  :type       :string
  :visibility :internal
  :feature    :metabot-v3
  :encryption :no
  :export?    false)

(defsetting metabot-feature-enabled
  (deferred-tru "Enable or disable the Metabot feature entirely.")
  :type       :boolean
  :visibility :admin
  :default    true
  :feature    :metabot-v3
  :doc        false
  :export?    false)

(defn +require-metabot-enabled
  "Middleware that ensures Metabot feature is enabled before allowing request to proceed."
  [handler]
  (fn [request respond raise]
    (if (metabot-feature-enabled)
      (handler request respond raise)
      (respond {:status 403
                :body   {:message (tru "Metabot is disabled.")}}))))

(defn assert-metabot-enabled!
  "Throws a 403 error if Metabot feature is disabled. Use this for inline validation."
  []
  (when-not (metabot-feature-enabled)
    (throw (ex-info (tru "Metabot is disabled.")
                    {:status-code 403}))))

(defn assert-metabot-enabled-for-non-admins!
  "Throws a 403 error if Metabot feature is disabled AND user is not an admin.
   Admins can access even when feature is disabled."
  [is-admin?]
  (when (and (not (metabot-feature-enabled))
             (not is-admin?))
    (throw (ex-info (tru "Metabot is disabled.")
                    {:status-code 403}))))
