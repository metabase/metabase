(ns metabase-enterprise.sso.api.oidc-identities
  "`/api/ee/sso/oidc-identities`: the current user's links to the enabled OIDC providers."
  (:require
   [metabase-enterprise.sso.db :as sso.db]
   [metabase-enterprise.sso.providers.oidc :as sso.providers.oidc]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.system.core :as system]))

(set! *warn-on-reflection* true)

;; GET /api/ee/sso/oidc-identities
(api.macros/defendpoint :get "/" :- [:sequential [:map {:closed true}
                                                  [:key          :string]
                                                  [:login-prompt [:maybe :string]]
                                                  [:sso-url      :string]
                                                  [:linked       :boolean]]]
  "The enabled OIDC providers, and whether the current user's account is linked to an identity at each."
  []
  (let [providers (filter :enabled (sso-settings/oidc-providers))
        pnames    (into {} (map (juxt :key (comp sso.providers.oidc/identity-provider-name :key))) providers)
        linked    (sso.db/auth-identity-providers api/*current-user-id* (vec (vals pnames)))]
    (for [{provider-key :key :as provider} providers]
      {:key          provider-key
       :login-prompt (:login-prompt provider)
       :sso-url      (str (system/site-url) "/auth/sso/" provider-key)
       :linked       (contains? linked (pnames provider-key))})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/sso/oidc-identities` routes."
  (api.macros/ns-handler *ns* +auth))
