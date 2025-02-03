(ns metabase.channel.api
  "Not sure if this namespace is really adding a lot of value versus us just directly embedding these handlers directly
  in [[metabase.api.routes/routes]]."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.channel.api.channel]
   [metabase.channel.api.email]))

(comment metabase.channel.api.channel/keep-me
         metabase.channel.api.email/keep-me)

(def ^{:arglists '([request respond raise])} channel-routes
  "/api/channel routes"
  (api.macros/ns-handler 'metabase.channel.api.channel))

(def ^{:arglists '([request respond raise])} email-routes
  "/api/email routes"
  (api.macros/ns-handler 'metabase.channel.api.email))
