(ns metabase.channel.rest.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.channel.rest.api.channel]
   [metabase.channel.rest.api.email]
   [metabase.channel.rest.api.slack]))

(comment metabase.channel.rest.api.channel/keep-me
         metabase.channel.rest.api.email/keep-me
         metabase.channel.rest.api.slack/keep-me)

(def ^{:arglists '([request respond raise])} channel-routes
  "/api/channel routes"
  (api.macros/ns-handler 'metabase.channel.rest.api.channel))

(def ^{:arglists '([request respond raise])} email-routes
  "/api/email routes"
  (api.macros/ns-handler 'metabase.channel.rest.api.email))

(def ^{:arglists '([request respond raise])} slack-routes
  "/api/slack routes"
  (api.macros/ns-handler 'metabase.channel.rest.api.slack))
