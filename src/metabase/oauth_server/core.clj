(ns metabase.oauth-server.core
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.system :as system]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn all-agent-scopes
  "All supported OAuth scopes derived from defendpoint metadata on the agent API."
  []
  (into []
        (comp (keep #(get-in % [:form :metadata :scope]))
              (filter string?)
              (distinct))
        (vals (api.macros/ns-routes 'metabase.agent-api.api))))

(defn get-provider
  "Returns the current provider instance from the integrant system, starting it if needed."
  []
  (system/get-provider))

(defn reset-provider!
  "Reset the OAuth provider by stopping the integrant system. For use in tests."
  []
  (system/reset-system!))

(defn extract-bearer-token
  "Extract the bearer token from the Authorization header of a Ring request."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (u/lower-case-en auth) "bearer ")
      (str/trim (subs auth 7)))))
