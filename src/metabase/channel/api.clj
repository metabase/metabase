(ns metabase.channel.api
  "Not sure if this namespace is really adding a lot of value versus us just directly embedding these `lazy-ns-handler`
  forms directly in [[metabase.api.routes/routes]]."
  (:require
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} channel-routes
  "/api/channel routes"
  (handlers/lazy-ns-handler 'metabase.channel.api.channel))

(def ^{:arglists '([request respond raise])} email-routes
  "/api/email routes"
  (handlers/lazy-ns-handler 'metabase.channel.api.email))
