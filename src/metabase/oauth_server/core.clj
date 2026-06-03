(ns metabase.oauth-server.core
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.oauth-server.store :as store]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [oidc-provider.core :as oidc]))

(set! *warn-on-reflection* true)

;; Cache holds `{:site-url <string>, :provider <Provider>}`. Every endpoint baked into the provider config is
;; derived from the Site URL (see [[build-provider-config]]), so a changed Site URL must rebuild the provider --
;; otherwise discovery keeps advertising the stale issuer/endpoints (e.g. http:// behind a TLS-terminating proxy
;; after the operator corrects Site URL to https://).
(defonce ^:private provider (atom nil))

(defn all-agent-scopes
  "All supported OAuth scopes derived from defendpoint metadata on the agent API."
  []
  (into []
        (comp (keep #(get-in % [:form :metadata :scope]))
              (filter string?)
              (distinct))
        (vals (api.macros/ns-routes 'metabase.agent-api.api))))

(defn- build-provider-config
  "Build the configuration map for the OAuth provider from Metabase settings."
  []
  (let [base-url (system/site-url)]
    {:issuer                         base-url
     :authorization-endpoint         (str base-url "/oauth/authorize")
     :token-endpoint                 (str base-url "/oauth/token")
     :registration-endpoint          (str base-url "/oauth/register")
     :revocation-endpoint            (str base-url "/oauth/revoke")
     :access-token-ttl-seconds       (oauth-settings/oauth-server-access-token-ttl)
     :authorization-code-ttl-seconds (oauth-settings/oauth-server-authorization-code-ttl)
     :refresh-token-ttl-seconds      (oauth-settings/oauth-server-refresh-token-ttl)
     :client-store                   (store/create-client-store)
     :code-store                     (store/create-authorization-code-store)
     :token-store                    (store/create-token-store)
     :scopes-supported               (all-agent-scopes)
     :rotate-refresh-tokens          true}))

(defn- create-provider
  "Create a new OAuth provider instance."
  []
  (oidc/create-provider (build-provider-config)))

(defn get-provider
  "Returns the current provider instance, (re)creating it when absent or when the Site URL has changed."
  []
  (let [site-url (system/site-url)]
    (:provider
     (swap! provider
            (fn [cached]
              (if (and cached (= (:site-url cached) site-url))
                cached
                {:site-url site-url, :provider (create-provider)}))))))

(defn reset-provider!
  "Reset the provider cache to nil. Useful for testing."
  []
  (reset! provider nil))

(defn extract-bearer-token
  "Extract the bearer token from the Authorization header of a Ring request."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (u/lower-case-en auth) "bearer ")
      (str/trim (subs auth 7)))))
