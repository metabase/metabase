(ns metabase.api.routes
  (:require [clojure.tools.logging :as log]
            [compojure.core :as compojure]
            [compojure.route :as route]
            [metabase.api.routes.lazy :as lazy]
            [metabase.config :as config]
            [metabase.plugins.classloader :as classloader]
            [metabase.server.middleware.auth :as middleware.auth]
            [metabase.server.middleware.exceptions :as middleware.exceptions]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru]]))

(def ^:private +generic-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a generic 400, to prevent details from leaking in public
  endpoints."
  middleware.exceptions/genericize-exceptions)

(def ^:private +message-only-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a 400 with only the message from the original
  Exception (i.e., remove the original stacktrace), to prevent details from leaking in public endpoints."
  middleware.exceptions/message-only-exceptions)

(def ^:private +apikey
  "Wrap `routes` so they may only be accessed with a correct API key header."
  middleware.auth/enforce-api-key)

(def ^:private +auth
  "Wrap `handler` so it may only be accessed with proper authentication credentials."
  middleware.auth/enforce-authentication)

(defn- pass-thru-handler
  "A no-op handler that always passes thru to the next handler."
  [_ respond _]
  (respond nil))

(defn- +enable-for-testing
  "Wrap `handler` so it is only enabled for non-prod run configs, or if env var `MB_ENABLE_TEST_ENDPOINTS` is truthy."
  [handler]
  (if (or (not config/is-prod?)
          (config/config-bool :mb-enable-test-endpoints))
    handler
    pass-thru-handler))

(def ^:private lazy-ee-handler
  "Lazy handler that attempts to load the EE-specific routes on the first request."
  (lazy/handler
   (fn []
     (or (u/ignore-exceptions
           (classloader/require 'metabase-enterprise.sandbox.api.routes)
           (log/trace "Lazy-loaded Metabase Enterprise API routes")
           (resolve 'metabase-enterprise.sandbox.api.routes/routes) var-get)
         pass-thru-handler))))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for API endpoints."
  (compojure/routes
   lazy-ee-handler
   (lazy/routes metabase.api
    (+auth activity)
    (+auth alert)
    (+auth automagic-dashboards)
    (+auth card)
    (+auth collection)
    (+auth dashboard)
    (+auth database)
    (+auth dataset)
    (+auth email)
    (+message-only-exceptions embed)
    (+auth field)
    geojson
    (+auth ldap)
    (+auth login-history)
    (+auth metastore)
    (+auth metric)
    (+auth native-query-snippet)
    (+apikey notify)
    (+auth permissions)
    (+auth preview-embed)
    (+generic-exceptions public)
    (+auth pulse)
    (+auth revision)
    (+auth search)
    (+auth segment)
    session
    (+auth setting)
    setup
    (+auth slack)
    (+auth table)
    (+auth task)
    (+enable-for-testing testing)
    (+auth tiles)
    (+auth transform)
    (+auth user)
    util)
   (route/not-found (constantly {:status 404, :body (deferred-tru "API endpoint does not exist.")}))))
