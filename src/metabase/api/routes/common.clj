(ns metabase.api.routes.common
  "Shared helpers used by [[metabase.api.routes/routes]] as well as premium-only routes
  like [[metabase-enterprise.sandbox.api.routes/routes]]."
  (:require
   [metabase.api.open-api :as handlers.protocols]
   [metabase.server.core :as server]))

(defn +public-exceptions
  "Wrap `handler` so any Exception except 404 thrown is just returned as a generic 400, to prevent details from leaking
  in public endpoints."
  [handler]
  (handlers.protocols/handler-with-open-api-spec
   (server/public-exceptions handler)
   (partial handlers.protocols/open-api-spec handler)))

(defn +message-only-exceptions
  "Wrap `hander` so any Exception thrown is just returned as a 400 with only the message from the original
  Exception (i.e., remove the original stacktrace), to prevent details from leaking in public endpoints."
  [handler]
  (handlers.protocols/handler-with-open-api-spec
   (server/message-only-exceptions handler)
   (partial handlers.protocols/open-api-spec handler)))

(defn +static-apikey
  "Wrap `hander` so they may only be accessed with a correct API key header."
  [handler]
  (handlers.protocols/handler-with-open-api-spec
   (server/enforce-static-api-key handler)
   (partial handlers.protocols/open-api-spec handler)))

(defn +auth
  "Wrap `hander` so they may only be accessed with proper authentication credentials."
  [handler]
  (handlers.protocols/handler-with-open-api-spec
   (server/enforce-authentication handler)
   (partial handlers.protocols/open-api-spec handler)))
