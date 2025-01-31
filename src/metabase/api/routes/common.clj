(ns metabase.api.routes.common
  "Shared helpers used by [[metabase.api.routes/routes]] as well as premium-only routes
  like [[metabase-enterprise.sandbox.api.routes/routes]]."
  (:require
   [metabase.api.open-api :as open-api]
   [metabase.server.core :as server]))

;;; these use vars rather than plain functions so changes to the underlying functions get propagated during REPL usage.

(defn wrap-middleware-for-open-api-spec-generation
  "Wrap Ring middleware so the resulting function supports [[open-api/open-api-spec]]."
  [middleware]
  (fn [handler]
    (open-api/handler-with-open-api-spec
     (middleware handler)
     (fn [prefix]
       (open-api/open-api-spec handler prefix)))))

(def ^{:arglists '([handler])} +public-exceptions
  "Wrap `routes` so any Exception except 404 thrown is just returned as a generic 400, to prevent details from leaking
  in public endpoints."
  (wrap-middleware-for-open-api-spec-generation server/public-exceptions))

(def ^{:arglists '([handler])} +message-only-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a 400 with only the message from the original
  Exception (i.e., remove the original stacktrace), to prevent details from leaking in public endpoints."
  (wrap-middleware-for-open-api-spec-generation server/message-only-exceptions))

(def ^{:arglists '([handler])} +static-apikey
  "Wrap `routes` so they may only be accessed with a correct API key header."
  (wrap-middleware-for-open-api-spec-generation server/enforce-static-api-key))

(def ^{:arglists '([handler])} +auth
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  (wrap-middleware-for-open-api-spec-generation server/enforce-authentication))
