(ns metabase.api.routes.common
  "Shared helpers used by [[metabase.api.routes/routes]] as well as premium-only routes
  like [[metabase-enterprise.sandbox.api.routes/routes]]."
  (:require [metabase.server.middleware.auth :as middleware.auth]
            [metabase.server.middleware.exceptions :as middleware.exceptions]))

(def +generic-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a generic 400, to prevent details from leaking in public
  endpoints."
  middleware.exceptions/genericize-exceptions)

(def +message-only-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a 400 with only the message from the original
  Exception (i.e., remove the original stacktrace), to prevent details from leaking in public endpoints."
  middleware.exceptions/message-only-exceptions)

(def +apikey
  "Wrap `routes` so they may only be accessed with a correct API key header."
  middleware.auth/enforce-api-key)

(def +auth
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  middleware.auth/enforce-authentication)
